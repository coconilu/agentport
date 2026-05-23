import path from "node:path";
import fs from "node:fs";
import type { CanonicalConfig, McpServer, EnvValue } from "../ir/types.js";
import { emptyConfig } from "../ir/types.js";
import {
  parseOpenCodeEnv,
  renderOpenCode,
  isPureLiteral,
} from "../ir/envValue.js";
import { writeFileWithBackup, exists } from "./util.js";
import { paths, type ResolveOptions } from "./paths.js";
import { scanAgents, scanCommandFiles, scanSkillDirs, scanPluginDir } from "./scanFs.js";

interface OpenCodeMcpRaw {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  enabled?: boolean;
}

interface OpenCodeFile {
  mcp?: Record<string, OpenCodeMcpRaw>;
  model?: string;
}

// OpenCode supports .jsonc — we strip line comments before parsing.
function stripJsonComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:]\s*)\/\/.*$/gm, "$1");
}

function readOpencodeFile(file: string): OpenCodeFile | null {
  if (!exists(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(stripJsonComments(raw)) as OpenCodeFile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse OpenCode config at ${file}: ${msg}`);
  }
}

function mcpFromRaw(raw: OpenCodeMcpRaw): McpServer {
  const transport: McpServer["transport"] =
    raw.type === "remote" ? (raw.url?.includes("sse") ? "sse" : "http") : "stdio";
  const server: McpServer = { transport };
  if (raw.command && raw.command.length > 0) {
    server.command = raw.command[0];
    if (raw.command.length > 1) server.args = raw.command.slice(1);
  }
  if (raw.url) server.url = raw.url;
  if (raw.environment) {
    server.env = {};
    for (const [k, v] of Object.entries(raw.environment)) {
      server.env[k] = parseOpenCodeEnv(v);
    }
  }
  if (raw.headers) {
    server.headers = {};
    for (const [k, v] of Object.entries(raw.headers)) {
      server.headers[k] = parseOpenCodeEnv(v);
    }
  }
  if (raw.enabled === false) server.enabled = false;
  return server;
}

function mcpToRaw(server: McpServer): OpenCodeMcpRaw {
  const raw: OpenCodeMcpRaw = {
    type: server.transport === "stdio" ? "local" : "remote",
  };
  if (server.command) {
    raw.command = server.args ? [server.command, ...server.args] : [server.command];
  }
  if (server.url) raw.url = server.url;
  if (server.env) {
    raw.environment = {};
    for (const [k, v] of Object.entries(server.env)) raw.environment[k] = renderOpenCode(v);
  }
  if (server.headers) {
    raw.headers = {};
    for (const [k, v] of Object.entries(server.headers)) raw.headers[k] = renderOpenCode(v);
  }
  if (server.enabled === false) raw.enabled = false;
  return raw;
}

function findMainConfig(dir: string): string {
  const jsonc = path.join(dir, "opencode.jsonc");
  const json = path.join(dir, "opencode.json");
  if (exists(jsonc)) return jsonc;
  return json;
}

export function readOpenCode(opts: ResolveOptions = {}): CanonicalConfig {
  const p = paths("opencode", opts);
  const config = emptyConfig();
  const cwd = opts.cwd ?? process.cwd();

  const candidates = [
    findMainConfig(p.globalDir),
    findMainConfig(cwd),
    findMainConfig(p.projectDir),
  ];

  for (const file of candidates) {
    const data = readOpencodeFile(file);
    if (!data) continue;
    if (data.mcp) {
      for (const [name, raw] of Object.entries(data.mcp)) {
        config.mcpServers[name] = mcpFromRaw(raw);
      }
    }
    if (data.model) config.settings.model = data.model;
  }

  // Rules: AGENTS.md at project root and global
  const projectRules = path.join(cwd, "AGENTS.md");
  const globalRules = path.join(p.globalDir, "AGENTS.md");
  if (exists(projectRules)) {
    config.rules.push({ scope: "project", body: fs.readFileSync(projectRules, "utf8") });
  }
  if (exists(globalRules)) {
    config.rules.push({ scope: "global", body: fs.readFileSync(globalRules, "utf8") });
  }

  // Agents / Skills / Commands / Plugins
  for (const sub of ["agents", "agent"] as const) {
    config.agents.push(...scanAgents(path.join(p.globalDir, sub), { scope: "global" }));
    config.agents.push(...scanAgents(path.join(p.projectDir, sub), { scope: "project" }));
  }
  config.skills.push(...scanSkillDirs(path.join(p.globalDir, "skills"), { scope: "global" }));
  config.skills.push(...scanSkillDirs(path.join(p.projectDir, "skills"), { scope: "project" }));
  for (const sub of ["commands", "command"] as const) {
    config.commands.push(...scanCommandFiles(path.join(p.globalDir, sub), { scope: "global" }));
    config.commands.push(...scanCommandFiles(path.join(p.projectDir, sub), { scope: "project" }));
  }
  config.plugins.push(...scanPluginDir(path.join(p.globalDir, "plugins"), "global"));
  config.plugins.push(...scanPluginDir(path.join(p.projectDir, "plugins"), "project"));

  return config;
}

export function writeOpenCode(config: CanonicalConfig, opts: ResolveOptions = {}): string[] {
  const p = paths("opencode", opts);
  const cwd = opts.cwd ?? process.cwd();
  const written: string[] = [];

  if (Object.keys(config.mcpServers).length > 0 || config.settings.model) {
    const out: OpenCodeFile = {};
    if (Object.keys(config.mcpServers).length > 0) {
      out.mcp = {};
      for (const [name, server] of Object.entries(config.mcpServers)) {
        out.mcp[name] = mcpToRaw(server);
      }
    }
    if (config.settings.model) out.model = config.settings.model;
    const target = path.join(cwd, "opencode.json");
    writeFileWithBackup(target, JSON.stringify(out, null, 2) + "\n");
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
export type { OpenCodeMcpRaw };
