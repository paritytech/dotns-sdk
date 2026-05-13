import os from "node:os";
import path from "node:path";

import { setActiveDotnsEnvironment, type DotnsEnvironmentConfig } from "../utils/constants";
import { normalizeAccountName } from "./keystore/payload";

export const ENV = {
  DOTNS_ENV: "DOTNS_ENV",
  RPC: "DOTNS_RPC",
  MNEMONIC: "DOTNS_MNEMONIC",
  KEY_URI: "DOTNS_KEY_URI",
  // Keystore directory (per-account files live here)
  // Example: ~/.dotns/keystore/
  KEYSTORE_PATH: "DOTNS_KEYSTORE_PATH",
  KEYSTORE_PASSWORD: "DOTNS_KEYSTORE_PASSWORD",
  MIN_BALANCE_PAS: "DOTNS_MIN_BALANCE_PAS",
  COMMITMENT_BUFFER: "DOTNS_COMMITMENT_BUFFER",
} as const;

export function getDefaultKeystoreDir(): string {
  return path.join(os.homedir(), ".dotns", "keystore");
}

export function resolveDotnsEnvironment(maybeEnvironment?: string): DotnsEnvironmentConfig {
  return setActiveDotnsEnvironment(maybeEnvironment || process.env[ENV.DOTNS_ENV]);
}

export function resolveRpc(maybeRpc?: string, maybeEnvironment?: string): string {
  const environment = resolveDotnsEnvironment(maybeEnvironment);
  return maybeRpc || process.env[ENV.RPC] || environment.rpc;
}

export function resolveMinBalancePas(maybeMin?: string): string {
  return maybeMin || process.env[ENV.MIN_BALANCE_PAS] || "0.1";
}

/**
 * Resolve keystore directory path.
 * This is always a directory (not a file).
 */
export function resolveKeystoreDir(maybeDir?: string): string {
  return maybeDir || process.env[ENV.KEYSTORE_PATH] || getDefaultKeystoreDir();
}

// Keep the old name if other modules already import it.
export function resolveKeystorePath(maybeDir?: string): string {
  return resolveKeystoreDir(maybeDir);
}

/**
 * Path to the plaintext default-account pointer file.
 * Contains only the account name string.
 */
export function getDefaultAccountPointerPath(keystoreDir: string): string {
  return path.join(keystoreDir, ".default");
}

/**
 * Per-account keystore file path.
 * Each account is stored as its own encrypted JSON file.
 */
export function getAccountKeystoreFilePath(keystoreDir: string, accountName: string): string {
  const normalized = normalizeAccountName(accountName);
  return path.join(keystoreDir, `${normalized}.json`);
}
