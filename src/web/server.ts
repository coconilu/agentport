import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { scan } from "../scan.js";
import { read } from "../sync.js";
import type { ToolId } from "../ir/types.js";

export interface StartOptions {
  port?: number;
  home?: string;
  cwd?: string;
}

const TOOLS: ToolId[] = ["claude-code", "opencode", "codex"];

// Resolve src/web/public/ relative to this file. Works in both src/ (tsx) and dist/ (compiled).
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const isDev = process.env.NODE_ENV !== "production";

interface SseClient {
  res: http.ServerResponse;
}

export function createServer(opts: StartOptions = {}) {
  const sseClients = new Set<SseClient>();
  let watcher: fs.FSWatcher | null = null;
  let watchDebounce: NodeJS.Timeout | null = null;

  const broadcastReload = () => {
    for (const c of sseClients) {
      c.res.write(`event: reload\ndata: ${Date.now()}\n\n`);
    }
  };

  if (isDev && fs.existsSync(PUBLIC_DIR)) {
    watcher = fs.watch(PUBLIC_DIR, { recursive: true }, () => {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(broadcastReload, 50);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      // ===== Dev SSE =====
      if (url.pathname === "/api/dev/watch") {
        if (!isDev) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        const client: SseClient = { res };
        sseClients.add(client);
        req.on("close", () => sseClients.delete(client));
        return;
      }

      // ===== API =====
      if (url.pathname === "/api/tools") {
        const results = scan({ home: opts.home, cwd: opts.cwd });
        return json(res, 200, results);
      }
      if (url.pathname === "/api/snapshot") {
        const status = Object.fromEntries(
          scan({ home: opts.home, cwd: opts.cwd }).map((r) => [r.tool, r])
        );
        const tools: Record<string, unknown> = {};
        for (const t of TOOLS) {
          const cfg = read(t, { home: opts.home, cwd: opts.cwd });
          tools[t] = {
            status: status[t]?.status ?? "not-found",
            scopes: status[t]?.scopes ?? [],
            mcpServers: cfg.mcpServers,
            agents: cfg.agents,
            skills: cfg.skills,
            hooks: cfg.hooks,
            plugins: cfg.plugins,
            commands: cfg.commands,
            rules: cfg.rules.map((r) => ({ scope: r.scope, length: r.body.length })),
          };
        }
        return json(res, 200, { tools, generatedAt: new Date().toISOString() });
      }
      if (url.pathname.startsWith("/api/mcp/")) {
        const tool = url.pathname.slice("/api/mcp/".length) as ToolId;
        if (!TOOLS.includes(tool)) return json(res, 400, { error: "unknown tool" });
        const config = read(tool, { home: opts.home, cwd: opts.cwd });
        return json(res, 200, { tool, servers: config.mcpServers });
      }

      // ===== Static files =====
      const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.join(PUBLIC_DIR, reqPath);
      // Defense in depth: prevent path traversal
      if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          "content-type": MIME[ext] ?? "application/octet-stream",
          // No caching in dev so edits show immediately
          ...(isDev ? { "cache-control": "no-store" } : {}),
        });
        // Re-read on each request in dev (so file edits land without restart)
        res.end(fs.readFileSync(filePath));
        return;
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Clean up watcher when server closes
  const origClose = server.close.bind(server);
  server.close = ((cb?: (err?: Error) => void) => {
    if (watcher) watcher.close();
    for (const c of sseClients) c.res.end();
    sseClients.clear();
    return origClose(cb);
  }) as typeof server.close;

  return server;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function start(opts: StartOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer(opts);
    server.listen(opts.port ?? 0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.ts") ||
  process.argv[1]?.endsWith("/server.js");
if (isDirect) {
  start({ port: Number(process.env.PORT) || 3737 }).then(({ port }) => {
    process.stdout.write(`agentport web UI listening on http://localhost:${port}${isDev ? " (dev mode: hot reload enabled)" : ""}\n`);
  });
}
