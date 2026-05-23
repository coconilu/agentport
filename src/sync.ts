import type { CanonicalConfig, SyncReport, ToolId, Warning } from "./ir/types.js";
import { readClaude, writeClaude } from "./adapters/claude.js";
import { readOpenCode, writeOpenCode } from "./adapters/opencode.js";
import { readCodex, writeCodex } from "./adapters/codex.js";
import type { ResolveOptions } from "./adapters/paths.js";
import { applyHubTags } from "./hub/match.js";
import { readCachedCatalog } from "./hub/cache.js";
import type { HubCatalog } from "./hub/types.js";

// Read configs for a tool, then enrich skills with cached hub tags (if available).
// Hub fetch happens lazily — only the cached catalog is consulted here (no network).
// Use `agentport hub sync` or call `loadCatalogs({refresh:true})` to refresh.
export function read(tool: ToolId, opts: ResolveOptions = {}): CanonicalConfig {
  const cfg = readRaw(tool, opts);
  const catalogs = loadCachedCatalogs(opts.home);
  if (catalogs.length > 0) {
    cfg.skills = applyHubTags(cfg.skills, catalogs);
  }
  return cfg;
}

function readRaw(tool: ToolId, opts: ResolveOptions): CanonicalConfig {
  switch (tool) {
    case "claude-code":
      return readClaude(opts);
    case "opencode":
      return readOpenCode(opts);
    case "codex":
      return readCodex(opts);
  }
}

function loadCachedCatalogs(home?: string): HubCatalog[] {
  const out: HubCatalog[] = [];
  // Only known builtin hub id for now. When remote hubs are added, enumerate them here.
  const cat = readCachedCatalog("community", { home, ttlMs: Number.MAX_SAFE_INTEGER });
  if (cat) out.push(cat);
  return out;
}

export function write(
  tool: ToolId,
  config: CanonicalConfig,
  opts: ResolveOptions = {}
): { written: string[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const filtered: CanonicalConfig = { ...config, hooks: [...config.hooks], plugins: [...config.plugins] };

  // Capability gap: only Claude supports hooks natively.
  if (tool !== "claude-code" && filtered.hooks.length > 0) {
    for (const h of filtered.hooks) {
      warnings.push({
        kind: "capability-dropped",
        message: `hook ${h.event}${h.matcher ? `:${h.matcher}` : ""} dropped: ${tool} does not support hooks`,
        target: tool,
      });
    }
    filtered.hooks = [];
  }

  // Capability gap: only OpenCode supports plugins natively.
  if (tool !== "opencode" && filtered.plugins.length > 0) {
    for (const p of filtered.plugins) {
      warnings.push({
        kind: "capability-dropped",
        message: `plugin ${p.id} dropped: ${tool} does not support plugins`,
        target: tool,
      });
    }
    filtered.plugins = [];
  }

  let written: string[];
  switch (tool) {
    case "claude-code":
      written = writeClaude(filtered, opts);
      break;
    case "opencode":
      written = writeOpenCode(filtered, opts);
      break;
    case "codex":
      written = writeCodex(filtered, opts);
      break;
  }
  return { written, warnings };
}

export function sync(
  from: ToolId,
  to: ToolId,
  opts: ResolveOptions = {}
): SyncReport {
  const config = read(from, opts);
  const result = write(to, config, opts);
  return { warnings: result.warnings, written: result.written };
}
