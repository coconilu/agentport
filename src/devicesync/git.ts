import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface GitOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

function run(args: string[], opts: GitOptions): string {
  return execFileSync("git", args, {
    cwd: opts.cwd,
    encoding: "utf8",
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function cloneRepo(remote: string, localDir: string): void {
  fs.mkdirSync(path.dirname(localDir), { recursive: true });
  execFileSync("git", ["clone", remote, localDir], { stdio: ["ignore", "pipe", "pipe"] });
}

export function isRepo(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  try {
    run(["rev-parse", "--is-inside-work-tree"], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  run(["init", "-b", "main"], { cwd: dir });
}

export function setRemote(dir: string, remote: string): void {
  try {
    run(["remote", "remove", "origin"], { cwd: dir });
  } catch { /* origin may not exist */ }
  run(["remote", "add", "origin", remote], { cwd: dir });
}

export function commitAll(dir: string, message: string): boolean {
  run(["add", "-A"], { cwd: dir });
  try {
    // returns non-zero if nothing to commit
    run(["diff", "--cached", "--quiet"], { cwd: dir });
    return false; // nothing staged
  } catch {
    run(["-c", "user.email=agentport@local", "-c", "user.name=agentport", "commit", "-m", message], { cwd: dir });
    return true;
  }
}

export function pushUpstream(dir: string, branch = "main"): void {
  run(["push", "-u", "origin", branch], { cwd: dir });
}

export function pullRebase(dir: string, branch = "main"): void {
  run(["fetch", "origin"], { cwd: dir });
  run(["checkout", "-B", branch, "origin/" + branch], { cwd: dir });
}

export function statusShort(dir: string): { aheadOf: string | null; behindOf: string | null; dirty: boolean } {
  try {
    const upstream = run(["rev-parse", "--abbrev-ref", "@{upstream}"], { cwd: dir });
    const counts = run(["rev-list", "--left-right", "--count", "HEAD..." + upstream], { cwd: dir });
    const [behind, ahead] = counts.split("\t").map((n) => parseInt(n, 10));
    const dirtyOutput = run(["status", "--porcelain"], { cwd: dir });
    return {
      aheadOf: ahead && ahead > 0 ? `origin/${upstream.split("/").pop()} by ${ahead}` : null,
      behindOf: behind && behind > 0 ? `origin/${upstream.split("/").pop()} by ${behind}` : null,
      dirty: dirtyOutput.length > 0,
    };
  } catch {
    return { aheadOf: null, behindOf: null, dirty: false };
  }
}
