import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Fixture {
  root: string;
  home: string;
  project: string;
  cleanup: () => void;
}

export function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-agent-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(home, ".agents", "skills"), { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return {
    root,
    home,
    project,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function emptyFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-agent-empty-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return {
    root,
    home,
    project,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function readFile(file: string): string {
  return fs.readFileSync(file, "utf8");
}

export function exists(file: string): boolean {
  return fs.existsSync(file);
}
