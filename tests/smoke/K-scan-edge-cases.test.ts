import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { readClaude } from "../../src/adapters/claude.js";

describe("K. Scanner edge cases (regressions from real ~/.claude/)", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("K1: symlinked skill directory is detected", () => {
    fx = makeFixture();
    // Real skill dir somewhere outside .claude
    const realSkill = path.join(fx.root, "external-skills", "my-symlinked-skill");
    fs.mkdirSync(realSkill, { recursive: true });
    writeFile(path.join(realSkill, "SKILL.md"), `---\ndescription: Via symlink\n---\n`);
    // Symlink under ~/.claude/skills/
    const skillsParent = path.join(fx.home, ".claude", "skills");
    fs.mkdirSync(skillsParent, { recursive: true });
    fs.symlinkSync(realSkill, path.join(skillsParent, "my-symlinked-skill"));

    const cfg = readClaude({ home: fx.home, cwd: fx.project });
    const found = cfg.skills.find((s) => s.id === "my-symlinked-skill");
    expect(found).toBeDefined();
    expect(found!.description).toBe("Via symlink");
  });

  it("K2: directory-style agent with AGENT.md is detected", () => {
    fx = makeFixture();
    const agentDir = path.join(fx.home, ".claude", "agents", "component-scanner");
    fs.mkdirSync(agentDir, { recursive: true });
    writeFile(path.join(agentDir, "AGENT.md"), `---\nname: component-scanner\ndescription: Scans components\n---\nBody`);
    const cfg = readClaude({ home: fx.home, cwd: fx.project });
    const found = cfg.agents.find((a) => a.id === "component-scanner");
    expect(found).toBeDefined();
    expect(found!.name).toBe("component-scanner");
    expect(found!.description).toBe("Scans components");
  });

  it("K3: Claude plugin marketplace structure is enumerated", () => {
    fx = makeFixture();
    const pluginRoot = path.join(
      fx.home,
      ".claude",
      "plugins",
      "marketplaces",
      "claude-plugins-official",
      "plugins",
      "feature-dev"
    );
    writeFile(path.join(pluginRoot, "agents", "code-architect.md"), `---\ndescription: Designs systems\n---\n`);
    writeFile(path.join(pluginRoot, "commands", "feature-dev.md"), `---\ndescription: Run flow\n---\n`);
    writeFile(path.join(pluginRoot, "skills", "skill-x", "SKILL.md"), `---\ndescription: From plugin\n---\n`);
    writeFile(path.join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ hooks: { PreToolUse: {} } }));

    const cfg = readClaude({ home: fx.home, cwd: fx.project });
    const agent = cfg.agents.find((a) => a.id === "code-architect");
    expect(agent).toBeDefined();
    expect(agent!.plugin).toBe("feature-dev");
    const cmd = cfg.commands.find((c) => c.id === "feature-dev");
    expect(cmd!.plugin).toBe("feature-dev");
    const skill = cfg.skills.find((s) => s.id === "skill-x");
    expect(skill!.plugin).toBe("feature-dev");
    const plug = cfg.plugins.find((p) => p.id === "feature-dev");
    expect(plug).toBeDefined();
    expect(plug!.marketplace).toBe("claude-plugins-official");
    // Hook surfaced from plugin.json
    expect(cfg.hooks.some((h) => h.event === "PreToolUse" && h.command.includes("feature-dev"))).toBe(true);
  });
});
