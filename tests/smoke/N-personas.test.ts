import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { loadPersonas, loadPersona, matchPersonaWith, planInstall, applyInstall } from "../../src/personas/index.js";
import { read } from "../../src/sync.js";
import type { CanonicalConfig, ToolId } from "../../src/ir/types.js";
import { emptyConfig } from "../../src/ir/types.js";

describe("N. Built-in personas", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("N1: loadPersonas returns at least 5 personas with required fields", () => {
    const personas = loadPersonas();
    const ids = personas.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["frontend", "backend", "fullstack", "pm", "qa", "designer", "technical-writing"]));
    for (const p of personas) {
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.version).toBeTruthy();
      expect(p.recommendations).toBeDefined();
    }
  });

  it("N2: every recommendation has a rationale (no hand-waving)", () => {
    for (const p of loadPersonas()) {
      const r = p.recommendations;
      for (const item of [...(r.skills ?? []), ...(r.agents ?? []), ...(r.commands ?? []), ...(r.mcp ?? [])]) {
        expect(item.rationale, `${p.id}:${item.id} missing rationale`).toBeTruthy();
        expect(item.rationale.length).toBeGreaterThan(10);
      }
    }
  });

  it("N2b: curated personas stay compact and include research sources", () => {
    for (const p of loadPersonas()) {
      const r = p.recommendations;
      const items = [...(r.skills ?? []), ...(r.agents ?? []), ...(r.commands ?? []), ...(r.mcp ?? [])];
      expect(items.length, `${p.id} has too many recommendations`).toBeLessThanOrEqual(16);
      for (const item of items) {
        expect(item.source, `${p.id}:${item.id} missing source`).toMatch(/^https?:\/\//);
      }
    }
  });

  it("N3: matchPersonaWith marks installed vs missing items correctly", () => {
    const persona = loadPersona("frontend")!;
    const configs: Record<ToolId, CanonicalConfig> = {
      "claude-code": emptyConfig(),
      "opencode": emptyConfig(),
      "codex": emptyConfig(),
    };
    // Seed only frontend-design in claude-code
    configs["claude-code"].skills.push({
      id: "frontend-design", scope: "global", files: [], source: "/x",
    });
    const m = matchPersonaWith(persona, configs);
    const fd = m.items.find((i) => i.id === "frontend-design")!;
    expect(fd.status).toBe("installed");
    expect(fd.installedIn).toEqual(["claude-code"]);
    const other = m.items.find((i) => i.id === "vercel-react-best-practices")!;
    expect(other.status).toBe("missing");
    expect(other.installedIn).toEqual([]);
    expect(m.totals.total).toBeGreaterThan(0);
    expect(m.totals.installed).toBe(1);
  });

  it("N4: planInstall flags MCP as installable, others as not auto-installable", () => {
    fx = makeFixture();
    const persona = loadPersona("frontend")!;
    const plan = planInstall(persona, "claude-code", { home: fx.home, cwd: fx.project });
    expect(plan.willInstall.some((w) => w.kind === "mcp" && w.id === "playwright")).toBe(true);
    expect(plan.unsupported.some((u) => u.kind === "skills" && u.id === "frontend-design")).toBe(true);
  });

  it("N5: applyInstall writes MCP server with env vars to Claude .mcp.json", () => {
    fx = makeFixture();
    const persona = loadPersona("backend")!;
    const result = applyInstall(persona, "claude-code", { home: fx.home, cwd: fx.project });
    expect(result.applied).toBe(true);
    const file = path.join(fx.project, ".mcp.json");
    expect(fs.existsSync(file)).toBe(true);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(written.mcpServers.postgres).toBeDefined();
    expect(written.mcpServers.postgres.command).toBe("npx");
    // env_ref for DATABASE_URL is rendered as ${DATABASE_URL} in Claude format
    expect(written.mcpServers.postgres.env.DATABASE_URL).toBe("${DATABASE_URL}");
  });

  it("N6: re-reading after install shows the MCP server as installed", () => {
    fx = makeFixture();
    const persona = loadPersona("backend")!;
    applyInstall(persona, "claude-code", { home: fx.home, cwd: fx.project });
    const cfg = read("claude-code", { home: fx.home, cwd: fx.project });
    expect(cfg.mcpServers.postgres).toBeDefined();
  });
});
