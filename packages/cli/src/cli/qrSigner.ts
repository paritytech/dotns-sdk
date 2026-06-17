import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import {
  createTerminalAdapter,
  renderQrCode,
  waitForSessions,
  createSessionSigner,
} from "@parity/product-sdk-terminal";
import {
  requestResourceAllocation,
  getCachedAllocation,
  type AllocatableResource,
} from "@parity/product-sdk-terminal/host";
import chalk from "chalk";
import type { Dirent } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_QR_APP_ID, ENV } from "./env";
import type { SignerHandle } from "../core/keyring";

type TerminalAdapter = ReturnType<typeof createTerminalAdapter>;
type AdapterOptions = Parameters<typeof createTerminalAdapter>[0];
type WalletSession = Awaited<ReturnType<typeof waitForSessions>>[number];

const SUBSTRATE_SS58_PREFIX = 42;
const DEFAULT_PAIR_TIMEOUT_MS = 120_000;
const EXISTING_SESSION_TIMEOUT_MS = 3_000;
// Session files whose topic binding must rotate for a fresh pairing.
const ROTATE_KEYS = ["DeviceIdentity", "SsoSessionsV3"];
// --fresh additionally drops the cached allowance so the wallet re-approves signing.
const FRESH_KEYS = [...ROTATE_KEYS, "AllowanceKeys"];

const traceQr: (message: string) => void = process.env[ENV.QR_DEBUG]
  ? (message) => console.error(`[qr] ${message}`)
  : () => {};

function assertWebSocketSupport(): void {
  if (typeof WebSocket === "undefined") {
    throw new Error(
      "QR signing needs a global WebSocket (Node >= 21 or Bun). " +
        "Run the CLI under bun, or upgrade Node.",
    );
  }
}

// The pairing topic derives from the host device identity, which is otherwise reused
// forever; a prior session's disconnect statement (7-day TTL) then replays onto the reused
// topic and evicts the new session. Deleting the identity moves pairing onto a clean topic.
async function rotateDeviceIdentity(appId: string, keys: readonly string[]): Promise<void> {
  const dir = join(homedir(), ".polkadot-apps");
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `${appId}_`;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .filter((entry) => keys.includes(entry.name.slice(prefix.length).replace(/\.json$/, "")))
      .map((entry) => unlink(join(dir, entry.name)).catch(() => {})),
  );
}

// Sessions are appended, so the freshest pairing is last.
async function getLatestWalletSession(
  adapter: TerminalAdapter,
  timeoutMs: number,
): Promise<WalletSession | undefined> {
  return (await waitForSessions(adapter, timeoutMs)).at(-1);
}

function reportPairingProgress(adapter: TerminalAdapter): void {
  adapter.sso.pairingStatus.subscribe((status) => {
    traceQr(`pairing status: ${status.step}`);
    switch (status.step) {
      case "pairing":
        traceQr(`payload: ${status.payload}`);
        void renderQrCode(status.payload)
          .then((qr) => {
            console.error(qr);
            console.error("Scan with the Polkadot mobile app to pair.");
          })
          .catch((error) => console.error(`Could not render the pairing QR: ${String(error)}`));
        return;
      case "pending":
        console.error(`Pairing: ${status.stage}`);
        return;
      case "pairingError":
        console.error(`Pairing error: ${status.message}`);
        return;
    }
  });
}

