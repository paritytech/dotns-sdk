import os from "node:os";
import path from "node:path";

import { setActiveDotnsEnvironment, type DotnsEnvironmentConfig } from "../utils/constants";

export const ENV = {
  DOTNS_ENV: "DOTNS_ENV",
  RPC: "DOTNS_RPC",
  BULLETIN_RPC: "DOTNS_BULLETIN_RPC",
  MNEMONIC: "DOTNS_MNEMONIC",
  KEY_URI: "DOTNS_KEY_URI",
  // Keystore directory (per-account files live here)
  // Example: ~/.dotns/keystore/
  KEYSTORE_PATH: "DOTNS_KEYSTORE_PATH",
  KEYSTORE_PASSWORD: "DOTNS_KEYSTORE_PASSWORD",
  COMMITMENT_BUFFER: "DOTNS_COMMITMENT_BUFFER",
  SIGNER: "DOTNS_SIGNER",
  QR_APP_ID: "DOTNS_QR_APP_ID",
  QR_PEOPLE_RPC: "DOTNS_QR_PEOPLE_RPC",
  QR_DEBUG: "DOTNS_QR_DEBUG",
} as const;

export type SignerKind = "keystore" | "qr";

// Unified wallet-pairing identity. The same id namespaces the on-disk session store,
// seeds the product-account derivation (product/{id}/{index}) that signs and owns the
// name and receives PGAS funding, and is the name the wallet shows on its approval
// screen.
export const DEFAULT_QR_APP_ID = "dotns";

// People-chain statement-store relays the pairing handshake rendezvous on. The CLI and
// the wallet must share one, or the wallet's response never reaches the CLI and pairing
// hangs. A raw comma-separated wss list overrides the named stages.
const QR_PEOPLE_STAGES = {
  paseo: ["wss://paseo-people-next-system-rpc.polkadot.io"],
  preview: ["wss://previewnet.substrate.dev/people"],
  stable: ["wss://pop3-testnet.parity-lab.parity.io/people"],
} as const;

export type QrPeopleStage = keyof typeof QR_PEOPLE_STAGES;
export const DEFAULT_QR_PEOPLE_STAGE: QrPeopleStage = "paseo";

export function resolveSignerKind(maybeKind?: string): SignerKind {
  const value = (maybeKind || process.env[ENV.SIGNER] || "keystore").toLowerCase();
  return value === "qr" ? "qr" : "keystore";
}

export function resolveQrAppId(maybeAppId?: string): string {
  return maybeAppId || process.env[ENV.QR_APP_ID] || DEFAULT_QR_APP_ID;
}

export function resolveQrPeopleEndpoints(maybeStageOrUrls?: string): string[] {
  const value = (
    maybeStageOrUrls ||
    process.env[ENV.QR_PEOPLE_RPC] ||
    DEFAULT_QR_PEOPLE_STAGE
  ).trim();
  if (value in QR_PEOPLE_STAGES) {
    return [...QR_PEOPLE_STAGES[value as QrPeopleStage]];
  }
  const urls = value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error(
      `No QR pairing relay resolved from "${value}". Use a stage (paseo|preview|stable) or wss URLs.`,
    );
  }
  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid QR pairing relay URL "${url}". Use a stage name or wss:// URLs.`);
    }
    if (parsed.protocol !== "wss:") {
      throw new Error(`QR pairing relay must be a wss:// URL or a stage name, got "${url}".`);
    }
    if (parsed.username || parsed.password) {
      throw new Error(`QR pairing relay must not embed credentials, got "${url}".`);
    }
  }
  return urls;
}

// Local-keystore auth options keyed by the flag a user would type.
const KEYSTORE_AUTH_FLAGS = {
  account: "--account",
  password: "--password",
  keystorePath: "--keystore-path",
  mnemonic: "--mnemonic",
  keyUri: "--key-uri",
} as const;

export type KeystoreAuthOption = keyof typeof KEYSTORE_AUTH_FLAGS;

// Keystore secrets supplied via the environment also conflict with the QR signer.
const KEYSTORE_AUTH_ENV = [ENV.MNEMONIC, ENV.KEY_URI, ENV.KEYSTORE_PASSWORD] as const;

// The QR signer derives the account from the paired wallet, so any local-keystore input
// (flag or env var) is contradictory; reject it rather than silently ignoring it.
export function assertSignerOptions(
  options: { signer?: string } & Partial<Record<KeystoreAuthOption, unknown>>,
): void {
  if (resolveSignerKind(options.signer) !== "qr") {
    return;
  }
  const conflicting = [
    ...(Object.keys(KEYSTORE_AUTH_FLAGS) as KeystoreAuthOption[])
      .filter((key) => options[key] !== undefined)
      .map((key) => KEYSTORE_AUTH_FLAGS[key]),
    ...KEYSTORE_AUTH_ENV.filter((name) => process.env[name]),
  ];
  if (conflicting.length > 0) {
    throw new Error(
      `--signer qr signs with the paired mobile wallet, so it cannot be combined with ` +
        `local-keystore inputs: ${conflicting.join(", ")}.`,
    );
  }
}

function getDefaultKeystoreDir(): string {
  return path.join(os.homedir(), ".dotns", "keystore");
}

export function resolveDotnsEnvironment(maybeEnvironment?: string): DotnsEnvironmentConfig {
  return setActiveDotnsEnvironment(maybeEnvironment || process.env[ENV.DOTNS_ENV]);
}

export function resolveRpc(maybeRpc?: string, maybeEnvironment?: string): string {
  const environment = resolveDotnsEnvironment(maybeEnvironment);
  const resolved = maybeRpc || process.env[ENV.RPC] || environment.rpc;
  if (!resolved) {
    throw new Error(
      `Environment '${environment.id}' has no Asset Hub RPC configured. Set --rpc, ${ENV.RPC}, or use --env paseo-v2.`,
    );
  }
  return resolved;
}

/**
 * Resolve the bulletin WebSocket RPC endpoint.
 *
 * Precedence: explicit argument => `DOTNS_BULLETIN_RPC` env var => active
 * environment's `bulletinRpc`.
 */
export function resolveBulletinRpc(maybeRpc?: string, maybeEnvironment?: string): string {
  const environment = resolveDotnsEnvironment(maybeEnvironment);
  const resolved = maybeRpc || process.env[ENV.BULLETIN_RPC] || environment.bulletinRpc;
  if (!resolved) {
    throw new Error(
      `Environment '${environment.id}' has no bulletin RPC configured. Set --bulletin-rpc, ${ENV.BULLETIN_RPC}, or use --env paseo-v2.`,
    );
  }
  return resolved;
}

/**
 * Resolve keystore directory path.
 * This is always a directory (not a file).
 */
function resolveKeystoreDir(maybeDir?: string): string {
  return maybeDir || process.env[ENV.KEYSTORE_PATH] || getDefaultKeystoreDir();
}

export function resolveKeystorePath(maybeDir?: string): string {
  return resolveKeystoreDir(maybeDir);
}
