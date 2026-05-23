import type { CanonicalConfig, ToolId } from "../ir/types.js";
import type { PersonaManifest, PersonaMatch, MatchedItem, ItemKind } from "./types.js";
import { read } from "../sync.js";
import type { ResolveOptions } from "../adapters/paths.js";

const TOOLS: ToolId[] = ["claude-code", "opencode", "codex"];

export function matchPersona(
  persona: PersonaManifest,
  opts: ResolveOptions = {}
): PersonaMatch {
  const configs: Record<ToolId, CanonicalConfig> = {} as any;
  for (const t of TOOLS) configs[t] = read(t, opts);
  return matchPersonaWith(persona, configs);
}

// Pure variant for testing — accepts pre-loaded configs.
export function matchPersonaWith(
  persona: PersonaManifest,
  configs: Record<ToolId, CanonicalConfig>
): PersonaMatch {
  const items: MatchedItem[] = [];

  const check = (kind: ItemKind, id: string, lookup: (cfg: CanonicalConfig) => boolean) => {
    const installedIn: string[] = [];
    for (const t of TOOLS) {
      if (lookup(configs[t])) installedIn.push(t);
    }
    return installedIn;
  };

  for (const rec of persona.recommendations.skills ?? []) {
    const installedIn = check("skills", rec.id, (cfg) => cfg.skills.some((s) => s.id === rec.id));
    items.push({
      kind: "skills",
      id: rec.id,
      rationale: rec.rationale,
      source: rec.source,
      status: installedIn.length > 0 ? "installed" : "missing",
      installedIn,
    });
  }
  for (const rec of persona.recommendations.agents ?? []) {
    const installedIn = check("agents", rec.id, (cfg) => cfg.agents.some((a) => a.id === rec.id));
    items.push({
      kind: "agents",
      id: rec.id,
      rationale: rec.rationale,
      source: rec.source,
      status: installedIn.length > 0 ? "installed" : "missing",
      installedIn,
    });
  }
  for (const rec of persona.recommendations.commands ?? []) {
    const installedIn = check("commands", rec.id, (cfg) => cfg.commands.some((c) => c.id === rec.id));
    items.push({
      kind: "commands",
      id: rec.id,
      rationale: rec.rationale,
      source: rec.source,
      status: installedIn.length > 0 ? "installed" : "missing",
      installedIn,
    });
  }
  for (const rec of persona.recommendations.mcp ?? []) {
    const installedIn = check("mcp", rec.id, (cfg) => Boolean(cfg.mcpServers[rec.id]));
    items.push({
      kind: "mcp",
      id: rec.id,
      rationale: rec.rationale,
      source: rec.source,
      status: installedIn.length > 0 ? "installed" : "missing",
      installedIn,
    });
  }

  const installed = items.filter((i) => i.status === "installed").length;
  return {
    persona,
    items,
    totals: { total: items.length, installed, missing: items.length - installed },
  };
}
