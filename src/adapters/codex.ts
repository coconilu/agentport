import path from "node:path";
import fs from "node:fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { CanonicalConfig, McpServer, EnvValue } from "../ir/types.js";
import { emptyConfig } from "../ir/types.js";
import {
  envRef,
  literal,
  template,
  collectEnvRefs,
  isPureLiteral,
  asLiteralString,
} from "../ir/envValue.js";
import { writeFileWithBackup, exists } from "./util.js";
import { paths, type ResolveOptions } from "./paths.js";
import { scanAgents, scanCommandFiles, scanSkillDirs } from "./scanFs.js";

interface CodexMcpRaw {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  env_vars?: string[];
  http_headers?: Record<string, string>;
  env_http_headers?: Record<string, string>;
  bearer_token_env_var?: string;
}

interface CodexConfig {
  mcp_servers?: Record<string, CodexMcpRaw>;
  model?: string;
}

function readCodexFile(file: string): CodexConfig | null {
  if (!exists(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  try {
    return parseToml(raw) as CodexConfig;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse Codex config (TOML) at ${file}: ${msg}`);
  }
}

function mcpFromRaw(raw: CodexMcpRaw): McpServer {
  const server: McpServer = { transport: raw.url ? "http" : "stdio" };
  if (raw.command) server.command = raw.command;
  if (raw.args) server.args = [...raw.args];
  if (raw.url) server.url = raw.url;

  const env: Record<string, EnvValue> = {};
  if (raw.env_vars) {
    for (const name of raw.env_vars) env[name] = envRef(name);
  }
  if (raw.env) {
    for (const [k, v] of Object.entries(raw.env)) env[k] = literal(v);
  }
  if (Object.keys(env).length > 0) server.env = env;

  const headers: Record<string, EnvValue> = {};
  if (raw.http_headers) {
    for (const [k, v] of Object.entries(raw.http_headers)) headers[k] = literal(v);
  }
  if (raw.env_http_headers) {
    for (const [k, ref] of Object.entries(raw.env_http_headers)) headers[k] = envRef(ref);
  }
  if (Object.keys(headers).length > 0) server.headers = headers;

  return server;
}

function mcpToRaw(server: McpServer): CodexMcpRaw {
  const raw: CodexMcpRaw = {};
  if (server.command) raw.command = server.command;
  if (server.args) raw.args = [...server.args];
  if (server.url) raw.url = server.url;

  if (server.env) {
    const literalEnv: Record<string, string> = {};
    const refs: string[] = [];
    for (const [k, v] of Object.entries(server.env)) {
      if (v.kind === "env_ref") {
        refs.push(v.name);
      } else if (isPureLiteral(v)) {
        literalEnv[k] = asLiteralString(v);
      } else {
        // Mixed template: degrade to literal-with-placeholders. Best effort.
        // Codex doesn't have a native syntax for in-string env interpolation,
        // so we record the var names in env_vars and write a placeholder.
        for (const name of collectEnvRefs(v)) refs.push(name);
        literalEnv[k] = renderCodexLiteral(v);
      }
    }
    if (Object.keys(literalEnv).length > 0) raw.env = literalEnv;
    if (refs.length > 0) raw.env_vars = Array.from(new Set(refs));
  }

  if (server.headers) {
    const lit: Record<string, string> = {};
    const refs: Record<string, string> = {};
    for (const [k, v] of Object.entries(server.headers)) {
      if (v.kind === "env_ref") refs[k] = v.name;
      else if (isPureLiteral(v)) lit[k] = asLiteralString(v);
      else lit[k] = renderCodexLiteral(v);
    }
    if (Object.keys(lit).length > 0) raw.http_headers = lit;
    if (Object.keys(refs).length > 0) raw.env_http_headers = refs;
  }

  return raw;
}

function renderCodexLiteral(v: EnvValue): string {
  switch (v.kind) {
    case "literal":
      return v.value;
    case "env_ref":
      return `\${${v.name}}`;
    case "template":
      return v.parts.map(renderCodexLiteral).join("");
  }
}

export function readCodex(opts: ResolveOptions = {}): CanonicalConfig {
  const p = paths("codex", opts);
  const cwd = opts.cwd ?? process.cwd();
  const config = emptyConfig();

  for (const file of [
    path.join(p.globalDir, "config.toml"),
    path.join(p.projectDir, "config.toml"),
  ]) {
    const data = readCodexFile(file);
    if (!data) continue;
    if (data.mcp_servers) {
      for (const [name, raw] of Object.entries(data.mcp_servers)) {
        config.mcpServers[name] = mcpFromRaw(raw);
      }
    }
    if (data.model) config.settings.model = data.model;
  }

  // Rules: AGENTS.md at project root, .codex/AGENTS.md, global AGENTS.md
  const projectRules = path.join(cwd, "AGENTS.md");
  const projectRulesB = path.join(p.projectDir, "AGENTS.md");
  const globalRules = path.join(p.globalDir, "AGENTS.md");
  if (exists(projectRules)) {
    config.rules.push({ scope: "project", body: fs.readFileSync(projectRules, "utf8") });
  } else if (exists(projectRulesB)) {
    config.rules.push({ scope: "project", body: fs.readFileSync(projectRulesB, "utf8") });
  }
  if (exists(globalRules)) {
    config.rules.push({ scope: "global", body: fs.readFileSync(globalRules, "utf8") });
  }

  // Agents / Skills / Commands
  // Skills follow the open agent skills standard at ~/.agents/skills/
  const home = opts.home ?? process.env.HOME ?? "";
  config.skills.push(...scanSkillDirs(path.join(home, ".agents", "skills"), { scope: "global" }));
  config.skills.push(...scanSkillDirs(path.join(cwd, ".agents", "skills"), { scope: "project" }));
  config.agents.push(...scanAgents(path.join(p.globalDir, "agents"), { scope: "global" }));
  config.agents.push(...scanAgents(path.join(p.projectDir, "agents"), { scope: "project" }));
  // Codex commands live under prompts/, deprecated.
  config.commands.push(...scanCommandFiles(path.join(p.globalDir, "prompts"), { scope: "global" }, true));

  return config;
}

export function writeCodex(config: CanonicalConfig, opts: ResolveOptions = {}): string[] {
  const p = paths("codex", opts);
  const cwd = opts.cwd ?? process.cwd();
  const written: string[] = [];

  if (Object.keys(config.mcpServers).length > 0 || config.settings.model) {
    const out: CodexConfig = {};
    if (Object.keys(config.mcpServers).length > 0) {
      out.mcp_servers = {};
      for (const [name, server] of Object.entries(config.mcpServers)) {
        out.mcp_servers[name] = mcpToRaw(server);
      }
    }
    if (config.settings.model) out.model = config.settings.model;
    const target = path.join(p.globalDir, "config.toml");
    writeFileWithBackup(target, stringifyToml(out as Record<string, unknown>) + "\n");
    written.push(target);
  }

  for (const rule of config.rules) {
    const target =
      rule.scope === "project"
        ? path.join(cwd, "AGENTS.md")
        : path.join(p.globalDir, "AGENTS.md");
    writeFileWithBackup(target, rule.body);
    written.push(target);
  }

  return written;
}

export { mcpFromRaw, mcpToRaw };
export type { CodexMcpRaw };
