import type { PersonaManifest, PersonaMatch } from "./types.js";
import type { ToolId, McpServer, EnvValue } from "../ir/types.js";
import { read } from "../sync.js";
import { writeClaude } from "../adapters/claude.js";
import { writeOpenCode } from "../adapters/opencode.js";
import { writeCodex } from "../adapters/codex.js";
import { envRef } from "../ir/envValue.js";
import type { ResolveOptions } from "../adapters/paths.js";
import { matchPersona } from "./match.js";

export interface InstallPlan {
  willInstall: Array<{ kind: string; id: string; into: ToolId; rationale: string }>;
  willSkip: Array<{ kind: string; id: string; reason: string }>;
  unsupported: Array<{ kind: string; id: string; reason: string }>;
}

export interface InstallResult {
  plan: InstallPlan;
  applied: boolean;
  writes: string[];
}

// Compute the install plan. Only MCP can be installed automatically;
// skills/agents/commands need fetching (depends on Issue #1 hub work) and
// are reported as `unsupported` (or `willSkip` if already installed).
export function planInstall(
  persona: PersonaManifest,
  target: ToolId,
  opts: ResolveOptions = {}
): InstallPlan {
  const match = matchPersona(persona, opts);
  const plan: InstallPlan = { willInstall: [], willSkip: [], unsupported: [] };

  for (const item of match.items) {
    if (item.status === "installed") {
      plan.willSkip.push({ kind: item.kind, id: item.id, reason: `already installed in ${item.installedIn?.join(", ")}` });
      continue;
    }
    if (item.kind === "mcp") {
      const mcp = persona.recommendations.mcp?.find((m) => m.id === item.id);
      if (mcp?.install || mcp?.url) {
        plan.willInstall.push({ kind: "mcp", id: item.id, into: target, rationale: item.rationale });
      } else {
        plan.unsupported.push({ kind: "mcp", id: item.id, reason: "no install spec in manifest" });
      }
    } else {
      plan.unsupported.push({
        kind: item.kind,
        id: item.id,
        reason: "auto-install not yet supported — fetch from source manually (see #1)",
      });
    }
  }
  return plan;
}

export function applyInstall(
  persona: PersonaManifest,
  target: ToolId,
  opts: ResolveOptions = {}
): InstallResult {
  const plan = planInstall(persona, target, opts);
  if (plan.willInstall.length === 0) {
    return { plan, applied: false, writes: [] };
  }

  // Currently MCP-only auto-install.
  const cfg = read(target, opts);
  for (const m of persona.recommendations.mcp ?? []) {
    if (!plan.willInstall.some((w) => w.kind === "mcp" && w.id === m.id)) continue;
    const env: Record<string, EnvValue> = {};
    for (const name of m.env ?? []) env[name] = envRef(name);
    const server: McpServer = {
      transport: m.transport ?? (m.url ? "http" : "stdio"),
    };
    if (m.install) {
      server.command = m.install.command;
      if (m.install.args) server.args = m.install.args;
    }
    if (m.url) server.url = m.url;
    if (Object.keys(env).length > 0) server.env = env;
    cfg.mcpServers[m.id] = server;
  }

  let writes: string[];
  switch (target) {
    case "claude-code":
      writes = writeClaude(cfg, opts);
      break;
    case "opencode":
      writes = writeOpenCode(cfg, opts);
      break;
    case "codex":
      writes = writeCodex(cfg, opts);
      break;
  }
  return { plan, applied: true, writes };
}
