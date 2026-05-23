import fs from "node:fs";
import path from "node:path";
import type { AgentEntry, CommandEntry, PluginEntry, Scope, SkillEntry } from "../ir/types.js";

interface Frontmatter {
  raw: Record<string, string>;
  name?: string;
  description?: string;
  body: string;
}

// Minimal frontmatter parser: pulls top-level `key: value` lines from a `---\n…\n---` block.
// Nested YAML (e.g. `permission:` with indented children) is intentionally not supported —
// we only need the flat top-level fields for our UI.
export function parseFrontmatter(raw: string): Frontmatter {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { raw: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    // Skip indented lines (children of nested objects) and blank lines.
    if (/^\s/.test(line) || !line.trim()) continue;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { raw: fm, name: fm.name, description: fm.description, body: m[2] ?? "" };
}

function splitList(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isDirLike(parent: string, entry: fs.Dirent): boolean {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      return fs.statSync(path.join(parent, entry.name)).isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}

function isFileLike(parent: string, entry: fs.Dirent): boolean {
  if (entry.isFile()) return true;
  if (entry.isSymbolicLink()) {
    try {
      return fs.statSync(path.join(parent, entry.name)).isFile();
    } catch {
      return false;
    }
  }
  return false;
}

export interface ScanContext {
  scope: Scope;
  plugin?: string;
}

export function scanAgents(dir: string, ctx: ScanContext): AgentEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: AgentEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    let id: string | null = null;
    let file: string | null = null;

    if (isFileLike(dir, entry) && entry.name.endsWith(".md")) {
      id = entry.name.replace(/\.md$/, "");
      file = path.join(dir, entry.name);
    } else if (isDirLike(dir, entry)) {
      const subdir = path.join(dir, entry.name);
      const agentMd = ["AGENT.md", "agent.md"]
        .map((n) => path.join(subdir, n))
        .find((p) => fs.existsSync(p));
      if (!agentMd) continue;
      id = entry.name;
      file = agentMd;
    } else {
      continue;
    }

    const fm = parseFrontmatter(fs.readFileSync(file, "utf8"));
    const agent: AgentEntry = {
      id,
      scope: ctx.scope,
      name: fm.name,
      description: fm.description,
      body: fm.body,
      source: file,
    };
    if (ctx.plugin) agent.plugin = ctx.plugin;
    if (fm.raw.tools) agent.tools = splitList(fm.raw.tools);
    if (fm.raw.model) agent.model = fm.raw.model;
    if (fm.raw.color) agent.color = fm.raw.color;
    if (fm.raw.mode) agent.mode = fm.raw.mode;
    out.push(agent);
  }
  return out;
}

export function scanCommandFiles(
  dir: string,
  ctx: ScanContext,
  deprecated = false
): CommandEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: CommandEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!isFileLike(dir, entry) || !entry.name.endsWith(".md")) continue;
    const file = path.join(dir, entry.name);
    const raw = fs.readFileSync(file, "utf8");
    const fm = parseFrontmatter(raw);
    const cmd: CommandEntry = {
      id: entry.name.replace(/\.md$/, ""),
      scope: ctx.scope,
      description: fm.description,
      body: fm.body,
      source: file,
    };
    if (deprecated) cmd.deprecated = true;
    if (ctx.plugin) cmd.plugin = ctx.plugin;
    if (fm.raw["argument-hint"]) cmd.argumentHint = fm.raw["argument-hint"];
    out.push(cmd);
  }
  return out;
}

export function scanSkillDirs(dir: string, ctx: ScanContext): SkillEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: SkillEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (!isDirLike(dir, entry)) continue;
    const skillDir = path.join(dir, entry.name);
    const skillMd = path.join(skillDir, "SKILL.md");
    let description: string | undefined;
    let version: string | undefined;
    if (fs.existsSync(skillMd)) {
      const fm = parseFrontmatter(fs.readFileSync(skillMd, "utf8"));
      description = fm.description;
      version = fm.raw.version;
    }
    const files = walkRel(skillDir).slice(0, 50);
    const skill: SkillEntry = {
      id: entry.name,
      scope: ctx.scope,
      description,
      files,
      source: skillDir,
    };
    if (ctx.plugin) skill.plugin = ctx.plugin;
    if (version) skill.version = version;
    // Symlink detection — entry may be a symlink to a dir
    if (entry.isSymbolicLink()) {
      skill.isSymlink = true;
      try {
        skill.symlinkTarget = fs.readlinkSync(path.join(dir, entry.name));
      } catch {
        // ignore
      }
    }
    out.push(skill);
  }
  return out;
}

export function scanPluginDir(dir: string, scope: Scope): PluginEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: PluginEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (!isDirLike(dir, entry) && !isFileLike(dir, entry)) continue;
    out.push({ id: entry.name, scope, source: path.join(dir, entry.name) });
  }
  return out;
}

// Read .claude-plugin/plugin.json for description/version/author
export function readPluginMeta(pluginRoot: string): Partial<PluginEntry> {
  const metaFile = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(metaFile)) return {};
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as {
      description?: string;
      version?: string;
      author?: string | { name?: string };
    };
    const out: Partial<PluginEntry> = {};
    if (meta.description) out.description = meta.description;
    if (meta.version) out.version = meta.version;
    if (typeof meta.author === "string") out.author = meta.author;
    else if (meta.author?.name) out.author = meta.author.name;
    return out;
  } catch {
    return {};
  }
}

function walkRel(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (isDirLike(dir, e)) walk(path.join(dir, e.name), rel);
      else if (isFileLike(dir, e)) out.push(rel);
    }
  }
  walk(root, "");
  return out;
}

// Back-compat alias
export function scanMarkdownFiles(dir: string, scope: Scope): AgentEntry[] {
  return scanAgents(dir, { scope });
}
