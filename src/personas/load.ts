import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PersonaManifest } from "./types.js";

// Resolve personas/ — looks for a sibling directory containing *.json files.
// In dev (tsx): this file is at src/personas/load.ts → ../../personas at project root.
// In prod (compiled): this file is at dist/personas/load.js → ../personas next to dist.
// The first candidate (HERE/../personas) happens to be src/personas itself in dev,
// which has no json files; we therefore skip dirs that contain no manifest.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DIRS = [
  // dist case: dist/personas → ../personas → next to dist/
  path.resolve(HERE, "..", "personas"),
  // dev case: src/personas/load.ts → ../../personas at project root
  path.resolve(HERE, "..", "..", "personas"),
];

function hasManifests(dir: string): boolean {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return fs.readdirSync(dir).some((f) => f.endsWith(".json"));
}

function personasDir(): string {
  for (const dir of CANDIDATE_DIRS) {
    if (hasManifests(dir)) return dir;
  }
  return CANDIDATE_DIRS[CANDIDATE_DIRS.length - 1]!;
}

export function loadPersonas(): PersonaManifest[] {
  const dir = personasDir();
  if (!fs.existsSync(dir)) return [];
  const out: PersonaManifest[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    const file = path.join(dir, entry);
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as PersonaManifest;
      if (validate(raw)) out.push(raw);
    } catch {
      // ignore malformed manifests rather than crash the whole list
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadPersona(id: string): PersonaManifest | null {
  return loadPersonas().find((p) => p.id === id) ?? null;
}

function validate(m: PersonaManifest): boolean {
  return Boolean(
    m && typeof m.id === "string" && typeof m.name === "string" && m.recommendations
  );
}
