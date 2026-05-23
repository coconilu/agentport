import fs from "node:fs";
import path from "node:path";

export function readJsonSafe<T = unknown>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON at ${file}: ${msg}`);
  }
}

export function writeFileWithBackup(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(file, `${file}.bak.${ts}`);
  }
  fs.writeFileSync(file, content);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(file: string): boolean {
  return fs.existsSync(file);
}
