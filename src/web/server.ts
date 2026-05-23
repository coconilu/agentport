import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { scan } from "../scan.js";
import { read } from "../sync.js";
import type { ToolId } from "../ir/types.js";

export interface StartOptions {
  port?: number;
  home?: string;
  cwd?: string;
}

const TOOLS: ToolId[] = ["claude-code", "opencode", "codex"];

export function createServer(opts: StartOptions = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderIndex());
        return;
      }
      if (url.pathname === "/api/tools") {
        const results = scan({ home: opts.home, cwd: opts.cwd });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(results));
        return;
      }
      if (url.pathname === "/api/snapshot") {
        const status = Object.fromEntries(
          scan({ home: opts.home, cwd: opts.cwd }).map((r) => [r.tool, r])
        );
        const tools: Record<string, unknown> = {};
        for (const t of TOOLS) {
          const cfg = read(t, { home: opts.home, cwd: opts.cwd });
          tools[t] = {
            status: status[t]?.status ?? "not-found",
            scopes: status[t]?.scopes ?? [],
            mcpServers: cfg.mcpServers,
            agents: cfg.agents,
            skills: cfg.skills,
            hooks: cfg.hooks,
            plugins: cfg.plugins,
            commands: cfg.commands,
            rules: cfg.rules.map((r) => ({ scope: r.scope, length: r.body.length })),
          };
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tools, generatedAt: new Date().toISOString() }));
        return;
      }
      if (url.pathname.startsWith("/api/mcp/")) {
        const tool = url.pathname.slice("/api/mcp/".length) as ToolId;
        if (!TOOLS.includes(tool)) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "unknown tool" }));
          return;
        }
        const config = read(tool, { home: opts.home, cwd: opts.cwd });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ tool, servers: config.mcpServers }));
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });
  return server;
}

