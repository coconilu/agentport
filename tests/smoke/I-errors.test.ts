import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { emptyFixture, makeFixture, writeFile, type Fixture } from "../helpers.js";
import { scan } from "../../src/scan.js";
import { readOpenCode } from "../../src/adapters/opencode.js";
import { writeClaude } from "../../src/adapters/claude.js";
import { emptyConfig } from "../../src/ir/types.js";

describe("I. Error handling", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("I1: scan does not crash when tool dirs are absent", () => {
    fx = emptyFixture();
    const results = scan({ home: fx.home, cwd: fx.project });
    const codex = results.find((r) => r.tool === "codex")!;
    expect(codex.status).toBe("not-found");
    expect(codex.scopes).toEqual([]);
  });

  it("I2: corrupt JSON yields error with file path", () => {
    fx = makeFixture();
    writeFile(`${fx.project}/opencode.json`, "{ this is not valid");
    expect(() => readOpenCode({ home: fx.home, cwd: fx.project })).toThrow(/opencode\.json/);
  });

  it("I3: write creates a .bak.* backup of existing file", async () => {
    fx = makeFixture();
    const original = JSON.stringify({ mcpServers: { old: { command: "x" } } });
    writeFile(`${fx.project}/.mcp.json`, original);

    const config = emptyConfig();
    config.mcpServers.new = { transport: "stdio", command: "y" };
    writeClaude(config, { home: fx.home, cwd: fx.project });

    const files = fs.readdirSync(fx.project);
    const backups = files.filter((f) => f.startsWith(".mcp.json.bak."));
    expect(backups.length).toBe(1);
    expect(fs.readFileSync(`${fx.project}/${backups[0]}`, "utf8")).toBe(original);
  });
});
