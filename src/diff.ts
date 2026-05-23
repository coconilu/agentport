import type { CanonicalConfig, McpServer, ToolId } from "./ir/types.js";
import { read } from "./sync.js";
import type { ResolveOptions } from "./adapters/paths.js";

export interface DiffLine {
  kind: "add" | "remove" | "change" | "unchanged";
  text: string;
}

export function diffMcp(a: CanonicalConfig, b: CanonicalConfig): DiffLine[] {
  const lines: DiffLine[] = [];
  const allNames = new Set([...Object.keys(a.mcpServers), ...Object.keys(b.mcpServers)]);
  const sorted = [...allNames].sort();
  for (const name of sorted) {
    const left = a.mcpServers[name];
    const right = b.mcpServers[name];
    if (left && !right) lines.push({ kind: "remove", text: `- mcp.${name}` });
    else if (!left && right) lines.push({ kind: "add", text: `+ mcp.${name}` });
    else if (left && right && JSON.stringify(left) !== JSON.stringify(right)) {
      lines.push({ kind: "change", text: `~ mcp.${name} (modified)` });
    } else {
      lines.push({ kind: "unchanged", text: `  mcp.${name}` });
    }
  }
  return lines;
}

export function diffTools(
  from: ToolId,
  to: ToolId,
  opts: ResolveOptions = {}
): DiffLine[] {
  const a = read(from, opts);
  const b = read(to, opts);
  return diffMcp(a, b);
}

export function renderDiff(lines: DiffLine[]): string {
  return lines.map((l) => l.text).join("\n");
}