// authenticate() never settles if the wallet stalls, so bound it with a timeout that aborts
// and reports the relay the wallet had to match.
async function authenticatePairing(
  adapter: TerminalAdapter,
  pairTimeoutMs: number,
  relay: string,
): Promise<Awaited<ReturnType<typeof adapter.sso.authenticate>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      adapter.sso.abortAuthentication();
      reject(
        new Error(
          `QR pairing timed out after ${Math.round(pairTimeoutMs / 1000)}s with no wallet ` +
            `response on ${relay}. The wallet must be on this same People chain; select a ` +
            `matching relay with --qr-people-rpc (paseo|preview|stable or wss URLs).`,
        ),
      );
    }, pairTimeoutMs);
  });
  try {
    return await Promise.race([adapter.sso.authenticate(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pairNewSession(
  adapter: TerminalAdapter,
  pairTimeoutMs: number,
  relay: string,
): Promise<WalletSession> {
  reportPairingProgress(adapter);
  const result = await authenticatePairing(adapter, pairTimeoutMs, relay);
  if (result.isErr()) {
    throw new Error(`QR pairing failed: ${result.error.message}`);
  }
  traceQr(`authenticated (${result.value ? "session" : "null"})`);

  const session = await getLatestWalletSession(adapter, pairTimeoutMs);
  if (!session) {
    throw new Error("QR pairing produced no wallet session (timed out or aborted).");
  }
  return session;
}

// Reuse an existing session unless `fresh`; otherwise rotate onto a clean topic and pair
// afresh, which means replacing the probe adapter. Owns the returned adapter to return.
async function acquireWalletSession(
  adapterOptions: AdapterOptions,
  pairTimeoutMs: number,
  relay: string,
  fresh: boolean,
): Promise<{ adapter: TerminalAdapter; session: WalletSession }> {
  let adapter = createTerminalAdapter(adapterOptions);
  try {
    if (!fresh) {
      const existing = await getLatestWalletSession(adapter, EXISTING_SESSION_TIMEOUT_MS);
      if (existing) {
        traceQr("reusing existing paired session");
        return { adapter, session: existing };
      }
    }

    await adapter.destroy();
    await rotateDeviceIdentity(adapterOptions.appId, fresh ? FRESH_KEYS : ROTATE_KEYS);
    adapter = createTerminalAdapter(adapterOptions);

    const session = await pairNewSession(adapter, pairTimeoutMs, relay);
    return { adapter, session };
  } catch (error) {
    await adapter.destroy();
    throw error;
  }
}

// The wallet drops signing requests until an allowance is granted, so claim it up front
// rather than letting the first transaction hang. Re-requesting a cached allowance
// round-trips to a wallet with nothing to prompt and times out, so skip when already held.
async function grantSigningAllowance(
  session: WalletSession,
  adapter: TerminalAdapter,
): Promise<void> {
  const smartContract: AllocatableResource = { tag: "SmartContractAllowance", value: 0 };
  if (await getCachedAllocation(adapter, smartContract)) {
    return;
  }
  console.error("Approve the signing allowance on your phone to continue.");
  const [outcome] = await requestResourceAllocation(session, adapter, [
    smartContract,
    { tag: "AutoSigning", value: undefined },
  ]);
  if (outcome?.tag !== "Allocated") {
    throw new Error(
      "Wallet declined the smart-contract signing allowance; cannot sign transactions.",
    );
  }
}

export async function createQrSigner(options?: {
  appId?: string;
  hostName?: string;
  endpoints?: string[];
  pairTimeoutMs?: number;
  fresh?: boolean;
}): Promise<SignerHandle> {
  console.error(
    chalk.yellow(
      "⚠ The QR mobile-wallet signer is experimental and still in development; expect rough edges.",
    ),
  );
  assertWebSocketSupport();
  // encodeAddress needs wasm crypto initialised; the keystore path gets this via createAccountFromSource.
  await cryptoWaitReady();

  // hostName must be present in the proposal or the wallet rejects pairing; default it to
  // the appId so the wallet shows the identity it derives from.
  const appId = options?.appId ?? DEFAULT_QR_APP_ID;
  const adapterOptions: AdapterOptions = {
    appId,
    ...(options?.endpoints ? { endpoints: options.endpoints } : {}),
    hostMetadata: { hostName: options?.hostName ?? appId, platformType: "cli" },
  };
  const relay = options?.endpoints?.length ? options.endpoints.join(", ") : "the default relay";

  const { adapter, session } = await acquireWalletSession(
    adapterOptions,
    options?.pairTimeoutMs ?? DEFAULT_PAIR_TIMEOUT_MS,
    relay,
    options?.fresh ?? false,
  );
  try {
    await grantSigningAllowance(session, adapter);

    const signer = createSessionSigner(session, adapter);
    const origin = encodeAddress(signer.publicKey, SUBSTRATE_SS58_PREFIX);
    process.once("exit", () => {
      void adapter.destroy();
    });
    return { origin, signer };
  } catch (error) {
    await adapter.destroy();
    throw error;
  }
}
