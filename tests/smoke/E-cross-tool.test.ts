import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, readFile, type Fixture } from "../helpers.js";
import { parse as parseToml } from "smol-toml";
import { sync } from "../../src/sync.js";

describe("E. Cross-tool migration", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("E1: Claude → OpenCode translates ${X} to {env:X}", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({
        mcpServers: { gh: { command: "npx", env: { TOKEN: "${GITHUB_TOKEN}" } } },
      })
    );
    sync("claude-code", "opencode", { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/opencode.json`));
    expect(out.mcp.gh.environment.TOKEN).toBe("{env:GITHUB_TOKEN}");
  });

  it("E2: Claude → OpenCode auto-adds type field", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["pkg"] } } })
    );
    sync("claude-code", "opencode", { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/opencode.json`));
    expect(out.mcp.fs.type).toBe("local");
  });

  it("E3: Claude → Codex produces valid TOML loadable by parser", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({
        mcpServers: {
          x: { command: "npx", args: ["pkg"], env: { K: "literal-value" } },
        },
      })
    );
    sync("claude-code", "codex", { home: fx.home, cwd: fx.project });
    const toml = readFile(`${fx.home}/.codex/config.toml`);
    const parsed = parseToml(toml) as any;
    expect(parsed.mcp_servers.x.command).toBe("npx");
    expect(parsed.mcp_servers.x.args).toEqual(["pkg"]);
    expect(parsed.mcp_servers.x.env).toEqual({ K: "literal-value" });
  });

  it("E4: OpenCode {env:X} → Codex env_vars array", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/opencode.json`,
      JSON.stringify({
        mcp: {
          y: {
            type: "local",
            command: ["x"],
            environment: { K: "{env:MY_VAR}" },
          },
        },
      })
    );
    sync("opencode", "codex", { home: fx.home, cwd: fx.project });
    const toml = readFile(`${fx.home}/.codex/config.toml`);
    const parsed = parseToml(toml) as any;
    expect(parsed.mcp_servers.y.env_vars).toEqual(["MY_VAR"]);
    expect(parsed.mcp_servers.y.env?.K).toBeUndefined();
  });
});
