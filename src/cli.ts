#!/usr/bin/env node
import { parseArgs } from "node:util";
import { scan } from "./scan.js";
import { sync } from "./sync.js";
import { diffTools, renderDiff } from "./diff.js";
import type { ToolId } from "./ir/types.js";

const HELP = `agentport — sync AI coding agent configs

Usage:
  agentport scan                              List detected tools (claude-code / opencode / codex)
  agentport sync --from <tool> --to <tool>    Migrate config between tools
  agentport diff --from <tool> --to <tool>    Show MCP-level diff between two tools
  agentport --help                            Show this help

Tools: claude-code | opencode | codex
`;

function isToolId(v: unknown): v is ToolId {
  return v === "claude-code" || v === "opencode" || v === "codex";
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const cmd = argv[0];

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === "scan") {
    const results = scan();
    for (const r of results) {
      process.stdout.write(
        `${r.tool}\t${r.status}${r.scopes.length ? `\t[${r.scopes.join(",")}]` : ""}\n`
      );
    }
    return 0;
  }

  if (cmd === "sync" || cmd === "diff") {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        from: { type: "string" },
        to: { type: "string" },
      },
      strict: false,
    });
    if (!isToolId(values.from) || !isToolId(values.to)) {
      process.stderr.write(`error: --from and --to must be one of claude-code|opencode|codex\n`);
      return 2;
    }
    if (cmd === "sync") {
      const report = sync(values.from, values.to);
      for (const w of report.warnings) process.stderr.write(`warning: ${w.message}\n`);
      for (const f of report.written) process.stdout.write(`wrote ${f}\n`);
      return 0;
    } else {
      const lines = diffTools(values.from, values.to);
      process.stdout.write(renderDiff(lines) + "\n");
      return 0;
    }
  }

  process.stderr.write(`unknown command: ${cmd}\n${HELP}`);
  return 2;
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/cli.ts") ||
  process.argv[1]?.endsWith("/cli.js");
if (isDirect) {
  main().then((code) => process.exit(code));
}
