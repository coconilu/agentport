import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { makeFixture, emptyFixture, writeFile, type Fixture } from "../helpers.js";
import { scan } from "../../src/scan.js";

describe("A. Tool detection", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("A1: detects all three tools when all global dirs exist", () => {
    fx = makeFixture();
    const results = scan({ home: fx.home, cwd: fx.project });
    const byTool = Object.fromEntries(results.map((r) => [r.tool, r]));
    expect(byTool["claude-code"]!.status).toBe("detected");
    expect(byTool["opencode"]!.status).toBe("detected");
    expect(byTool["codex"]!.status).toBe("detected");
  });

  it("A2: marks only Claude as detected when only Claude is installed", () => {
    fx = emptyFixture();
    writeFile(`${fx.home}/.claude/settings.json`, "{}");
    const results = scan({ home: fx.home, cwd: fx.project });
    const byTool = Object.fromEntries(results.map((r) => [r.tool, r]));
    expect(byTool["claude-code"]!.status).toBe("detected");
    expect(byTool["opencode"]!.status).toBe("not-found");
    expect(byTool["codex"]!.status).toBe("not-found");
  });

  it("A3: distinguishes global vs project scope", () => {
    fx = makeFixture();
    writeFile(`${fx.project}/.claude/settings.json`, "{}");
    const results = scan({ home: fx.home, cwd: fx.project });
    const claude = results.find((r) => r.tool === "claude-code")!;
    expect(claude.scopes).toContain("global");
    expect(claude.scopes).toContain("project");
  });
});
