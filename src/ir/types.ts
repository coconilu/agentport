export type ToolId = "claude-code" | "opencode" | "codex";

export type Transport = "stdio" | "http" | "sse";

export type EnvValue =
  | { kind: "literal"; value: string }
  | { kind: "env_ref"; name: string }
  | { kind: "template"; parts: EnvValue[] };

export interface McpServer {
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, EnvValue>;
  headers?: Record<string, EnvValue>;
  enabled?: boolean;
  extensions?: Partial<Record<ToolId, unknown>>;
}

export interface HookEntry {
  event: string;
  matcher?: string;
  command: string;
}

export interface RuleEntry {
  scope: "global" | "project";
  body: string;
}

export type Scope = "global" | "project";

export interface AgentEntry {
  id: string;
  scope: Scope;
  name?: string;
  description?: string;
  body: string;
  source: string;
  plugin?: string;
  tools?: string[];
  model?: string;
  color?: string;
  mode?: string;
}

export interface SkillEntry {
  id: string;
  scope: Scope;
  description?: string;
  files: string[];
  source: string;
  plugin?: string;
  version?: string;
  isSymlink?: boolean;
  symlinkTarget?: string;
}

export interface CommandEntry {
  id: string;
  scope: Scope;
  description?: string;
  body: string;
  source: string;
  deprecated?: boolean;
  plugin?: string;
  argumentHint?: string;
}

export interface PluginResourceCounts {
  agents: number;
  skills: number;
  commands: number;
  hooks: number;
}

export interface PluginEntry {
  id: string;
  scope: Scope;
  source: string;
  marketplace?: string;
  description?: string;
  version?: string;
  author?: string;
  resourceCounts?: PluginResourceCounts;
}

export interface CanonicalConfig {
  version: "1.0";
  mcpServers: Record<string, McpServer>;
  hooks: HookEntry[];
  plugins: PluginEntry[];
  rules: RuleEntry[];
  agents: AgentEntry[];
  skills: SkillEntry[];
  commands: CommandEntry[];
  settings: { model?: string; extensions?: Partial<Record<ToolId, unknown>> };
}

export function emptyConfig(): CanonicalConfig {
  return {
    version: "1.0",
    mcpServers: {},
    hooks: [],
    plugins: [],
    rules: [],
    agents: [],
    skills: [],
    commands: [],
    settings: {},
  };
}

export interface ToolPaths {
  globalDir: string;
  projectDir: string;
}

export interface ScanResult {
  tool: ToolId;
  status: "detected" | "not-found";
  scopes: Array<"global" | "project">;
}

export interface Warning {
  kind: "capability-dropped" | "value-dropped" | "deprecated-target";
  message: string;
  source?: ToolId;
  target?: ToolId;
}

export interface SyncReport {
  warnings: Warning[];
  written: string[];
}