export function start(opts: StartOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer(opts);
    server.listen(opts.port ?? 0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function renderIndex(): string {
  return INDEX_HTML;
}

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>agentport</title>
<style>
  :root {
    --fg: #0e1116;
    --fg-soft: #4b5563;
    --muted: #6b7280;
    --bg: #f7f8fa;
    --card: #ffffff;
    --border: #e5e7eb;
    --border-strong: #d1d5db;
    --accent: #2563eb;
    --accent-soft: #eff6ff;
    --warn: #b45309;
    --ok: #047857;
    --mute: #9ca3af;
    --shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 1.5rem; }
  header { max-width: 1200px; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 1.4rem; letter-spacing: -0.01em; }
  header .right { display: flex; align-items: center; gap: 0.75rem; }
  .meta { color: var(--muted); font-size: 0.85rem; }
  .refresh {
    padding: 0.45rem 0.9rem; font-size: 0.85rem; cursor: pointer;
    background: var(--card); border: 1px solid var(--border-strong); border-radius: 6px;
    color: var(--fg); display: inline-flex; align-items: center; gap: 0.35rem;
  }
  .refresh:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .refresh:disabled { opacity: 0.5; cursor: wait; }
  .refresh-icon { display: inline-block; transition: transform 0.3s ease; }
  .refresh.loading .refresh-icon { animation: spin 0.8s linear infinite; }
  @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

  main { max-width: 1200px; margin: 0 auto; }
  .view-toggle { display: flex; gap: 0.25rem; margin-bottom: 1rem; padding: 0.2rem; background: var(--card); border: 1px solid var(--border); border-radius: 8px; width: fit-content; }
  .view-toggle button {
    padding: 0.4rem 1rem; font-size: 0.85rem;
    background: transparent; border: none; border-radius: 6px;
    cursor: pointer; color: var(--muted);
  }
  .view-toggle button.active { background: var(--fg); color: white; }

  .tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem; flex-wrap: wrap; }
  .tabs button {
    padding: 0.55rem 0.9rem; font-size: 0.9rem;
    background: transparent; border: none; border-bottom: 2px solid transparent;
    cursor: pointer; color: var(--muted); font-weight: 500;
  }
  .tabs button:hover { color: var(--fg); }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tabs button .count {
    color: var(--mute); font-size: 0.75em; margin-left: 5px; font-weight: 400;
    background: var(--bg); padding: 1px 6px; border-radius: 10px;
  }
  .tabs button.active .count { background: var(--accent-soft); color: var(--accent); }

  .tool-status-bar {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.8rem 1rem; margin-bottom: 1rem; box-shadow: var(--shadow);
    display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
  }
  .tool-status-bar .name { font-weight: 600; font-size: 1.05rem; }
  .tool-status-bar .status { font-size: 0.8rem; padding: 2px 8px; border-radius: 10px; }
  .tool-status-bar .status.detected { background: #ecfdf5; color: var(--ok); }
  .tool-status-bar .status.not-found { background: #f3f4f6; color: var(--mute); }
  .tool-status-bar .meta-line { color: var(--muted); font-size: 0.8rem; font-family: ui-monospace, monospace; }

  .group-header {
    display: flex; align-items: baseline; gap: 0.5rem;
    margin: 1.2rem 0 0.6rem; color: var(--fg-soft);
    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
  }
  .group-header .count { color: var(--mute); font-weight: 400; text-transform: none; letter-spacing: 0; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.6rem; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.75rem 0.9rem; box-shadow: var(--shadow);
    cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
    display: flex; flex-direction: column; gap: 0.4rem;
    min-width: 0;
  }
  .card:hover { border-color: var(--border-strong); }
  .card.expanded { border-color: var(--accent); }
  .card .row1 {
    display: flex; align-items: baseline; gap: 0.4rem; min-width: 0;
  }
  .card .title {
    font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
  }
  .card .badge {
    font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: #eef; color: #335;
    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; white-space: nowrap;
  }
  .card .badge.global { background: #fef3c7; color: #92400e; }
  .card .badge.project { background: #d1fae5; color: #047857; }
  .card .badge.deprecated { background: #fee2e2; color: #b91c1c; }
  .card .badge.plugin { background: #e0e7ff; color: #4338ca; }
  .card .badge.symlink { background: #ede9fe; color: #6d28d9; }
  .card .badge.transport { background: #f1f5f9; color: #475569; }
  .card .desc { color: var(--fg-soft); font-size: 0.85rem; line-height: 1.35; }
  .card .desc.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card .meta-row {
    color: var(--muted); font-size: 0.78rem; font-family: ui-monospace, monospace;
    display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;
  }
  .card .meta-row .pill {
    background: var(--bg); padding: 1px 7px; border-radius: 10px;
  }
  .card .source {
    color: var(--mute); font-size: 0.72rem; font-family: ui-monospace, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card .expandable { display: none; }
  .card.expanded .expandable { display: block; }
  .card .expandable pre {
    background: #0e1116; color: #e5e7eb; padding: 0.7rem; border-radius: 6px;
    font-size: 0.78rem; line-height: 1.5; overflow: auto; margin: 0.2rem 0; max-height: 320px;
  }
  .card .expandable .kv { display: grid; grid-template-columns: 90px 1fr; gap: 0.3rem 0.7rem; font-size: 0.82rem; }
  .card .expandable .kv dt { color: var(--muted); }
  .card .expandable .kv dd { margin: 0; word-break: break-word; }

  .empty { color: var(--mute); font-style: italic; padding: 0.6rem; background: var(--card); border: 1px dashed var(--border); border-radius: 8px; }
</style>
</head>
<body>
<header>
  <h1>agentport</h1>
  <div class="right">
    <span class="meta" id="meta">Loading…</span>
    <button class="refresh" id="refresh" type="button" data-testid="refresh">
      <span class="refresh-icon">↻</span><span>Refresh</span>
    </button>
  </div>
</header>
<main>
  <div class="view-toggle" id="view-toggle">
    <button data-view="by-tool" data-testid="view-by-tool" class="active">By tool</button>
    <button data-view="by-type" data-testid="view-by-type">By type</button>
  </div>
  <div class="tabs" id="tabs" data-testid="tabs"></div>
  <div id="content" data-testid="content">Loading…</div>
</main>
<script>
const TOOL_LABELS = { "claude-code": "Claude Code", "opencode": "OpenCode", "codex": "Codex" };
const TYPE_LABELS = { mcpServers: "MCP", agents: "Sub-agents", skills: "Skills", hooks: "Hooks", plugins: "Plugins", commands: "Commands" };
const TYPE_KEYS = ["mcpServers", "agents", "skills", "hooks", "plugins", "commands"];

let snapshot = null;
let view = "by-tool";
let activeTab = null;
const expandedSet = new Set();  // keys like "agents:component-scanner"

document.querySelectorAll(".view-toggle button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    view = btn.dataset.view;
    activeTab = null;
    expandedSet.clear();
    render();
  });
});

document.getElementById("refresh").addEventListener("click", load);

async function load() {
  const btn = document.getElementById("refresh");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const res = await fetch("/api/snapshot?_=" + Date.now());
    snapshot = await res.json();
    document.getElementById("meta").textContent =
      "Last scan: " + new Date(snapshot.generatedAt).toLocaleTimeString();
    render();
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

function render() {
  if (!snapshot) return;
  const tabsEl = document.getElementById("tabs");
  const contentEl = document.getElementById("content");
  tabsEl.innerHTML = "";
  contentEl.innerHTML = "";

  if (view === "by-tool") {
    const tools = Object.keys(snapshot.tools);
    if (!activeTab || !tools.includes(activeTab)) activeTab = tools[0];
    for (const t of tools) {
      const cfg = snapshot.tools[t];
      const total = TYPE_KEYS.reduce((sum, k) => sum + sizeOf(cfg[k]), 0);
      tabsEl.appendChild(mkTab(TOOL_LABELS[t] || t, total, t === activeTab, () => { activeTab = t; render(); }, "tool-" + t));
    }
    renderToolPane(snapshot.tools[activeTab], activeTab);
  } else {
    if (!activeTab || !TYPE_KEYS.includes(activeTab)) activeTab = "mcpServers";
    for (const k of TYPE_KEYS) {
      const total = Object.values(snapshot.tools).reduce((s, cfg) => s + sizeOf(cfg[k]), 0);
      tabsEl.appendChild(mkTab(TYPE_LABELS[k], total, k === activeTab, () => { activeTab = k; render(); }, "type-" + k));
    }
    renderTypePane(activeTab);
  }
}

function mkTab(label, count, active, onClick, testId) {
  const btn = document.createElement("button");
  btn.innerHTML = label + ' <span class="count">' + count + '</span>';
  if (active) btn.classList.add("active");
  btn.dataset.testid = "tab-" + testId;
  btn.addEventListener("click", onClick);
  return btn;
}

function renderToolPane(cfg, toolId) {
  const contentEl = document.getElementById("content");
  const bar = document.createElement("div");
  bar.className = "tool-status-bar";
  const statusClass = cfg.status === "detected" ? "detected" : "not-found";
  bar.innerHTML =
    '<span class="name">' + escapeHtml(TOOL_LABELS[toolId] || toolId) + '</span>' +
    '<span class="status ' + statusClass + '">' + cfg.status + '</span>' +
    '<span class="meta-line">scopes: ' + (cfg.scopes.join(", ") || "(none)") + '</span>';
  contentEl.appendChild(bar);
  for (const k of TYPE_KEYS) {
    if (sizeOf(cfg[k]) === 0) continue;
    contentEl.appendChild(mkGroupHeader(TYPE_LABELS[k], sizeOf(cfg[k])));
    contentEl.appendChild(renderCards(k, cfg[k], toolId));
  }
}

function renderTypePane(typeKey) {
  const contentEl = document.getElementById("content");
  let any = false;
  for (const [toolId, cfg] of Object.entries(snapshot.tools)) {
    const items = cfg[typeKey];
    if (sizeOf(items) === 0) continue;
    any = true;
    contentEl.appendChild(mkGroupHeader(TOOL_LABELS[toolId] || toolId, sizeOf(items)));
    contentEl.appendChild(renderCards(typeKey, items, toolId));
  }
  if (!any) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No " + TYPE_LABELS[typeKey] + " found across any tool.";
    contentEl.appendChild(e);
  }
}

function mkGroupHeader(label, count) {
  const h = document.createElement("div");
  h.className = "group-header";
  h.innerHTML = '<span>' + escapeHtml(label) + '</span><span class="count">(' + count + ')</span>';
  return h;
}

function renderCards(typeKey, items, toolId) {
  const grid = document.createElement("div");
  grid.className = "cards";
  if (typeKey === "mcpServers") {
    for (const [name, s] of Object.entries(items)) grid.appendChild(mkMcpCard(toolId, name, s));
  } else {
    for (const item of items) {
      if (typeKey === "agents") grid.appendChild(mkAgentCard(toolId, item));
      else if (typeKey === "skills") grid.appendChild(mkSkillCard(toolId, item));
      else if (typeKey === "commands") grid.appendChild(mkCommandCard(toolId, item));
      else if (typeKey === "hooks") grid.appendChild(mkHookCard(toolId, item));
      else if (typeKey === "plugins") grid.appendChild(mkPluginCard(toolId, item));
    }
  }
  return grid;
}

function mkCard(key) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.testid = "card-" + key;
  if (expandedSet.has(key)) card.classList.add("expanded");
  card.addEventListener("click", () => {
    if (expandedSet.has(key)) expandedSet.delete(key);
    else expandedSet.add(key);
    card.classList.toggle("expanded");
  });
  return card;
}

function mkRow1(title, badges) {
  const row = document.createElement("div");
  row.className = "row1";
  row.innerHTML = '<span class="title">' + escapeHtml(title) + '</span>' + badges.map(b => mkBadge(b)).join("");
  return row;
}

function mkBadge({ text, cls }) {
  return '<span class="badge ' + (cls || "") + '">' + escapeHtml(text) + '</span>';
}

function mkMcpCard(toolId, name, s) {
  const card = mkCard("mcp:" + toolId + ":" + name);
  const envCount = s.env ? Object.keys(s.env).length : 0;
  const badges = [
    { text: s.transport, cls: "transport" },
    ...(s.enabled === false ? [{ text: "disabled", cls: "deprecated" }] : []),
  ];
  card.appendChild(mkRow1(name, badges));
  const target = s.url || (s.command ? (s.command + (s.args ? " " + s.args.join(" ") : "")) : "");
  if (target) {
    const m = document.createElement("div");
    m.className = "meta-row";
    m.innerHTML = '<span class="pill">' + escapeHtml(truncate(target, 80)) + '</span>' +
      (envCount > 0 ? '<span class="pill">' + envCount + ' env</span>' : "");
    card.appendChild(m);
  }
  if (envCount > 0) {
    const expandable = document.createElement("div");
    expandable.className = "expandable";
    const kv = document.createElement("dl");
    kv.className = "kv";
    kv.innerHTML = '<dt>env vars</dt><dd>' + escapeHtml(Object.keys(s.env).join(", ")) + '</dd>';
    expandable.appendChild(kv);
    card.appendChild(expandable);
  }
  return card;
}

function mkAgentCard(toolId, a) {
  const card = mkCard("agent:" + toolId + ":" + a.id);
  const badges = [
    { text: a.scope, cls: a.scope },
    ...(a.plugin ? [{ text: a.plugin, cls: "plugin" }] : []),
    ...(a.model ? [{ text: a.model, cls: "transport" }] : []),
  ];
  card.appendChild(mkRow1(a.id, badges));
  if (a.description) {
    const d = document.createElement("div");
    d.className = "desc clamp";
    d.textContent = a.description;
    card.appendChild(d);
  }
  if (a.tools && a.tools.length) {
    const m = document.createElement("div");
    m.className = "meta-row";
    m.innerHTML = '<span class="pill">tools: ' + a.tools.length + '</span>';
    card.appendChild(m);
  }
  const s = document.createElement("div");
  s.className = "source";
  s.textContent = a.source;
  card.appendChild(s);

  const ex = document.createElement("div");
  ex.className = "expandable";
  const kv = document.createElement("dl");
  kv.className = "kv";
  let html = "";
  if (a.tools && a.tools.length) html += '<dt>tools</dt><dd>' + escapeHtml(a.tools.join(", ")) + '</dd>';
  if (a.color) html += '<dt>color</dt><dd>' + escapeHtml(a.color) + '</dd>';
  if (a.mode) html += '<dt>mode</dt><dd>' + escapeHtml(a.mode) + '</dd>';
  html += '<dt>source</dt><dd>' + escapeHtml(a.source) + '</dd>';
  kv.innerHTML = html;
  ex.appendChild(kv);
  if (a.body && a.body.trim()) {
    const pre = document.createElement("pre");
    pre.textContent = a.body.slice(0, 1500) + (a.body.length > 1500 ? "\n…(truncated)" : "");
    ex.appendChild(pre);
  }
  card.appendChild(ex);
  return card;
}

function mkSkillCard(toolId, sk) {
  const card = mkCard("skill:" + toolId + ":" + sk.id);
  const badges = [
    { text: sk.scope, cls: sk.scope },
    ...(sk.plugin ? [{ text: sk.plugin, cls: "plugin" }] : []),
    ...(sk.isSymlink ? [{ text: "symlink", cls: "symlink" }] : []),
    ...(sk.version ? [{ text: "v" + sk.version, cls: "transport" }] : []),
  ];
  card.appendChild(mkRow1(sk.id, badges));
  if (sk.description) {
    const d = document.createElement("div");
    d.className = "desc clamp";
    d.textContent = sk.description;
    card.appendChild(d);
  }
  const m = document.createElement("div");
  m.className = "meta-row";
  m.innerHTML = '<span class="pill">' + sk.files.length + ' file' + (sk.files.length === 1 ? "" : "s") + '</span>';
  card.appendChild(m);
  const s = document.createElement("div");
  s.className = "source";
  s.textContent = sk.source;
  card.appendChild(s);

  const ex = document.createElement("div");
  ex.className = "expandable";
  const kv = document.createElement("dl");
  kv.className = "kv";
  let html = '<dt>source</dt><dd>' + escapeHtml(sk.source) + '</dd>';
  if (sk.symlinkTarget) html += '<dt>→ target</dt><dd>' + escapeHtml(sk.symlinkTarget) + '</dd>';
  if (sk.files.length) html += '<dt>files</dt><dd>' + escapeHtml(sk.files.slice(0, 30).join(", ")) + (sk.files.length > 30 ? ", …" : "") + '</dd>';
  kv.innerHTML = html;
  ex.appendChild(kv);
  card.appendChild(ex);
  return card;
}

function mkCommandCard(toolId, c) {
  const card = mkCard("cmd:" + toolId + ":" + c.id);
  const badges = [
    { text: c.scope, cls: c.scope },
    ...(c.plugin ? [{ text: c.plugin, cls: "plugin" }] : []),
    ...(c.deprecated ? [{ text: "deprecated", cls: "deprecated" }] : []),
  ];
  card.appendChild(mkRow1("/" + c.id, badges));
  if (c.description) {
    const d = document.createElement("div");
    d.className = "desc clamp";
    d.textContent = c.description;
    card.appendChild(d);
  }
  if (c.argumentHint) {
    const m = document.createElement("div");
    m.className = "meta-row";
    m.innerHTML = '<span class="pill">' + escapeHtml(c.argumentHint) + '</span>';
    card.appendChild(m);
  }
  const s = document.createElement("div");
  s.className = "source";
  s.textContent = c.source;
  card.appendChild(s);

  const ex = document.createElement("div");
  ex.className = "expandable";
  if (c.body && c.body.trim()) {
    const pre = document.createElement("pre");
    pre.textContent = c.body.slice(0, 1500) + (c.body.length > 1500 ? "\n…(truncated)" : "");
    ex.appendChild(pre);
  }
  card.appendChild(ex);
  return card;
}

function mkHookCard(toolId, h) {
  const card = mkCard("hook:" + toolId + ":" + h.event + ":" + (h.matcher || ""));
  const badges = [
    { text: h.event, cls: "transport" },
    ...(h.matcher ? [{ text: h.matcher, cls: "plugin" }] : []),
  ];
  card.appendChild(mkRow1(h.event + (h.matcher ? " : " + h.matcher : ""), badges));
  const m = document.createElement("div");
  m.className = "meta-row";
  m.innerHTML = '<span class="pill">' + escapeHtml(truncate(h.command, 80)) + '</span>';
  card.appendChild(m);
  return card;
}

function mkPluginCard(toolId, p) {
  const card = mkCard("plug:" + toolId + ":" + p.id);
  const badges = [
    { text: p.scope, cls: p.scope },
    ...(p.marketplace ? [{ text: p.marketplace, cls: "plugin" }] : []),
    ...(p.version ? [{ text: "v" + p.version, cls: "transport" }] : []),
  ];
  card.appendChild(mkRow1(p.id, badges));
  if (p.description) {
    const d = document.createElement("div");
    d.className = "desc clamp";
    d.textContent = p.description;
    card.appendChild(d);
  }
  if (p.resourceCounts) {
    const c = p.resourceCounts;
    const parts = [];
    if (c.agents) parts.push(c.agents + " agent" + (c.agents === 1 ? "" : "s"));
    if (c.skills) parts.push(c.skills + " skill" + (c.skills === 1 ? "" : "s"));
    if (c.commands) parts.push(c.commands + " cmd" + (c.commands === 1 ? "" : "s"));
    if (c.hooks) parts.push(c.hooks + " hook" + (c.hooks === 1 ? "" : "s"));
    if (parts.length) {
      const m = document.createElement("div");
      m.className = "meta-row";
      m.innerHTML = parts.map(t => '<span class="pill">' + escapeHtml(t) + '</span>').join("");
      card.appendChild(m);
    }
  }
  const s = document.createElement("div");
  s.className = "source";
  s.textContent = p.source;
  card.appendChild(s);

  const ex = document.createElement("div");
  ex.className = "expandable";
  const kv = document.createElement("dl");
  kv.className = "kv";
  let html = '<dt>source</dt><dd>' + escapeHtml(p.source) + '</dd>';
  if (p.author) html += '<dt>author</dt><dd>' + escapeHtml(p.author) + '</dd>';
  if (p.marketplace) html += '<dt>marketplace</dt><dd>' + escapeHtml(p.marketplace) + '</dd>';
  kv.innerHTML = html;
  ex.appendChild(kv);
  card.appendChild(ex);
  return card;
}

function sizeOf(x) {
  if (!x) return 0;
  if (Array.isArray(x)) return x.length;
  if (typeof x === "object") return Object.keys(x).length;
  return 0;
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();
</script>
</body>
</html>`;

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.ts") ||
  process.argv[1]?.endsWith("/server.js");
if (isDirect) {
  start({ port: Number(process.env.PORT) || 3737 }).then(({ port }) => {
    process.stdout.write(`agentport web UI listening on http://localhost:${port}\n`);
  });
}
