const TOOL_LABELS = { "claude-code": "Claude Code", "opencode": "OpenCode", "codex": "Codex" };
const TYPE_LABELS = { mcpServers: "MCP", agents: "Sub-agents", skills: "Skills", hooks: "Hooks", plugins: "Plugins", commands: "Commands" };
const TYPE_KEYS = ["mcpServers", "agents", "skills", "hooks", "plugins", "commands"];

let snapshot = null;
let view = "by-tool";
let activeTab = null;
let personasCache = null;
let personaDetail = null;  // { id } when viewing detail
let personaTarget = "claude-code";

document.querySelectorAll(".view-toggle button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    view = btn.dataset.view;
    activeTab = null;
    personaDetail = null;
    render();
  });
});

document.getElementById("refresh").addEventListener("click", load);

// Modal global handlers
const modalOverlay = document.getElementById("modal-overlay");
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.querySelector('[data-testid="modal-close"]').addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalOverlay.hidden) closeModal(); });

// Dev hot reload: when server emits a `reload` SSE event, refresh the page.
// In production builds this endpoint is 404 and EventSource silently retries — harmless.
try {
  const es = new EventSource("/api/dev/watch");
  es.addEventListener("reload", () => location.reload());
  es.addEventListener("error", () => { /* keep retrying silently */ });
} catch { /* SSE unsupported — fine */ }

async function load() {
  const btn = document.getElementById("refresh");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const res = await fetch("/api/snapshot?_=" + Date.now());
    snapshot = await res.json();
    personasCache = null;  // re-fetch on next personas view
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

  if (view === "personas") {
    renderPersonas(contentEl);
    return;
  }

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
    for (const [name, s] of Object.entries(items)) {
      grid.appendChild(mkCard("mcpServers:" + toolId + ":" + name, name, mcpBadges(s), "", () => openModal("mcp", toolId, name, s)));
    }
  } else {
    for (const item of items) {
      let title = item.id, badges = [], desc = item.description || "";
      if (typeKey === "commands") title = "/" + item.id;
      if (typeKey === "hooks") {
        title = item.event + (item.matcher ? " : " + item.matcher : "");
        desc = item.command || "";
      }
      if (typeKey === "agents") badges = agentBadges(item);
      else if (typeKey === "skills") badges = skillBadges(item);
      else if (typeKey === "commands") badges = commandBadges(item);
      else if (typeKey === "hooks") badges = hookBadges(item);
      else if (typeKey === "plugins") badges = pluginBadges(item);
      grid.appendChild(mkCard(typeKey + ":" + toolId + ":" + item.id, title, badges, desc, () => openModal(typeKey, toolId, item.id, item)));
    }
  }
  return grid;
}

function mkCard(testId, title, badges, desc, onClick) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.testid = "card-" + testId;
  card.tabIndex = 0;
  card.addEventListener("click", onClick);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } });

  const header = document.createElement("div");
  header.className = "card-header";
  const t = document.createElement("span");
  t.className = "title";
  t.textContent = title;
  header.appendChild(t);
  card.appendChild(header);

  if (badges.length > 0) {
    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";
    for (const b of badges) badgeRow.insertAdjacentHTML("beforeend", mkBadgeHtml(b));
    card.appendChild(badgeRow);
  }

  if (desc) {
    const d = document.createElement("div");
    d.className = "desc";
    d.textContent = desc;
    card.appendChild(d);
  }
  return card;
}

function mkBadgeHtml(b) {
  return '<span class="badge ' + (b.cls || "") + '">' + escapeHtml(b.text) + '</span>';
}

function mcpBadges(s) {
  const out = [{ text: s.transport, cls: "transport" }];
  if (s.enabled === false) out.push({ text: "disabled", cls: "deprecated" });
  return out;
}
function agentBadges(a) {
  const out = [{ text: a.scope, cls: a.scope }];
  if (a.plugin) out.push({ text: a.plugin, cls: "plugin" });
  return out;
}
function skillBadges(sk) {
  const out = [{ text: sk.scope, cls: sk.scope }];
  if (sk.plugin) out.push({ text: sk.plugin, cls: "plugin" });
  else if (sk.isSymlink) out.push({ text: "symlink", cls: "symlink" });
  return out;
}
function commandBadges(c) {
  const out = [{ text: c.scope, cls: c.scope }];
  if (c.plugin) out.push({ text: c.plugin, cls: "plugin" });
  if (c.deprecated) out.push({ text: "deprecated", cls: "deprecated" });
  return out;
}
function hookBadges(h) {
  const out = [{ text: h.event, cls: "transport" }];
  if (h.matcher) out.push({ text: h.matcher, cls: "plugin" });
  return out;
}
function pluginBadges(p) {
  const out = [{ text: p.scope, cls: p.scope }];
  if (p.marketplace) out.push({ text: p.marketplace, cls: "plugin" });
  return out;
}

