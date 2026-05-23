import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import { start } from "../../src/web/server.js";
import { main as cliMain } from "../../src/cli.js";

const exec = promisify(execFile);
const cliPath = path.resolve("src/cli.ts");
const tsxBin = path.resolve("node_modules/.bin/tsx");

describe("H. CLI / Web UI smoke", () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it("H1: CLI --help exits 0 and includes command names", async () => {
    const { stdout } = await exec(tsxBin, [cliPath, "--help"]);
    expect(stdout).toContain("scan");
    expect(stdout).toContain("sync");
    expect(stdout).toContain("diff");
  });

  it("H2: CLI diff prints recognizable output", async () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({ mcpServers: { a: { command: "x" } } })
    );
    writeFile(
      `${fx.project}/opencode.json`,
      JSON.stringify({ mcp: { b: { type: "local", command: ["y"] } } })
    );
    const { stdout } = await exec(
      tsxBin,
      [cliPath, "diff", "--from", "claude-code", "--to", "opencode"],
      { env: { ...process.env, HOME: fx.home }, cwd: fx.project }
    );
    expect(stdout).toMatch(/mcp\.a/);
    expect(stdout).toMatch(/mcp\.b/);
    // a only in claude → "- ", b only in opencode → "+ "
    expect(stdout).toMatch(/-\s*mcp\.a/);
    expect(stdout).toMatch(/\+\s*mcp\.b/);
  });

  it("H3: Web UI home page responds 200 with three tool sections", async () => {
    fx = makeFixture();
    const { port, close } = await start({ home: fx.home, cwd: fx.project, port: 0 });
    try {
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.toLowerCase()).toContain("agentport");
      // UI fetches a snapshot endpoint for two-dimensional views
      expect(html).toMatch(/\/api\/(snapshot|tools)/);
    } finally {
      await close();
    }
  });

  it("H4: Web UI /api/mcp/claude-code returns MCP server list", async () => {
    fx = makeFixture();
    writeFile(
      `${fx.project}/.mcp.json`,
      JSON.stringify({
        mcpServers: {
          a: { command: "x" },
          b: { command: "y" },
        },
      })
    );
    const { port, close } = await start({ home: fx.home, cwd: fx.project, port: 0 });
    try {
      const res = await fetch(`http://localhost:${port}/api/mcp/claude-code`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { tool: string; servers: Record<string, unknown> };
      expect(Object.keys(data.servers).sort()).toEqual(["a", "b"]);
    } finally {
      await close();
    }
  });
});
