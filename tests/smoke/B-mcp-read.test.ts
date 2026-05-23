import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { readClaude } from "../../src/adapters/claude.js";
import { readOpenCode } from "../../src/adapters/opencode.js";
import { readCodex } from "../../src/adapters/codex.js";

describe("B. MCP read (Tool → IR)", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("B1: Claude .mcp.json → IR with literal env", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            env: { DEBUG: "1" },
          },
        },
      })
    );
    const config = readClaude({ home: fx.home, cwd: fx.project });
    const srv = config.mcpServers.filesystem!;
    expect(srv.transport).toBe("stdio");
    expect(srv.command).toBe("npx");
    expect(srv.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
    expect(srv.env!.DEBUG).toEqual({ kind: "literal", value: "1" });
  });

  it("B2: OpenCode mcp field with {env:X} → structured env_ref", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/opencode.json`,
      JSON.stringify({
        mcp: {
          github: {
            type: "local",
            command: ["npx", "-y", "@modelcontextprotocol/server-github"],
            environment: { GITHUB_TOKEN: "{env:GH_TOKEN}" },
          },
        },
      })
    );
    const config = readOpenCode({ home: fx.home, cwd: fx.project });
    const srv = config.mcpServers.github!;
    expect(srv.transport).toBe("stdio");
    expect(srv.command).toBe("npx");
    expect(srv.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
    expect(srv.env!.GITHUB_TOKEN).toEqual({ kind: "env_ref", name: "GH_TOKEN" });
  });

  it("B3: Codex env_vars array → env_ref entries", () => {
    fx = makeFixture();
    writeFile(
      `${fx.home}/.codex/config.toml`,
      `[mcp_servers.search]\ncommand = "uvx"\nargs = ["mcp-server-search"]\nenv_vars = ["BRAVE_API_KEY"]\n`
    );
    const config = readCodex({ home: fx.home, cwd: fx.project });
    const srv = config.mcpServers.search!;
    expect(srv.transport).toBe("stdio");
    expect(srv.command).toBe("uvx");
    expect(srv.env!.BRAVE_API_KEY).toEqual({ kind: "env_ref", name: "BRAVE_API_KEY" });
  });

  it("B4: OpenCode remote HTTP server", () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/opencode.json`,
      JSON.stringify({
        mcp: {
          api: {
            type: "remote",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer {env:API_TOKEN}" },
          },
        },
      })
    );
    const config = readOpenCode({ home: fx.home, cwd: fx.project });
    const srv = config.mcpServers.api!;
    expect(srv.transport).toBe("http");
    expect(srv.url).toBe("https://example.com/mcp");
    expect(srv.headers!.Authorization).toEqual({
      kind: "template",
      parts: [
        { kind: "literal", value: "Bearer " },
        { kind: "env_ref", name: "API_TOKEN" },
      ],
    });
  });
});