/* ===== Modal ===== */
function openModal(typeKey, toolId, id, item) {
  const title = document.getElementById("modal-title");
  const badges = document.getElementById("modal-badges");
  const body = document.getElementById("modal-body");

  let displayTitle = id;
  let badgeList = [];
  if (typeKey === "mcp") {
    badgeList = mcpBadges(item);
  } else if (typeKey === "agents") {
    badgeList = agentBadges(item);
  } else if (typeKey === "skills") {
    badgeList = skillBadges(item);
  } else if (typeKey === "commands") {
    displayTitle = "/" + id;
    badgeList = commandBadges(item);
  } else if (typeKey === "hooks") {
    displayTitle = item.event + (item.matcher ? " : " + item.matcher : "");
    badgeList = hookBadges(item);
  } else if (typeKey === "plugins") {
    badgeList = pluginBadges(item);
  }
  badgeList.push({ text: TOOL_LABELS[toolId] || toolId, cls: "transport" });

  title.textContent = displayTitle;
  badges.innerHTML = badgeList.map(mkBadgeHtml).join("");
  body.innerHTML = "";
  body.appendChild(renderModalBody(typeKey, item));

  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

function renderModalBody(typeKey, item) {
  const frag = document.createDocumentFragment();

  if (item.description) frag.appendChild(section("Description", divText(item.description, "desc-full")));

  const kvLines = [];
  const addKv = (k, v) => { if (v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) kvLines.push([k, v]); };

  if (typeKey === "mcp") {
    addKv("transport", item.transport);
    addKv("command", item.command ? (item.command + (item.args ? " " + item.args.join(" ") : "")) : null);
    addKv("url", item.url);
    addKv("enabled", item.enabled === false ? "false" : null);
    if (item.env) addKv("env vars", Object.keys(item.env).join(", "));
    if (item.headers) addKv("headers", Object.keys(item.headers).join(", "));
  } else if (typeKey === "agents") {
    if (item.tools) addKv("tools", item.tools.join(", "));
    addKv("model", item.model);
    addKv("color", item.color);
    addKv("mode", item.mode);
    addKv("plugin", item.plugin);
    addKv("scope", item.scope);
    addKv("source", item.source);
  } else if (typeKey === "skills") {
    addKv("version", item.version);
    addKv("plugin", item.plugin);
    addKv("scope", item.scope);
    addKv("symlink", item.isSymlink ? "yes" : null);
    addKv("→ target", item.symlinkTarget);
    addKv("file count", item.files.length);
    addKv("source", item.source);
  } else if (typeKey === "commands") {
    addKv("argument hint", item.argumentHint);
    addKv("plugin", item.plugin);
    addKv("scope", item.scope);
    addKv("deprecated", item.deprecated ? "yes" : null);
    addKv("source", item.source);
  } else if (typeKey === "hooks") {
    addKv("event", item.event);
    addKv("matcher", item.matcher);
    addKv("command", item.command);
  } else if (typeKey === "plugins") {
    addKv("marketplace", item.marketplace);
    addKv("author", item.author);
    addKv("version", item.version);
    addKv("scope", item.scope);
    if (item.resourceCounts) {
      const rc = item.resourceCounts;
      addKv("resources", rc.agents + " agents, " + rc.skills + " skills, " + rc.commands + " commands, " + rc.hooks + " hooks");
    }
    addKv("source", item.source);
  }
  if (kvLines.length > 0) frag.appendChild(section("Metadata", kvList(kvLines)));

  if (typeKey === "skills" && item.files && item.files.length > 0) {
    const chips = document.createElement("div");
    chips.className = "filechips";
    for (const f of item.files.slice(0, 60)) {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = f;
      chips.appendChild(c);
    }
    if (item.files.length > 60) {
      const more = document.createElement("span");
      more.className = "chip";
      more.textContent = "+" + (item.files.length - 60) + " more";
      chips.appendChild(more);
    }
    frag.appendChild(section("Files", chips));
  }

  if ((typeKey === "agents" || typeKey === "commands") && item.body && item.body.trim()) {
    const pre = document.createElement("pre");
    const t = item.body.length > 4000 ? item.body.slice(0, 4000) + "\n…(truncated)" : item.body;
    pre.textContent = t;
    frag.appendChild(section("Body", pre));
  }

  return frag;
}

function section(label, contentNode) {
  const s = document.createElement("section");
  s.className = "modal-section";
  s.dataset.section = label.toLowerCase();
  const h = document.createElement("h3");
  h.textContent = label;
  s.appendChild(h);
  s.appendChild(contentNode);
  return s;
}

function divText(text, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  return d;
}

function kvList(pairs) {
  const dl = document.createElement("dl");
  dl.className = "kv";
  for (const [k, v] of pairs) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = String(v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  return dl;
}

/* ===== Personas view ===== */
async function renderPersonas(contentEl) {
  if (personaDetail) {
    await renderPersonaDetail(contentEl, personaDetail.id);
    return;
  }
  contentEl.innerHTML = "Loading personas…";
  if (!personasCache) {
    const res = await fetch("/api/personas");
    personasCache = await res.json();
  }
  contentEl.innerHTML = "";
  if (personasCache.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No personas configured.";
    contentEl.appendChild(e);
    return;
  }
  const grid = document.createElement("div");
  grid.className = "persona-cards";
  for (const p of personasCache) {
    const total = p._totals?.total ?? 0;
    const installed = p._totals?.installed ?? 0;
    const pct = total > 0 ? Math.round((installed / total) * 100) : 0;
    const card = document.createElement("div");
    card.className = "persona-card";
    card.dataset.testid = "persona-card-" + p.id;
    card.innerHTML =
      '<div class="pc-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="pc-desc">' + escapeHtml(p.description) + '</div>' +
      '<div class="pc-progress">' +
        '<div class="pc-pbar"><div class="pc-pfill" style="width: ' + pct + '%"></div></div>' +
        '<div class="pc-pmeta"><span>' + installed + ' / ' + total + ' installed</span><span>v' + escapeHtml(p.version) + '</span></div>' +
      '</div>';
    card.addEventListener("click", () => { personaDetail = { id: p.id }; render(); });
    grid.appendChild(card);
  }
  contentEl.appendChild(grid);
}

async function renderPersonaDetail(contentEl, id) {
  contentEl.innerHTML = "Loading…";
  const res = await fetch("/api/personas/" + encodeURIComponent(id));
  const m = await res.json();
  const persona = m.persona;
  contentEl.innerHTML = "";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "pd-back";
  back.dataset.testid = "persona-back";
  back.textContent = "← All personas";
  back.addEventListener("click", () => { personaDetail = null; render(); });
  contentEl.appendChild(back);

  const wrap = document.createElement("div");
  wrap.className = "persona-detail";
  wrap.dataset.testid = "persona-detail";

  const head = document.createElement("div");
  head.innerHTML =
    '<h2 style="margin:0 0 0.3rem;">' + escapeHtml(persona.name) + '</h2>' +
    '<div style="color:var(--muted);font-size:0.9rem;margin-bottom:0.5rem;">' + escapeHtml(persona.description) + '</div>' +
    '<div style="color:var(--muted);font-size:0.8rem;">' + m.totals.installed + ' / ' + m.totals.total + ' installed · v' + escapeHtml(persona.version) + '</div>';
  wrap.appendChild(head);

  // Action row: target tool selector + install buttons
  const actions = document.createElement("div");
  actions.className = "pd-actions";
  actions.innerHTML =
    'Install missing into: ' +
    '<select id="persona-target" data-testid="persona-target">' +
      '<option value="claude-code">Claude Code</option>' +
      '<option value="opencode">OpenCode</option>' +
      '<option value="codex">Codex</option>' +
    '</select>' +
    '<button class="pd-btn" type="button" data-testid="persona-dry-run">Dry-run</button>' +
    '<button class="pd-btn primary" type="button" data-testid="persona-install">Install</button>';
  wrap.appendChild(actions);

  const result = document.createElement("div");
  result.className = "pd-result";
  result.style.display = "none";
  result.dataset.testid = "persona-result";
  wrap.appendChild(result);

  // Group items by kind
  const kinds = ["skills", "agents", "commands", "mcp"];
  const KIND_LABELS = { skills: "Skills", agents: "Sub-agents", commands: "Commands", mcp: "MCP servers" };
  for (const kind of kinds) {
    const items = m.items.filter((i) => i.kind === kind);
    if (items.length === 0) continue;
    const sec = document.createElement("div");
    sec.className = "pd-section";
    sec.innerHTML = '<h3>' + KIND_LABELS[kind] + ' (' + items.length + ')</h3>';
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "pd-item" + (item.status === "installed" ? " installed" : "");
      row.dataset.testid = "persona-item-" + kind + "-" + item.id;
      const mark = item.status === "installed" ? "✓" : "·";
      const where = item.installedIn && item.installedIn.length > 0
        ? '<span class="pd-where"> in ' + escapeHtml(item.installedIn.join(", ")) + '</span>'
        : "";
      row.innerHTML =
        '<span class="pd-mark">' + mark + '</span>' +
        '<span><span class="pd-id">' + escapeHtml(item.id) + '</span>' + where + '</span>' +
        '<div class="pd-rationale">' + escapeHtml(item.rationale) + '</div>';
      sec.appendChild(row);
    }
    wrap.appendChild(sec);
  }
  contentEl.appendChild(wrap);

  const targetSel = document.getElementById("persona-target");
  targetSel.value = personaTarget;
  targetSel.addEventListener("change", () => { personaTarget = targetSel.value; });

  document.querySelector('[data-testid="persona-dry-run"]').addEventListener("click", async () => {
    const r = await fetch("/api/personas/" + encodeURIComponent(id) + "/plan?target=" + encodeURIComponent(targetSel.value));
    const data = await r.json();
    showPlanResult(result, data, false);
  });
  document.querySelector('[data-testid="persona-install"]').addEventListener("click", async () => {
    const r = await fetch("/api/personas/" + encodeURIComponent(id) + "/install?target=" + encodeURIComponent(targetSel.value), { method: "POST" });
    const data = await r.json();
    showPlanResult(result, data, true);
  });
}

function showPlanResult(el, data, applied) {
  el.style.display = "block";
  const plan = data.plan || data;
  let html = '<div style="font-weight:600;margin-bottom:0.4rem;">' + (applied ? "Install applied" : "Dry-run plan") + '</div>';
  if (plan.willInstall.length > 0) {
    html += '<div><strong>Will install:</strong><ul style="margin:0.2rem 0 0.5rem 1.2rem;">';
    for (const w of plan.willInstall) html += '<li>' + escapeHtml(w.kind) + ' <code>' + escapeHtml(w.id) + '</code> → ' + escapeHtml(w.into) + '</li>';
    html += '</ul></div>';
  }
  if (plan.willSkip.length > 0) {
    html += '<div><strong>Skip:</strong><ul style="margin:0.2rem 0 0.5rem 1.2rem;color:var(--muted);">';
    for (const w of plan.willSkip) html += '<li>' + escapeHtml(w.kind) + ' <code>' + escapeHtml(w.id) + '</code> — ' + escapeHtml(w.reason) + '</li>';
    html += '</ul></div>';
  }
  if (plan.unsupported.length > 0) {
    html += '<div><strong>Not auto-installable:</strong><ul style="margin:0.2rem 0 0 1.2rem;color:var(--warn);">';
    for (const w of plan.unsupported) html += '<li>' + escapeHtml(w.kind) + ' <code>' + escapeHtml(w.id) + '</code> — ' + escapeHtml(w.reason) + '</li>';
    html += '</ul></div>';
  }
  if (applied && data.writes && data.writes.length > 0) {
    html += '<div style="margin-top:0.5rem;color:var(--ok);">Wrote: ' + data.writes.map(escapeHtml).join(", ") + '</div>';
  }
  el.innerHTML = html;
}

function sizeOf(x) {
  if (!x) return 0;
  if (Array.isArray(x)) return x.length;
  if (typeof x === "object") return Object.keys(x).length;
  return 0;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load();
