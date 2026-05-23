import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, readFile, exists, type Fixture } from "../helpers.js";
import { sync } from "../../src/sync.js";

describe("F. Rules sync", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("F1: CLAUDE.md → AGENTS.md filename remap", () => {
    fx = makeFixture();
    const body = "Use TypeScript strict mode";
    writeFile(`${fx.project}/CLAUDE.md`, body);
    sync("claude-code", "opencode", { home: fx.home, cwd: fx.project });
    sync("claude-code", "codex", { home: fx.home, cwd: fx.project });
    expect(exists(`${fx.project}/AGENTS.md`)).toBe(true);
    expect(readFile(`${fx.project}/AGENTS.md`)).toBe(body);
  });

  it("F2: global vs project scope isolation", () => {
    fx = makeFixture();
    writeFile(`${fx.home}/.claude/CLAUDE.md`, "global rule");
    writeFile(`${fx.project}/CLAUDE.md`, "project rule");
    sync("claude-code", "opencode", { home: fx.home, cwd: fx.project });
    expect(readFile(`${fx.project}/AGENTS.md`)).toBe("project rule");
    expect(readFile(`${fx.home}/.config/opencode/AGENTS.md`)).toBe("global rule");
  });
});
