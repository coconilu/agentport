import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { readClaude } from "../../src/adapters/claude.js";
import { readOpenCode } from "../../src/adapters/opencode.js";
import { readCodex } from "../../src/adapters/codex.js";
import { start } from "../../src/web/server.js";

describe("J. Filesystem resource scanning", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("J1: Claude scans agents/skills/commands across global+project", () => {
    fx = makeFixture();
    writeFile(
      `${fx.home}/.claude/agents/code-reviewer.md`,
      `---\nname: code-reviewer\ndescription: Reviews code\n---\nBody here.\n`
    );
    writeFile(
      `${fx.project}/.claude/agents/local-helper.md`,
      `---\ndescription: Project-only helper\n---\n`
    );
    writeFile(`${fx.home}/.claude/skills/my-skill/SKILL.md`, `---\ndescription: Does X\n---\n`);
    writeFile(`${fx.home}/.claude/skills/my-skill/script.py`, `print("hi")\n`);
    writeFile(`${fx.home}/.claude/commands/deploy.md`, `---\ndescription: Deploy\n---\nrun stuff`);

    const cfg = readClaude({ home: fx.home, cwd: fx.project });
    expect(cfg.agents.map((a) => a.id).sort()).toEqual(["code-reviewer", "local-helper"]);
    expect(cfg.agents.find((a) => a.id === "code-reviewer")!.description).toBe("Reviews code");
    expect(cfg.agents.find((a) => a.id === "local-helper")!.scope).toBe("project");
    expect(cfg.skills.length).toBe(1);
    expect(cfg.skills[0]!.description).toBe("Does X");
    expect(cfg.skills[0]!.files.sort()).toEqual(["SKILL.md", "script.py"]);
    expect(cfg.commands.map((c) => c.id)).toEqual(["deploy"]);
  });

  it("J2: OpenCode scans plugins directory", () => {
    fx = makeFixture();
    writeFile(`${fx.home}/.config/opencode/plugins/cool-plugin/index.js`, `module.exports = {}`);
    writeFile(`${fx.project}/.opencode/plugins/local-plugin/package.json`, `{}`);
    const cfg = readOpenCode({ home: fx.home, cwd: fx.project });
    const ids = cfg.plugins.map((p) => p.id).sort();
    expect(ids).toEqual(["cool-plugin", "local-plugin"]);
  });

  it("J3: Codex scans ~/.agents/skills (open agent skills standard)", () => {
    fx = makeFixture();
    writeFile(`${fx.home}/.agents/skills/shared-skill/SKILL.md`, `---\ndescription: Open\n---`);
    const cfg = readCodex({ home: fx.home, cwd: fx.project });
    expect(cfg.skills.map((s) => s.id)).toContain("shared-skill");
  });

  it("J4: Web /api/snapshot returns all 6 categories per tool", async () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({ mcpServers: { a: { command: "x" } } })
    );
    writeFile(`${fx.home}/.claude/agents/r.md`, `---\nname: r\n---`);
    writeFile(`${fx.home}/.config/opencode/plugins/p1/x.js`, ``);
    const { port, close } = await start({ home: fx.home, cwd: fx.project, port: 0 });
    try {
      const res = await fetch(`http://localhost:${port}/api/snapshot`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.tools["claude-code"]).toBeDefined();
      expect(data.tools["claude-code"].mcpServers.a).toBeDefined();
      expect(data.tools["claude-code"].agents.length).toBe(1);
      expect(data.tools["opencode"].plugins.length).toBe(1);
      expect(data.tools["codex"]).toBeDefined();
      // Every tool entry must include all 6 category fields
      for (const t of ["claude-code", "opencode", "codex"]) {
        for (const k of ["mcpServers", "agents", "skills", "hooks", "plugins", "commands"]) {
          expect(data.tools[t]).toHaveProperty(k);
        }
      }
    } finally {
      await close();
    }
  });
});
