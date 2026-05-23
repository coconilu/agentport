import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, readFile, type Fixture } from "../helpers.js";
import { parse as parseToml } from "smol-toml";
import { writeClaude } from "../../src/adapters/claude.js";
import { writeOpenCode } from "../../src/adapters/opencode.js";
import { writeCodex } from "../../src/adapters/codex.js";
import { emptyConfig } from "../../src/ir/types.js";
import { envRef, literal, template } from "../../src/ir/envValue.js";

describe("C. MCP write (IR → Tool)", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("C1: Claude writes mcpServers field, no type, args as array", () => {
    fx = makeFixture();
    const config = emptyConfig();
    config.mcpServers.fs = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "pkg"],
    };
    writeClaude(config, { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/.mcp.json`));
    expect(out.mcpServers).toBeDefined();
    expect(out.mcp).toBeUndefined();
    expect(out.mcp_servers).toBeUndefined();
    expect(out.mcpServers.fs.type).toBeUndefined();
    expect(out.mcpServers.fs.args).toEqual(["-y", "pkg"]);
    expect(out.mcpServers.fs.command).toBe("npx");
  });

  it("C2: OpenCode writes mcp field with type, merged command array, {env:X}", () => {
    fx = makeFixture();
    const config = emptyConfig();
    config.mcpServers.gh = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "pkg"],
      env: { TOKEN: envRef("GITHUB_TOKEN") },
    };
    writeOpenCode(config, { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/opencode.json`));
    expect(out.mcp).toBeDefined();
    expect(out.mcpServers).toBeUndefined();
    expect(out.mcp.gh.type).toBe("local");
    expect(out.mcp.gh.command).toEqual(["npx", "-y", "pkg"]);
    expect(out.mcp.gh.environment.TOKEN).toBe("{env:GITHUB_TOKEN}");
  });

  it("C3: Codex writes TOML with env_vars array and [env] table separation", () => {
    fx = makeFixture();
    const config = emptyConfig();
    config.mcpServers.search = {
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-search"],
      env: {
        BRAVE_API_KEY: envRef("BRAVE_API_KEY"),
        REGION: literal("us-east"),
      },
    };
    writeCodex(config, { home: fx.home, cwd: fx.project });
    const tomlText = readFile(`${fx.home}/.codex/config.toml`);
    const parsed = parseToml(tomlText) as any;
    expect(parsed.mcp_servers.search.command).toBe("uvx");
    expect(parsed.mcp_servers.search.env_vars).toEqual(["BRAVE_API_KEY"]);
    expect(parsed.mcp_servers.search.env).toEqual({ REGION: "us-east" });
  });

  it("C4: OpenCode preserves enabled:false", () => {
    fx = makeFixture();
    const config = emptyConfig();
    config.mcpServers.x = {
      transport: "stdio",
      command: "npx",
      enabled: false,
    };
    writeOpenCode(config, { home: fx.home, cwd: fx.project });
    const out = JSON.parse(readFile(`${fx.project}/opencode.json`));
    expect(out.mcp.x.enabled).toBe(false);
  });
});
