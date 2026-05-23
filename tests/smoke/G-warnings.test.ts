import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, readFile, exists, type Fixture } from "../helpers.js";
import { sync, read, write } from "../../src/sync.js";

describe("G. Capability-gap warnings (no silent loss)", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("G1: Claude → OpenCode warns when a hook is dropped", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.claude/settings.json`,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
          ],
        },
      })
    );
    const report = sync("claude-code", "opencode", { home: fx.home, cwd: fx.project });
    expect(report.warnings.length).toBeGreaterThanOrEqual(1);
    expect(report.warnings[0]!.message.toLowerCase()).toContain("hook");
    expect(report.warnings[0]!.message.toLowerCase()).toContain("opencode");
    expect(report.warnings[0]!.kind).toBe("capability-dropped");
    // OpenCode output must NOT contain the hook anywhere.
    const ocFile = `${fx.project}/opencode.json`;
    if (exists(ocFile)) {
      expect(readFile(ocFile)).not.toContain("PreToolUse");
    }
  });

  it("G2: OpenCode plugin → Claude warns when dropped", () => {
    fx = makeFixture();
    const ir = read("opencode", { home: fx.home, cwd: fx.project });
    ir.plugins.push({ id: "my-plugin", config: { enabled: true } });
    const { warnings } = write("claude-code", ir, { home: fx.home, cwd: fx.project });
    expect(warnings.some((w) => w.message.includes("plugin"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("claude-code"))).toBe(true);
  });

  it("G3: IR preserves hook across a sync that drops it", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.claude/settings.json`,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "echo a" }] }],
        },
      })
    );
    const ir = read("claude-code", { home: fx.home, cwd: fx.project });
    expect(ir.hooks.length).toBe(1);
    // syncing to OpenCode drops it
    write("opencode", ir, { home: fx.home, cwd: fx.project });
    // The original IR object should still have the hook (we mutate a copy inside write)
    expect(ir.hooks.length).toBe(1);
    // Re-reading Claude still has the hook
    const ir2 = read("claude-code", { home: fx.home, cwd: fx.project });
    expect(ir2.hooks.length).toBe(1);
  });
});
