import os from "node:os";
import { read } from "../sync.js";
import type { Bundle } from "./types.js";
import type { ResolveOptions } from "../adapters/paths.js";
import type { ToolId, CanonicalConfig } from "../ir/types.js";

const TOOLS: ToolId[] = ["claude-code", "opencode", "codex"];

export function buildBundle(opts: ResolveOptions = {}): Bundle {
  const tools: Record<ToolId, CanonicalConfig> = {} as any;
  for (const t of TOOLS) tools[t] = read(t, opts);
  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    hostname: os.hostname(),
    tools,
  };
}

export function serialize(bundle: Bundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseBundle(json: string): Bundle {
  const obj = JSON.parse(json) as Bundle;
  if (obj.version !== "1.0") throw new Error(`unsupported bundle version: ${obj.version}`);
  return obj;
}

// Lightweight diff for bundle-vs-local — counts at the IR level. Full diff is
// expensive to render; this is enough to drive the CLI/UI status output.
export interface BundleDiff {
  changedTools: ToolId[];
  perTool: Record<ToolId, {
    mcp: { added: string[]; removed: string[]; changed: string[] };
    skills: { added: number; removed: number };
    agents: { added: number; removed: number };
    hooks: { added: number; removed: number };
    plugins: { added: number; removed: number };
    commands: { added: number; removed: number };
  }>;
}

export function diffBundles(remote: Bundle, local: Bundle): BundleDiff {
  const perTool: BundleDiff["perTool"] = {} as any;
  const changedTools: ToolId[] = [];
  for (const t of TOOLS) {
    const r = remote.tools[t];
    const l = local.tools[t];
    const mcpA = new Set(Object.keys(r.mcpServers));
    const mcpB = new Set(Object.keys(l.mcpServers));
    const added = [...mcpA].filter((n) => !mcpB.has(n));
    const removed = [...mcpB].filter((n) => !mcpA.has(n));
    const changed = [...mcpA].filter((n) => mcpB.has(n) && JSON.stringify(r.mcpServers[n]) !== JSON.stringify(l.mcpServers[n]));
    const skillDelta = setDelta(r.skills.map((s) => s.id), l.skills.map((s) => s.id));
    const agentDelta = setDelta(r.agents.map((s) => s.id), l.agents.map((s) => s.id));
    const hookDelta = setDelta(r.hooks.map((h) => h.event + ":" + (h.matcher ?? "")), l.hooks.map((h) => h.event + ":" + (h.matcher ?? "")));
    const pluginDelta = setDelta(r.plugins.map((p) => p.id), l.plugins.map((p) => p.id));
    const cmdDelta = setDelta(r.commands.map((c) => c.id), l.commands.map((c) => c.id));

    perTool[t] = {
      mcp: { added, removed, changed },
      skills: skillDelta,
      agents: agentDelta,
      hooks: hookDelta,
      plugins: pluginDelta,
      commands: cmdDelta,
    };
    if (
      added.length || removed.length || changed.length ||
      skillDelta.added + skillDelta.removed +
      agentDelta.added + agentDelta.removed +
      hookDelta.added + hookDelta.removed +
      pluginDelta.added + pluginDelta.removed +
      cmdDelta.added + cmdDelta.removed > 0
    ) {
      changedTools.push(t);
    }
  }
  return { changedTools, perTool };
}

function setDelta(a: string[], b: string[]): { added: number; removed: number } {
  const sa = new Set(a);
  const sb = new Set(b);
  return {
    added: [...sa].filter((x) => !sb.has(x)).length,
    removed: [...sb].filter((x) => !sa.has(x)).length,
  };
}
