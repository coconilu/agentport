import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { HubCatalog } from "./types.js";

const DEFAULT_TTL_MS = 24 * 3600 * 1000;

export interface CacheOptions {
  home?: string;
  ttlMs?: number;
}

function hubsDir(opts: CacheOptions = {}): string {
  const home = opts.home ?? process.env.HOME ?? os.homedir();
  return path.join(home, ".agentport", "hubs");
}

export function cacheFile(hubId: string, opts: CacheOptions = {}): string {
  return path.join(hubsDir(opts), `${hubId}.json`);
}

export function readCachedCatalog(hubId: string, opts: CacheOptions = {}): HubCatalog | null {
  const file = cacheFile(hubId, opts);
  if (!fs.existsSync(file)) return null;
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  if (ttl <= 0) return null;
  const stat = fs.statSync(file);
  const age = Math.max(0, Date.now() - stat.mtimeMs);
  if (age >= ttl) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as HubCatalog;
  } catch {
    return null;
  }
}

export function writeCachedCatalog(catalog: HubCatalog, opts: CacheOptions = {}): string {
  fs.mkdirSync(hubsDir(opts), { recursive: true });
  const file = cacheFile(catalog.hubId, opts);
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2));
  return file;
}
