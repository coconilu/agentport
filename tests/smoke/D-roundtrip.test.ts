import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, readFile, type Fixture } from "../helpers.js";
import { parse as parseToml } from "smol-toml";
import { readClaude, writeClaude } from "../../src/adapters/claude.js";
import { readOpenCode, writeOpenCode } from "../../src/adapters/opencode.js";
import { readCodex, writeCodex } from "../../src/adapters/codex.js";

describe("D. Round-trip integrity", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("D1: Claude → IR → Claude is semantically equal", () => {
    fx = makeFixture();
    const original = {
      mcpServers: {
        a: { command: "npx", args: ["-y", "p"], env: { K: "v" } },
        b: { url: "https://x.com/mcp", headers: { Auth: "Bearer t" } },
      },
    };
    writeFile(`${fx.project}/.mcp.json`, JSON.stringify(original));
    const first = readClaude({ home: fx.home, cwd: fx.project });
    writeClaude(first, { home: fx.home, cwd: fx.project });
    const second = readClaude({ home: fx.home, cwd: fx.project });
    expect(second.mcpServers).toEqual(first.mcpServers);
  });

  it("D2: OpenCode {env:X} round-trip preserves env_ref (not literal)", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/opencode.json`,
      JSON.stringify({
        mcp: {
          gh: {
            type: "local",
            command: ["npx"],
            environment: { TOKEN: "{env:GITHUB_TOKEN}" },
          },
        },
      })
    );
    const ir = readOpenCode({ home: fx.home, cwd: fx.project });
    expect(ir.mcpServers.gh!.env!.TOKEN).toEqual({ kind: "env_ref", name: "GITHUB_TOKEN" });
    writeOpenCode(ir, { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/opencode.json`));
    expect(out.mcp.gh.environment.TOKEN).toBe("{env:GITHUB_TOKEN}");
  });

  it("D3: Codex env_vars survives round-trip in env_vars (not env table)", () => {
    fx = makeFixture();
    writeFile(
      `${fx.home}/.codex/config.toml`,
      `[mcp_servers.s]\ncommand = "x"\nenv_vars = ["A", "B"]\n`
    );
    const ir = readCodex({ home: fx.home, cwd: fx.project });
    writeCodex(ir, { home: fx.home, cwd: fx.project });
    const parsed = parseToml(readFile(`${fx.home}/.codex/config.toml`)) as any;
    expect(new Set(parsed.mcp_servers.s.env_vars)).toEqual(new Set(["A", "B"]));
    expect(parsed.mcp_servers.s.env).toBeUndefined();
  });
});
