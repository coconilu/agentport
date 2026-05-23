import path from "node:path";
import fs from "node:fs";
import type { CanonicalConfig, McpServer, EnvValue } from "../ir/types.js";
import { emptyConfig } from "../ir/types.js";
import { parseClaudeEnv, renderClaude, isPureLiteral, asLiteralString } from "../ir/envValue.js";
import { readJsonSafe, writeFileWithBackup, exists } from "./util.js";
import { paths, type ResolveOptions } from "./paths.js";
import { scanAgents, scanCommandFiles, scanSkillDirs, scanPluginDir, readPluginMeta } from "./scanFs.js";

interface ClaudeMcpRaw {
  command?: string;
  args?: string[];
  url?: string;
  type?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

interface ClaudeMcpFile {
  mcpServers?: Record<string, ClaudeMcpRaw>;
}

interface ClaudeSettings {
  mcpServers?: Record<string, ClaudeMcpRaw>;
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;
  model?: string;
}

function inferTransport(raw: ClaudeMcpRaw): "stdio" | "http" | "sse" {
  if (raw.url) return raw.url.includes("sse") ? "sse" : "http";
  return "stdio";
}

function mcpFromRaw(raw: ClaudeMcpRaw): McpServer {
  const server: McpServer = { transport: inferTransport(raw) };
  if (raw.command) server.command = raw.command;
  if (raw.args) server.args = [...raw.args];
  if (raw.url) server.url = raw.url;
  if (raw.env) {
    server.env = {};
    for (const [k, v] of Object.entries(raw.env)) server.env[k] = parseClaudeEnv(v);
  }
  if (raw.headers) {
    server.headers = {};
    for (const [k, v] of Object.entries(raw.headers)) server.headers[k] = parseClaudeEnv(v);
  }
  return server;
}

function mcpToRaw(server: McpServer): ClaudeMcpRaw {
  const raw: ClaudeMcpRaw = {};
  if (server.command) raw.command = server.command;
  if (server.args) raw.args = [...server.args];
  if (server.url) raw.url = server.url;
  if (server.env) {
    raw.env = {};
    for (const [k, v] of Object.entries(server.env)) raw.env[k] = renderClaude(v);
  }
  if (server.headers) {
    raw.headers = {};
    for (const [k, v] of Object.entries(server.headers)) raw.headers[k] = renderClaude(v);
  }
  return raw;
}

export function readClaude(opts: ResolveOptions = {}): CanonicalConfig {
  const p = paths("claude-code", opts);
  const config = emptyConfig();

  // Read MCP from .mcp.json (project), .claude.json (global alt), settings.json
  const projectMcp = path.join(p.projectDir, "..", ".mcp.json");
  const settingsFile = path.join(p.projectDir, "settings.json");
  const globalSettings = path.join(p.globalDir, "settings.json");
  const globalMcpAlt = path.join(p.globalDir, "..", ".claude.json");

  for (const file of [globalMcpAlt, globalSettings, projectMcp, settingsFile]) {
    if (!exists(file)) continue;
    const data = readJsonSafe<ClaudeMcpFile & ClaudeSettings>(file);
    if (!data) continue;
    if (data.mcpServers) {
      for (const [name, raw] of Object.entries(data.mcpServers)) {
        config.mcpServers[name] = mcpFromRaw(raw);
      }
    }
    if (data.hooks) {
      for (const [event, entries] of Object.entries(data.hooks)) {
        for (const entry of entries) {
          for (const hook of entry.hooks ?? []) {
            config.hooks.push({ event, matcher: entry.matcher, command: hook.command });
          }
        }
      }
    }
    if (data.model) config.settings.model = data.model;
  }

  // Read rules: project CLAUDE.md takes precedence, then global
  const projectRulesA = path.join(p.projectDir, "..", "CLAUDE.md");
  const projectRulesB = path.join(p.projectDir, "CLAUDE.md");
  const globalRules = path.join(p.globalDir, "CLAUDE.md");
  if (exists(projectRulesA)) {
    config.rules.push({ scope: "project", body: fs.readFileSync(projectRulesA, "utf8") });
  } else if (exists(projectRulesB)) {
    config.rules.push({ scope: "project", body: fs.readFileSync(projectRulesB, "utf8") });
  }
  if (exists(globalRules)) {
    config.rules.push({ scope: "global", body: fs.readFileSync(globalRules, "utf8") });
  }

  // Agents / Skills / Commands — directory-based resources
  config.agents.push(...scanAgents(path.join(p.globalDir, "agents"), { scope: "global" }));
  config.agents.push(...scanAgents(path.join(p.projectDir, "agents"), { scope: "project" }));
  config.skills.push(...scanSkillDirs(path.join(p.globalDir, "skills"), { scope: "global" }));
  config.skills.push(...scanSkillDirs(path.join(p.projectDir, "skills"), { scope: "project" }));
  config.commands.push(...scanCommandFiles(path.join(p.globalDir, "commands"), { scope: "global" }));
  config.commands.push(...scanCommandFiles(path.join(p.projectDir, "commands"), { scope: "project" }));

  // Claude Code plugin marketplaces — each plugin contributes its own agents/skills/commands/hooks
  const marketplacesDir = path.join(p.globalDir, "plugins", "marketplaces");
  if (exists(marketplacesDir)) {
    for (const mp of fs.readdirSync(marketplacesDir, { withFileTypes: true })) {
      if (!mp.isDirectory()) continue;
      const pluginsDir = path.join(marketplacesDir, mp.name, "plugins");
      if (!exists(pluginsDir)) continue;
      for (const plug of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
        if (!plug.isDirectory()) continue;
        const pluginRoot = path.join(pluginsDir, plug.name);
        const ctx = { scope: "global" as const, plugin: plug.name };
        config.agents.push(...scanAgents(path.join(pluginRoot, "agents"), ctx));
        config.skills.push(...scanSkillDirs(path.join(pluginRoot, "skills"), ctx));
        config.commands.push(...scanCommandFiles(path.join(pluginRoot, "commands"), ctx));
        // Hooks may be declared in plugin.json — surface the plugin itself as a hook source.
        const pluginJson = path.join(pluginRoot, ".claude-plugin", "plugin.json");
        if (exists(pluginJson)) {
          try {
            const meta = JSON.parse(fs.readFileSync(pluginJson, "utf8")) as { hooks?: Record<string, unknown> };
            if (meta.hooks) {
              for (const ev of Object.keys(meta.hooks)) {
                config.hooks.push({ event: ev, command: `(plugin: ${plug.name})` });
              }
            }
          } catch {
            // ignore malformed plugin.json
          }
        }
        const meta = readPluginMeta(pluginRoot);
        config.plugins.push({
          id: plug.name,
          scope: "global",
          source: pluginRoot,
          marketplace: mp.name,
          ...meta,
        });
      }
    }
  }

  // Compute per-plugin resource counts (after marketplace scan populated everything).
  const counts = new Map<string, { agents: number; skills: number; commands: number; hooks: number }>();
  const bump = (id: string | undefined, key: "agents" | "skills" | "commands" | "hooks") => {
    if (!id) return;
    let c = counts.get(id);
    if (!c) {
      c = { agents: 0, skills: 0, commands: 0, hooks: 0 };
      counts.set(id, c);
    }
    c[key]++;
  };
  for (const a of config.agents) bump(a.plugin, "agents");
  for (const s of config.skills) bump(s.plugin, "skills");
  for (const c of config.commands) bump(c.plugin, "commands");
  for (const h of config.hooks) {
    const m = h.command.match(/\(plugin:\s*([^)]+)\)/);
    if (m) bump(m[1]!.trim(), "hooks");
  }
  for (const p of config.plugins) {
    const c = counts.get(p.id);
    if (c) p.resourceCounts = c;
  }
  // Also surface the user-installed plugin dir (loose, not under a marketplace)
  config.plugins.push(...scanPluginDir(path.join(p.globalDir, "plugins"), "global").filter((p) => p.id !== "marketplaces"));

