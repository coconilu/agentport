import path from "node:path";
import os from "node:os";
import type { ToolId, ToolPaths } from "../ir/types.js";

export interface ResolveOptions {
  home?: string;
  cwd?: string;
}

export function getHome(opts: ResolveOptions = {}): string {
  return opts.home ?? process.env.HOME ?? os.homedir();
}

export function getCwd(opts: ResolveOptions = {}): string {
  return opts.cwd ?? process.cwd();
}

export function paths(tool: ToolId, opts: ResolveOptions = {}): ToolPaths {
  const home = getHome(opts);
  const cwd = getCwd(opts);
  switch (tool) {
    case "claude-code":
      return {
        globalDir: path.join(home, ".claude"),
        projectDir: path.join(cwd, ".claude"),
      };
    case "opencode":
      return {
        globalDir: path.join(home, ".config", "opencode"),
        projectDir: path.join(cwd, ".opencode"),
      };
    case "codex":
      return {
        globalDir: path.join(home, ".codex"),
        projectDir: path.join(cwd, ".codex"),
      };
  }
}
