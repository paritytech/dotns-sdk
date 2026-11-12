import os from "node:os";
import path from "node:path";

import { chain } from "@parity/trinity-stack/reader";
import {
  checkStackCurrent,
  DOTNS_ENVIRONMENTS,
  findDotnsEnvironmentId,
  getActiveDotnsEnvironment,
  loadDotnsStack,
  setActiveDotnsEnvironment,
  StackExpiredError,
  type DotnsEnvironmentConfig,
} from "../utils/environments";
import type { AuthOptionValues } from "../types/types";

export const ENV = {
  DOTNS_ENV: "DOTNS_ENV",
  STACK: "DOTNS_STACK",
  RPC: "DOTNS_RPC",
  BULLETIN_RPC: "DOTNS_BULLETIN_RPC",
  MNEMONIC: "DOTNS_MNEMONIC",
  SKIP_CHAIN_CHECK: "DOTNS_SKIP_CHAIN_CHECK",
  SKIP_VERSION_CHECK: "DOTNS_SKIP_VERSION_CHECK",
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
  ALLOW_DEV_ACCOUNT: "DOTNS_ALLOW_DEV_ACCOUNT",
} as const;

export type SignerKind = "keystore" | "qr";

// Unified wallet-pairing identity. The same id namespaces the on-disk session store,
// seeds the product-account derivation (product/{id}/{index}) that signs and owns the
// name and receives PGAS funding, and is the name the wallet shows on its approval
// screen.
export const DEFAULT_QR_APP_ID = "dotns";

// People-chain statement-store relays the pairing handshake rendezvous on. The CLI and
// the wallet must share one, or the wallet's response never reaches the CLI and pairing
// hangs. A stage is an `--env` value; a raw comma-separated wss list overrides.

export function resolveSignerKind(maybeKind?: string): SignerKind {
  const value = (maybeKind || process.env[ENV.SIGNER] || "keystore").toLowerCase();
  return value === "qr" ? "qr" : "keystore";
}

export function resolveQrAppId(maybeAppId?: string): string {
  return maybeAppId || process.env[ENV.QR_APP_ID] || DEFAULT_QR_APP_ID;
}

// Without a flag or env var, pairing uses the People chain of the network the command signs on.
export function resolveQrPeopleEndpoints(maybeStageOrUrls?: string): string[] {
  const stageOrUrls = maybeStageOrUrls || process.env[ENV.QR_PEOPLE_RPC];
  if (!stageOrUrls) {
    return [...chain(getActiveDotnsEnvironment().descriptor, "People").rpc];
  }
  const value = stageOrUrls.trim();
  const stage = findDotnsEnvironmentId(value);
  if (stage) return [...chain(DOTNS_ENVIRONMENTS[stage].descriptor, "People").rpc];
  const urls = value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error(
      `No QR pairing relay resolved from "${value}". Use an --env value or wss URLs.`,
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
// (flag or env var) is contradictory, so reject it explicitly.
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

export type NetworkSelection = Pick<AuthOptionValues, "stack" | "env" | "network">;

export type NetworkChoice = { environment: DotnsEnvironmentConfig; warning?: string };

/** Where to run instead of a bundled copy that is outdated: its published link, for `--stack`. */
export function formatPublishedStackHint(publishedLink: string): string {
  return `Run with the published one: --stack '${publishedLink}'`;
}

function formatStackProblem(message: string, publishedLink: string | null): string {
  return publishedLink ? `${message} ${formatPublishedStackHint(publishedLink)}` : message;
}

/**
 * Selects and activates the network a command runs on: a flag (`--stack` or `--env`/`--network`),
 * else `DOTNS_STACK` or `DOTNS_ENV`, else polkadot. Returns the environment and, when its stack is
 * past `validUntil`, the warning to show. Fails when `--stack` is combined with `--env`/`--network`,
 * when both `DOTNS_STACK` and `DOTNS_ENV` are set, when the stack cannot be loaded, or when it is
 * past `expiresAt`; the active network then stays as it was.
 */
export async function selectDotnsEnvironment(options: NetworkSelection): Promise<NetworkChoice> {
  const environmentFlag = options.env ?? options.network;
  if (options.stack && environmentFlag) {
    throw new Error("--stack replaces the whole network, so it cannot be combined with --env.");
  }
  const fromFlags = Boolean(options.stack || environmentFlag);
  if (!fromFlags && process.env[ENV.STACK] && process.env[ENV.DOTNS_ENV]) {
    throw new Error(`Set either ${ENV.STACK} or ${ENV.DOTNS_ENV}, not both.`);
  }
  const stack = fromFlags ? options.stack : process.env[ENV.STACK];
  const environmentId = fromFlags ? environmentFlag : process.env[ENV.DOTNS_ENV];
  let environment: DotnsEnvironmentConfig;
  try {
    environment = setActiveDotnsEnvironment(stack ? await loadDotnsStack(stack) : environmentId);
  } catch (error) {
    if (error instanceof StackExpiredError) {
      throw new Error(formatStackProblem(error.message, error.publishedLink));
    }
    throw error;
  }
  const currency = checkStackCurrent(environment);
  const warning =
    currency.status === "stale"
      ? formatStackProblem(currency.message, currency.publishedLink)
      : undefined;
  return { environment, warning };
}

export function resolveRpc(maybeRpc?: string): string {
  return maybeRpc || process.env[ENV.RPC] || getActiveDotnsEnvironment().rpc;
}

/**
 * Resolve the bulletin WebSocket RPC endpoint.
 *
 * Precedence: explicit argument => `DOTNS_BULLETIN_RPC` env var => the active stack's Bulletin
 * chain. Fails when none is set and the stack has no Bulletin chain.
 */
export function resolveBulletinRpc(maybeRpc?: string): string {
  return (
    maybeRpc ||
    process.env[ENV.BULLETIN_RPC] ||
    chain(getActiveDotnsEnvironment().descriptor, "Bulletin").rpc[0]!
  );
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
