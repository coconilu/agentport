import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DeviceSyncConfig } from "./types.js";

export interface ConfigOptions {
  home?: string;
}

function configFile(opts: ConfigOptions = {}): string {
  const home = opts.home ?? process.env.HOME ?? os.homedir();
  return path.join(home, ".agentport", "sync.json");
}

export function readSyncConfig(opts: ConfigOptions = {}): DeviceSyncConfig {
  const file = configFile(opts);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DeviceSyncConfig;
  } catch {
    return {};
  }
}

export function writeSyncConfig(cfg: DeviceSyncConfig, opts: ConfigOptions = {}): string {
  const file = configFile(opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}

export function syncRoot(opts: ConfigOptions = {}): string {
  const home = opts.home ?? process.env.HOME ?? os.homedir();
  return path.join(home, ".agentport", "sync-repo");
}
