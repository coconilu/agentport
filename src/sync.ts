import type { CanonicalConfig, SyncReport, ToolId, Warning } from "./ir/types.js";
import { readClaude, writeClaude } from "./adapters/claude.js";
import { readOpenCode, writeOpenCode } from "./adapters/opencode.js";
import { readCodex, writeCodex } from "./adapters/codex.js";
import type { ResolveOptions } from "./adapters/paths.js";

export function read(tool: ToolId, opts: ResolveOptions = {}): CanonicalConfig {
  switch (tool) {
    case "claude-code":
      return readClaude(opts);
    case "opencode":
      return readOpenCode(opts);
    case "codex":
      return readCodex(opts);
  }
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
