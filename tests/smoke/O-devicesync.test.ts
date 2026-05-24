import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { makeFixture, writeFile, type Fixture } from "../helpers.js";
import {
  buildBundle, serialize, parseBundle, diffBundles,
  encryptBundle, decryptBundle, looksLikeSecret,
} from "../../src/devicesync/index.js";
import * as devicesync from "../../src/devicesync/index.js";
import { read } from "../../src/sync.js";

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function mkBareRepo(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentport-bare-"));
  execFileSync("git", ["init", "--bare", "-b", "main", tmp], { stdio: "ignore" });
  return tmp;
}

describe("O. Cross-device sync", () => {
  let fx: Fixture;
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    fx?.cleanup();
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it("O1: encrypt/decrypt round-trip with correct passphrase", () => {
    const enc = encryptBundle("hello world", "s3cret");
    expect(enc.alg).toBe("AES-256-GCM");
    expect(decryptBundle(enc, "s3cret")).toBe("hello world");
  });

  it("O2: wrong passphrase throws a clear error", () => {
    const enc = encryptBundle("payload", "right-pass");
    expect(() => decryptBundle(enc, "wrong-pass")).toThrow(/passphrase|corrupted/);
  });

  it("O3: looksLikeSecret detects common token patterns", () => {
    expect(looksLikeSecret("sk-abc1234567890abcdef1234")).toBe(true);
    expect(looksLikeSecret("ghp_" + "x".repeat(36))).toBe(true);
    expect(looksLikeSecret("hello")).toBe(false);
    expect(looksLikeSecret("DEBUG")).toBe(false);
  });

  it("O4: buildBundle / serialize / parseBundle round-trip preserves IR", () => {
    fx = makeFixture();
    writeFile(`${fx.project}/.mcp.json`, JSON.stringify({
      mcpServers: { fs: { command: "npx", args: ["pkg"], env: { K: "v" } } },
    }));
    const b1 = buildBundle({ home: fx.home, cwd: fx.project });
    const text = serialize(b1);
    const b2 = parseBundle(text);
    expect(b2.tools["claude-code"].mcpServers.fs).toEqual(b1.tools["claude-code"].mcpServers.fs);
  });

  it("O5: diffBundles detects added/removed MCP servers", () => {
    fx = makeFixture();
    const local = buildBundle({ home: fx.home, cwd: fx.project });
    // Mutate a copy to simulate a remote that added an MCP server
    const remoteRaw = parseBundle(serialize(local));
    remoteRaw.tools["claude-code"].mcpServers.newSrv = { transport: "stdio", command: "x" };
    const diff = diffBundles(remoteRaw, local);
    expect(diff.changedTools).toContain("claude-code");
    expect(diff.perTool["claude-code"].mcp.added).toContain("newSrv");
  });

  it("O6: init + push + pull end-to-end via a local bare git repo", () => {
    if (!gitAvailable()) {
      console.warn("git not available — skipping O6");
      return;
    }
    fx = makeFixture();
    // Seed some content so the bundle isn't empty
    writeFile(`${fx.project}/.mcp.json`, JSON.stringify({
      mcpServers: { e2eSrv: { command: "npx", args: ["x"], env: { TOKEN: "${MY_TOKEN}" } } },
    }));
    const bare = mkBareRepo();
    cleanups.push(() => fs.rmSync(bare, { recursive: true, force: true }));

    devicesync.init({ home: fx.home, cwd: fx.project, remote: bare });
    const pushResult = devicesync.push({ home: fx.home, cwd: fx.project, passphrase: "p4ss" });
    expect(pushResult.pushed).toBe(true);
    expect(fs.existsSync(pushResult.bundleFile)).toBe(true);

    const pullResult = devicesync.pull({ home: fx.home, cwd: fx.project, passphrase: "p4ss" });
    // Local and just-pushed remote are identical → no diff
    expect(pullResult.diff.changedTools.length).toBe(0);
    expect(pullResult.bundle.tools["claude-code"].mcpServers.e2eSrv).toBeDefined();
  });

  it("O7: status reports configured + remote URL", () => {
    if (!gitAvailable()) return;
    fx = makeFixture();
    const bare = mkBareRepo();
    cleanups.push(() => fs.rmSync(bare, { recursive: true, force: true }));
    devicesync.init({ home: fx.home, cwd: fx.project, remote: bare });
    const s = devicesync.status({ home: fx.home, cwd: fx.project });
    expect(s.configured).toBe(true);
    expect(s.remote).toBe(bare);
  });

  it("O8: secret-pattern warning fires when pushing a literal token", () => {
    if (!gitAvailable()) return;
    fx = makeFixture();
    writeFile(`${fx.project}/.mcp.json`, JSON.stringify({
      mcpServers: {
        leaky: { command: "x", env: { API_KEY: "sk-" + "x".repeat(40) } },
      },
    }));
    const bare = mkBareRepo();
    cleanups.push(() => fs.rmSync(bare, { recursive: true, force: true }));
    devicesync.init({ home: fx.home, cwd: fx.project, remote: bare });
    const r = devicesync.push({ home: fx.home, cwd: fx.project, passphrase: "p" });
    expect(r.warnings.some((w) => w.includes("API_KEY"))).toBe(true);
  });
});
