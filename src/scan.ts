import path from "node:path";
import type { ScanResult, ToolId } from "./ir/types.js";
import { paths, type ResolveOptions } from "./adapters/paths.js";
import { exists } from "./adapters/util.js";

const TOOLS: ToolId[] = ["claude-code", "opencode", "codex"];

export function scan(opts: ResolveOptions = {}): ScanResult[] {
  const results: ScanResult[] = [];
  const cwd = opts.cwd ?? process.cwd();

  for (const tool of TOOLS) {
    const p = paths(tool, opts);
    const scopes: Array<"global" | "project"> = [];
    if (exists(p.globalDir) || hasGlobalConfigFile(tool, p.globalDir, opts)) {
      scopes.push("global");
    }
    if (exists(p.projectDir) || hasProjectConfigFile(tool, cwd)) {
      scopes.push("project");
    }
    results.push({
      tool,
      status: scopes.length > 0 ? "detected" : "not-found",
      scopes,
    });
  }
  return results;
}

function hasGlobalConfigFile(tool: ToolId, dir: string, opts: ResolveOptions): boolean {
  const home = opts.home ?? process.env.HOME ?? "";
  if (tool === "claude-code") return exists(path.join(home, ".claude.json"));
  if (tool === "opencode") {
    return exists(path.join(dir, "opencode.json")) || exists(path.join(dir, "opencode.jsonc"));
  }
  if (tool === "codex") return exists(path.join(dir, "config.toml"));
  return false;
}

function hasProjectConfigFile(tool: ToolId, cwd: string): boolean {
  if (tool === "claude-code") {
    return exists(path.join(cwd, ".mcp.json")) || exists(path.join(cwd, "CLAUDE.md"));
  }
  if (tool === "opencode") {
    return exists(path.join(cwd, "opencode.json")) || exists(path.join(cwd, "opencode.jsonc"));
  }
  if (tool === "codex") return false;
  return false;
}
