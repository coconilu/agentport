#!/usr/bin/env node
import { parseArgs } from "node:util";
import { scan } from "./scan.js";
import { sync } from "./sync.js";
import { diffTools, renderDiff } from "./diff.js";
import { loadCatalogs, BUILTIN_HUBS } from "./hub/index.js";
import type { ToolId } from "./ir/types.js";

const HELP = `agentport — port and manage AI coding agent configs

Usage:
  agentport scan                              List detected tools (claude-code / opencode / codex)
  agentport port --from <tool> --to <tool>    Migrate config between tools
  agentport diff --from <tool> --to <tool>    Show MCP-level diff between two tools
  agentport hub list                          List configured skill hubs and cached state
  agentport hub sync [--hub <id>]             Refresh hub catalog cache
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

  if (cmd === "port" || cmd === "diff") {
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
    if (cmd === "port") {
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

  if (cmd === "hub") {
    return await hubCmd(argv.slice(1));
  }

  process.stderr.write(`unknown command: ${cmd}\n${HELP}`);
  return 2;
}

async function hubCmd(args: string[]): Promise<number> {
  const sub = args[0];
  if (sub === "list") {
    const catalogs = await loadCatalogs({ refresh: false });
    for (const hub of BUILTIN_HUBS) {
      const cat = catalogs.find((c) => c.hubId === hub.id);
      const status = cat ? `cached (${cat.entries.length} entries, fetched ${cat.fetchedAt})` : "no cache";
      process.stdout.write(`${hub.id}\t${hub.name}\t${status}\n`);
    }
    return 0;
  }
  if (sub === "sync") {
    const { values } = parseArgs({
      args: args.slice(1),
      options: { hub: { type: "string" } },
      strict: false,
    });
    const targetHub = values.hub;
    const catalogs = await loadCatalogs({ refresh: true });
    let count = 0;
    for (const cat of catalogs) {
      if (targetHub && cat.hubId !== targetHub) continue;
      process.stdout.write(`refreshed ${cat.hubId}: ${cat.entries.length} entries\n`);
      count++;
    }
    if (targetHub && count === 0) {
      process.stderr.write(`error: hub '${targetHub}' not found\n`);
      return 2;
    }
    return 0;
  }
  process.stderr.write(`unknown hub subcommand: ${sub ?? "(none)"}\nUsage: agentport hub list | agentport hub sync [--hub <id>]\n`);
  return 2;
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/cli.ts") ||
  process.argv[1]?.endsWith("/cli.js");
if (isDirect) {
  main().then((code) => process.exit(code));
}
