import crypto from "node:crypto";
import type { EncryptedBundle } from "./types.js";

const ITERATIONS = 210_000;  // OWASP 2023 recommendation for PBKDF2-SHA256
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;

function deriveKey(passphrase: string, salt: Buffer, iterations = ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, iterations, KEY_LEN, "sha256");
}

export function encryptBundle(plaintext: string, passphrase: string): EncryptedBundle {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2",
    iter: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

export function decryptBundle(enc: EncryptedBundle, passphrase: string): string {
  if (enc.v !== 1 || enc.alg !== "AES-256-GCM") {
    throw new Error(`unsupported encryption: v=${enc.v} alg=${enc.alg}`);
  }
  const salt = Buffer.from(enc.salt, "base64");
  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const ct = Buffer.from(enc.ct, "base64");
  const key = deriveKey(passphrase, salt, enc.iter);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    throw new Error("decryption failed — wrong passphrase or corrupted bundle");
  }
}

// Heuristic: does this string look like a literal secret (token)?
// Caller can warn users before pushing such values to a remote.
const SECRET_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{20,}$/,           // OpenAI-style
  /^ghp_[A-Za-z0-9]{30,}$/,            // GitHub PAT
  /^github_pat_[A-Za-z0-9_]{50,}$/,    // GitHub fine-grained PAT
  /^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+$/, // Slack bot token
  /^AIza[0-9A-Za-z-_]{35}$/,           // Google API key
  /^[A-Za-z0-9_-]{40,}={0,2}$/,        // generic long base64-ish blob
];

export function looksLikeSecret(value: string): boolean {
  if (value.length < 20) return false;
  return SECRET_PATTERNS.some((re) => re.test(value));
}
