#!/usr/bin/env node
import { parseArgs } from "node:util";
import { scan } from "./scan.js";
import { sync } from "./sync.js";
import { diffTools, renderDiff } from "./diff.js";
import { loadCatalogs, BUILTIN_HUBS } from "./hub/index.js";
import { loadPersonas, loadPersona, matchPersona, planInstall, applyInstall } from "./personas/index.js";
import * as devicesync from "./devicesync/index.js";
import type { ToolId } from "./ir/types.js";

const HELP = `agentport — port and manage AI coding agent configs

Usage:
  agentport scan                              List detected tools (claude-code / opencode / codex)
  agentport port --from <tool> --to <tool>    Migrate config between tools
  agentport diff --from <tool> --to <tool>    Show MCP-level diff between two tools
  agentport hub list                          List configured skill hubs and cached state
  agentport hub sync [--hub <id>]             Refresh hub catalog cache
  agentport persona list                      List built-in role personas
  agentport persona show <id>                 Show a persona with installed/missing status
  agentport persona install <id> --target <tool> [--dry-run]
                                              Install recommendations into <tool>
  agentport sync init <git-url>               Initialize cross-device sync against a git remote
  agentport sync push --passphrase <p>        Encrypt + push the local IR bundle
  agentport sync pull --passphrase <p>        Pull + decrypt + show diff (does not apply yet)
  agentport sync status                       Show local/remote divergence
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

  if (cmd === "persona") {
    return personaCmd(argv.slice(1));
  }

  if (cmd === "sync") {
    return syncCmd(argv.slice(1));
  }

  process.stderr.write(`unknown command: ${cmd}\n${HELP}`);
  return 2;
}

function syncCmd(args: string[]): number {
  const sub = args[0];
  if (sub === "init") {
    const url = args[1];
    if (!url) {
      process.stderr.write("usage: agentport sync init <git-url>\n");
      return 2;
    }
    try {
      const { repoDir, configFile } = devicesync.init({ remote: url });
      process.stdout.write(`initialized sync repo at ${repoDir}\nwrote config to ${configFile}\n`);
      return 0;
    } catch (e) {
      process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  }
  if (sub === "push" || sub === "pull") {
    const { values } = parseArgs({
      args: args.slice(1),
      options: { passphrase: { type: "string" } },
      strict: false,
    });
    if (typeof values.passphrase !== "string" || !values.passphrase) {
      process.stderr.write("error: --passphrase <p> is required\n");
      return 2;
    }
    try {
      if (sub === "push") {
        const r = devicesync.push({ passphrase: values.passphrase });
        for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
        process.stdout.write(r.pushed ? `pushed bundle: ${r.bundleFile}\n` : `no changes to push\n`);
        return 0;
      } else {
        const r = devicesync.pull({ passphrase: values.passphrase });
        process.stdout.write(`pulled bundle from ${r.bundle.hostname ?? "(unknown host)"} at ${r.bundle.generatedAt}\n`);
        if (r.diff.changedTools.length === 0) {
          process.stdout.write("no differences vs local\n");
        } else {
          process.stdout.write(`changed tools: ${r.diff.changedTools.join(", ")}\n`);
          for (const t of r.diff.changedTools) {
            const d = r.diff.perTool[t];
            process.stdout.write(`  ${t}: mcp +${d.mcp.added.length}/-${d.mcp.removed.length}/~${d.mcp.changed.length}, skills +${d.skills.added}/-${d.skills.removed}, agents +${d.agents.added}/-${d.agents.removed}\n`);
          }
        }
        process.stdout.write("(apply step not yet wired — see status for details)\n");
        return 0;
      }
    } catch (e) {
      process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  }
  if (sub === "status") {
    const s = devicesync.status();
    if (!s.configured) {
      process.stdout.write("not configured (run `agentport sync init <git-url>`)\n");
      return 0;
    }
    process.stdout.write(`remote: ${s.remote}\n`);
    process.stdout.write(`bundle on remote: ${s.bundlePresentRemote ? "yes" : "no"}\n`);
    process.stdout.write(`local repo dirty: ${s.dirty ? "yes" : "no"}\n`);
    if (s.ahead) process.stdout.write(`ahead of ${s.ahead}\n`);
    if (s.behind) process.stdout.write(`behind ${s.behind}\n`);
    return 0;
  }
  process.stderr.write(`unknown sync subcommand: ${sub ?? "(none)"}\n`);
  return 2;
}

function personaCmd(args: string[]): number {
  const sub = args[0];
  if (sub === "list") {
    const personas = loadPersonas();
    if (personas.length === 0) {
      process.stderr.write("no personas found\n");
      return 0;
    }
    for (const p of personas) {
      const counts = countRecs(p);
      process.stdout.write(
        `${p.id}\t${p.name}\t(${counts.skills}s/${counts.agents}a/${counts.commands}c/${counts.mcp}m)\n`
      );
    }
    return 0;
  }
  if (sub === "show") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: agentport persona show <id>\n");
      return 2;
    }
    const persona = loadPersona(id);
    if (!persona) {
      process.stderr.write(`persona not found: ${id}\n`);
      return 2;
    }
    const m = matchPersona(persona);
    process.stdout.write(`${persona.id}  ${persona.name}\n${persona.description}\n\n`);
    process.stdout.write(`  ${m.totals.installed}/${m.totals.total} installed\n\n`);
    for (const item of m.items) {
      const mark = item.status === "installed" ? "✓" : "·";
      const where = item.installedIn && item.installedIn.length > 0 ? ` (${item.installedIn.join(",")})` : "";
      process.stdout.write(`  ${mark} ${item.kind.padEnd(8)} ${item.id}${where}\n      ${item.rationale}\n`);
    }
    return 0;
  }
  if (sub === "install") {
    const id = args[1];
    if (!id) {
      process.stderr.write("usage: agentport persona install <id> --target <tool> [--dry-run]\n");
      return 2;
    }
    const { values } = parseArgs({
      args: args.slice(2),
      options: { target: { type: "string" }, "dry-run": { type: "boolean" } },
      strict: false,
    });
    if (!isToolId(values.target)) {
      process.stderr.write(`error: --target must be one of claude-code|opencode|codex\n`);
      return 2;
    }
    const persona = loadPersona(id);
    if (!persona) {
      process.stderr.write(`persona not found: ${id}\n`);
      return 2;
    }
    if (values["dry-run"]) {
      const plan = planInstall(persona, values.target);
      printPlan(plan);
      return 0;
    }
    const result = applyInstall(persona, values.target);
    printPlan(result.plan);
    for (const f of result.writes) process.stdout.write(`wrote ${f}\n`);
    return 0;
  }
  process.stderr.write(`unknown persona subcommand: ${sub ?? "(none)"}\n`);
  return 2;
}

function countRecs(p: { recommendations: Record<string, unknown[] | undefined> }): { skills: number; agents: number; commands: number; mcp: number } {
  const r = p.recommendations as { skills?: unknown[]; agents?: unknown[]; commands?: unknown[]; mcp?: unknown[] };
  return {
    skills: r.skills?.length ?? 0,
    agents: r.agents?.length ?? 0,
    commands: r.commands?.length ?? 0,
    mcp: r.mcp?.length ?? 0,
  };
}

function printPlan(plan: { willInstall: Array<{ kind: string; id: string; into: string }>; willSkip: Array<{ kind: string; id: string; reason: string }>; unsupported: Array<{ kind: string; id: string; reason: string }> }): void {
  if (plan.willInstall.length > 0) {
    process.stdout.write("will install:\n");
    for (const w of plan.willInstall) process.stdout.write(`  + ${w.kind} ${w.id} → ${w.into}\n`);
  }
  if (plan.willSkip.length > 0) {
    process.stdout.write("will skip:\n");
    for (const w of plan.willSkip) process.stdout.write(`  · ${w.kind} ${w.id} — ${w.reason}\n`);
  }
  if (plan.unsupported.length > 0) {
    process.stdout.write("not auto-installable:\n");
    for (const w of plan.unsupported) process.stdout.write(`  ! ${w.kind} ${w.id} — ${w.reason}\n`);
  }
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
