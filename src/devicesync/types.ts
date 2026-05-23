import type { CanonicalConfig, ToolId } from "../ir/types.js";

export interface DeviceSyncConfig {
  remote?: string;
  defaultBranch?: string;
  bundlePath?: string;
}

export interface Bundle {
  version: "1.0";
  generatedAt: string;
  hostname?: string;
  // IR per tool, keyed by tool id
  tools: Record<ToolId, CanonicalConfig>;
}

export interface EncryptedBundle {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2";
  iter: number;
  salt: string; // base64
  iv: string;   // base64
  tag: string;  // base64
  ct: string;   // base64 ciphertext
}
