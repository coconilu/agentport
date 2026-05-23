import type { EnvValue } from "./types.js";

export function literal(value: string): EnvValue {
  return { kind: "literal", value };
}

export function envRef(name: string): EnvValue {
  return { kind: "env_ref", name };
}

export function template(parts: EnvValue[]): EnvValue {
  if (parts.length === 1) return parts[0]!;
  return { kind: "template", parts };
}

// Parse a Claude-style string: "${VAR}" or "${env:VAR}", possibly mixed with literals.
export function parseClaudeEnv(input: string): EnvValue {
  const re = /\$\{(?:env:)?([A-Z_][A-Z0-9_]*)\}/gi;
  return parseWithRegex(input, re);
}

// Parse an OpenCode-style string: "{env:VAR}" (no $ prefix).
export function parseOpenCodeEnv(input: string): EnvValue {
  const re = /\{env:([A-Z_][A-Z0-9_]*)\}/gi;
  return parseWithRegex(input, re);
}

function parseWithRegex(input: string, re: RegExp): EnvValue {
  const parts: EnvValue[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) parts.push(literal(input.slice(last, m.index)));
    parts.push(envRef(m[1]!));
    last = m.index + m[0].length;
  }
  if (last < input.length) parts.push(literal(input.slice(last)));
  if (parts.length === 0) return literal("");
  return template(parts);
}

// Render an EnvValue in each tool's native syntax.
export function renderClaude(v: EnvValue): string {
  switch (v.kind) {
    case "literal":
      return v.value;
    case "env_ref":
      return `\${${v.name}}`;
    case "template":
      return v.parts.map(renderClaude).join("");
  }
}

export function renderOpenCode(v: EnvValue): string {
  switch (v.kind) {
    case "literal":
      return v.value;
    case "env_ref":
      return `{env:${v.name}}`;
    case "template":
      return v.parts.map(renderOpenCode).join("");
  }
}

// Collect all env_ref names from an EnvValue tree (for Codex's env_vars array).
export function collectEnvRefs(v: EnvValue): string[] {
  switch (v.kind) {
    case "literal":
      return [];
    case "env_ref":
      return [v.name];
    case "template":
      return v.parts.flatMap(collectEnvRefs);
  }
}

// Return true if the entire EnvValue is just literals (no env_refs).
export function isPureLiteral(v: EnvValue): boolean {
  return collectEnvRefs(v).length === 0;
}

// Flatten a pure-literal EnvValue down to a plain string.
export function asLiteralString(v: EnvValue): string {
  switch (v.kind) {
    case "literal":
      return v.value;
    case "env_ref":
      throw new Error(`Cannot flatten env_ref ${v.name} to literal`);
    case "template":
      return v.parts.map(asLiteralString).join("");
  }
}
