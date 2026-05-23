import { describe, it, expect, afterEach } from "vitest";
import { makeFixture, type Fixture } from "../helpers.js";
import { start } from "../../src/web/server.js";

describe("L. Dev hot-reload plumbing", () => {
  let fx: Fixture;
  let server: { port: number; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (server) await server.close();
    server = null;
    fx?.cleanup();
  });

  it("L1: /api/dev/watch responds with SSE content-type in dev mode", async () => {
    fx = makeFixture();
    server = await start({ home: fx.home, cwd: fx.project, port: 0 });
    // Use AbortController so we don't hang reading the never-ending stream
    const ctl = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/dev/watch`, { signal: ctl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    ctl.abort();
  });

  it("L2: static assets served from public/ with no-store in dev", async () => {
    fx = makeFixture();
    server = await start({ home: fx.home, cwd: fx.project, port: 0 });
    const css = await fetch(`http://localhost:${server.port}/styles.css`);
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/text\/css/);
    expect(css.headers.get("cache-control")).toBe("no-store");

    const js = await fetch(`http://localhost:${server.port}/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
  });

  it("L3: path traversal is blocked", async () => {
    fx = makeFixture();
    server = await start({ home: fx.home, cwd: fx.project, port: 0 });
    const res = await fetch(`http://localhost:${server.port}/../package.json`);
    // node:http normalizes /../ before our handler sees it, so this returns 404 not 403,
    // but the key is: it does NOT serve package.json.
    expect([403, 404]).toContain(res.status);
    const text = await res.text();
    expect(text).not.toContain('"name": "agentport"');
  });
});
