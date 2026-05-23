const TOOL_LABELS = { "claude-code": "Claude Code", "opencode": "OpenCode", "codex": "Codex" };
const TYPE_LABELS = { mcpServers: "MCP", agents: "Sub-agents", skills: "Skills", hooks: "Hooks", plugins: "Plugins", commands: "Commands" };
const TYPE_KEYS = ["mcpServers", "agents", "skills", "hooks", "plugins", "commands"];

let snapshot = null;
let view = "by-tool";
let activeTab = null;
let activeTags = new Set();  // skill tag filter (only active in by-type/skills view)

document.querySelectorAll(".view-toggle button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    view = btn.dataset.view;
    activeTab = null;
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

  // Tag filter only shown on skills view
  if (typeKey === "skills") {
    const allSkills = Object.values(snapshot.tools).flatMap(c => c.skills || []);
    const tagCounts = collectTagCounts(allSkills);
    if (tagCounts.length > 0) {
      contentEl.appendChild(renderTagFilter(tagCounts));
    }
  } else if (activeTags.size > 0) {
    activeTags = new Set();  // clear filter when leaving skills
  }

  let any = false;
  for (const [toolId, cfg] of Object.entries(snapshot.tools)) {
    let items = cfg[typeKey];
    if (typeKey === "skills" && activeTags.size > 0) {
      items = (items || []).filter(s => (s.tags || []).some(t => activeTags.has(t)));
    }
    if (sizeOf(items) === 0) continue;
    any = true;
    contentEl.appendChild(mkGroupHeader(TOOL_LABELS[toolId] || toolId, sizeOf(items)));
    contentEl.appendChild(renderCards(typeKey, items, toolId));
  }
  if (!any) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = activeTags.size > 0
      ? "No " + TYPE_LABELS[typeKey] + " matching the selected tag(s)."
      : "No " + TYPE_LABELS[typeKey] + " found across any tool.";
    contentEl.appendChild(e);
  }
}

function collectTagCounts(skills) {
  const map = new Map();
  for (const s of skills) {
    for (const t of (s.tags || [])) map.set(t, (map.get(t) || 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function renderTagFilter(tagCounts) {
  const bar = document.createElement("div");
  bar.className = "tag-filter";
  bar.dataset.testid = "tag-filter";
  const label = document.createElement("span");
  label.className = "tf-label";
  label.textContent = "Filter by tag:";
  bar.appendChild(label);
  for (const { tag, count } of tagCounts) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tf-chip" + (activeTags.has(tag) ? " active" : "");
    chip.dataset.testid = "tf-" + tag;
    chip.innerHTML = escapeHtml(tag) + '<span class="tf-count">' + count + '</span>';
    chip.addEventListener("click", () => {
      if (activeTags.has(tag)) activeTags.delete(tag);
      else activeTags.add(tag);
      render();
    });
    bar.appendChild(chip);
  }
  if (activeTags.size > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "tf-clear";
    clear.textContent = "Clear filter";
    clear.addEventListener("click", () => { activeTags.clear(); render(); });
    bar.appendChild(clear);
  }
  return bar;
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

  const row1 = document.createElement("div");
  row1.className = "row1";
  const t = document.createElement("span");
  t.className = "title";
  t.textContent = title;
  row1.appendChild(t);
  for (const b of badges) row1.insertAdjacentHTML("beforeend", mkBadgeHtml(b));
  card.appendChild(row1);

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
  for (const t of (sk.tags || []).slice(0, 2)) out.push({ text: t, cls: "tag" });
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
    if (item.tags && item.tags.length) addKv("tags", item.tags.join(", "));
    if (item.hubMatch) addKv("hub source", item.hubMatch.hubId + ":" + item.hubMatch.hubEntryId);
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
