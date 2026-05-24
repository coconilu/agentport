import fs from "node:fs";
import path from "node:path";
import { buildBundle, serialize, parseBundle, diffBundles } from "./bundle.js";
import { encryptBundle, decryptBundle, looksLikeSecret } from "./encrypt.js";
import { readSyncConfig, writeSyncConfig, syncRoot } from "./config.js";
import { isRepo, initRepo, setRemote, cloneRepo, commitAll, pushUpstream, pullRebase, statusShort } from "./git.js";
import type { Bundle, EncryptedBundle, DeviceSyncConfig } from "./types.js";
import type { ResolveOptions } from "../adapters/paths.js";

const BUNDLE_FILENAME = "agentport-bundle.json.enc";

export interface SyncOpts extends ResolveOptions {
  passphrase: string;
}

export interface InitOpts extends ResolveOptions {
  remote: string;
}

export function init(opts: InitOpts): { repoDir: string; configFile: string } {
  const root = syncRoot(opts);
  const cfg: DeviceSyncConfig = { remote: opts.remote, defaultBranch: "main", bundlePath: BUNDLE_FILENAME };
  const cfgFile = writeSyncConfig(cfg, opts);
  // If the remote is an existing repo, clone it; otherwise init fresh and set remote.
  if (!isRepo(root)) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    try {
      cloneRepo(opts.remote, root);
    } catch {
      // Empty remote → init locally and point origin at it.
      initRepo(root);
      setRemote(root, opts.remote);
    }
  } else {
    setRemote(root, opts.remote);
  }
  return { repoDir: root, configFile: cfgFile };
}

export interface PushResult {
  warnings: string[];
  pushed: boolean;
  bundleFile: string;
}

export function push(opts: SyncOpts): PushResult {
  const cfg = readSyncConfig(opts);
  if (!cfg.remote) throw new Error("no remote configured — run `agentport sync init <url>` first");
  const root = syncRoot(opts);
  if (!isRepo(root)) throw new Error(`sync repo missing at ${root} — run init again`);

  const bundle = buildBundle(opts);
  const warnings = detectLiteralSecrets(bundle);
  const plaintext = serialize(bundle);
  const encrypted = encryptBundle(plaintext, opts.passphrase);
  const target = path.join(root, cfg.bundlePath ?? BUNDLE_FILENAME);
  fs.writeFileSync(target, JSON.stringify(encrypted, null, 2));
  const committed = commitAll(root, `sync from ${bundle.hostname ?? "device"} at ${bundle.generatedAt}`);
  if (committed) pushUpstream(root, cfg.defaultBranch ?? "main");
  return { warnings, pushed: committed, bundleFile: target };
}

export interface PullResult {
  warnings: string[];
  bundle: Bundle;
  diff: ReturnType<typeof diffBundles>;
  applied: boolean;
}

// pull = fetch + decrypt + return diff (caller decides to apply via applyPulled)
export function pull(opts: SyncOpts): PullResult {
  const cfg = readSyncConfig(opts);
  if (!cfg.remote) throw new Error("no remote configured — run `agentport sync init <url>` first");
  const root = syncRoot(opts);
  if (!isRepo(root)) throw new Error(`sync repo missing at ${root} — run init again`);

  pullRebase(root, cfg.defaultBranch ?? "main");
  const bundleFile = path.join(root, cfg.bundlePath ?? BUNDLE_FILENAME);
  if (!fs.existsSync(bundleFile)) throw new Error(`no bundle in remote (${bundleFile})`);
  const enc = JSON.parse(fs.readFileSync(bundleFile, "utf8")) as EncryptedBundle;
  const plaintext = decryptBundle(enc, opts.passphrase);
  const remote = parseBundle(plaintext);
  const local = buildBundle(opts);
  const diff = diffBundles(remote, local);
  return { warnings: [], bundle: remote, diff, applied: false };
}

export interface StatusResult {
  configured: boolean;
  remote?: string;
  ahead: string | null;
  behind: string | null;
  dirty: boolean;
  bundlePresentRemote: boolean;
}

export function status(opts: ResolveOptions = {}): StatusResult {
  const cfg = readSyncConfig(opts);
  if (!cfg.remote) return { configured: false, ahead: null, behind: null, dirty: false, bundlePresentRemote: false };
  const root = syncRoot(opts);
  if (!isRepo(root)) {
    return { configured: true, remote: cfg.remote, ahead: null, behind: null, dirty: false, bundlePresentRemote: false };
  }
  const gst = statusShort(root);
  const bundleFile = path.join(root, cfg.bundlePath ?? BUNDLE_FILENAME);
  return {
    configured: true,
    remote: cfg.remote,
    ahead: gst.aheadOf,
    behind: gst.behindOf,
    dirty: gst.dirty,
    bundlePresentRemote: fs.existsSync(bundleFile),
  };
}

function detectLiteralSecrets(bundle: Bundle): string[] {
  const warnings: string[] = [];
  for (const [toolId, cfg] of Object.entries(bundle.tools)) {
    for (const [name, server] of Object.entries(cfg.mcpServers)) {
      for (const [k, v] of Object.entries(server.env ?? {})) {
        if (v.kind === "literal" && looksLikeSecret(v.value)) {
          warnings.push(`${toolId}:mcp/${name}:env/${k} — value looks like a token; it will be encrypted, but consider using \${${k}} env_ref instead`);
        }
      }
    }
  }
  return warnings;
}

export { buildBundle, serialize, parseBundle, diffBundles } from "./bundle.js";
export { encryptBundle, decryptBundle, looksLikeSecret } from "./encrypt.js";
export { readSyncConfig, writeSyncConfig, syncRoot } from "./config.js";
export type { Bundle, EncryptedBundle, DeviceSyncConfig } from "./types.js";