  return config;
}

export function writeClaude(config: CanonicalConfig, opts: ResolveOptions = {}): string[] {
  const p = paths("claude-code", opts);
  const written: string[] = [];

  // Write MCP to project .mcp.json (alongside .claude/, not inside)
  const mcpFile = path.join(p.projectDir, "..", ".mcp.json");
  if (Object.keys(config.mcpServers).length > 0) {
    const out: ClaudeMcpFile = { mcpServers: {} };
    for (const [name, server] of Object.entries(config.mcpServers)) {
      out.mcpServers![name] = mcpToRaw(server);
    }
    writeFileWithBackup(mcpFile, JSON.stringify(out, null, 2) + "\n");
    written.push(mcpFile);
  }

  // Write hooks + model into project settings.json
  if (config.hooks.length > 0 || config.settings.model) {
    const settings: ClaudeSettings = {};
    if (config.hooks.length > 0) {
      settings.hooks = {};
      for (const h of config.hooks) {
        settings.hooks[h.event] ??= [];
        settings.hooks[h.event]!.push({
          matcher: h.matcher,
          hooks: [{ type: "command", command: h.command }],
        });
      }
    }
    if (config.settings.model) settings.model = config.settings.model;
    const settingsFile = path.join(p.projectDir, "settings.json");
    writeFileWithBackup(settingsFile, JSON.stringify(settings, null, 2) + "\n");
    written.push(settingsFile);
  }

  // Write rules to project CLAUDE.md / global CLAUDE.md
  for (const rule of config.rules) {
    const target =
      rule.scope === "project"
        ? path.join(p.projectDir, "..", "CLAUDE.md")
        : path.join(p.globalDir, "CLAUDE.md");
    writeFileWithBackup(target, rule.body);
    written.push(target);
  }

  return written;
}

// Helper used by tests/diagnostics
export { mcpFromRaw, mcpToRaw };
export type { ClaudeMcpRaw };
