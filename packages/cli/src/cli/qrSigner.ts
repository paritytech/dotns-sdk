import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import {
  createTerminalAdapter,
  renderQrCode,
  waitForSessions,
  createSessionSigner,
} from "@parity/product-sdk-terminal";
import { requestResourceAllocation } from "@parity/product-sdk-terminal/host";
import chalk from "chalk";
import { DEFAULT_QR_APP_ID, ENV } from "./env";
import type { SignerHandle } from "../core/keyring";

type TerminalAdapter = ReturnType<typeof createTerminalAdapter>;
type WalletSession = Awaited<ReturnType<typeof waitForSessions>>[number];

const SUBSTRATE_SS58_PREFIX = 42;
// Bounds the whole pairing handshake, which has no internal timeout and otherwise hangs
// forever if the wallet never responds. Long enough to scan, approve, and let the wallet
// allocate its allowance.
const DEFAULT_PAIR_TIMEOUT_MS = 120_000;
// Sessions persist to disk and load asynchronously, so give the read a moment before
// deciding a fresh pairing is needed.
const EXISTING_SESSION_TIMEOUT_MS = 3_000;

// Verbose handshake trace, silent unless DOTNS_QR_DEBUG is set, so normal runs only
// emit the user-facing prompts below.
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

// authenticate() never settles on its own if the wallet stalls mid-handshake, so race it
// against a timeout that aborts the attempt and surfaces a clear error.
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

// Reuse an already-paired session when one exists; calling authenticate() again over a
// live session can hang. Only pair afresh (rendering the QR) when none is found.
async function acquireWalletSession(
  adapter: TerminalAdapter,
  pairTimeoutMs: number,
  relay: string,
): Promise<WalletSession> {
  const [existing] = await waitForSessions(adapter, EXISTING_SESSION_TIMEOUT_MS);
  if (existing) {
    traceQr("reusing existing paired session");
    return existing;
  }

  reportPairingProgress(adapter);
  const result = await authenticatePairing(adapter, pairTimeoutMs, relay);
  if (result.isErr()) {
    throw new Error(`QR pairing failed: ${result.error.message}`);
  }
  traceQr(`authenticated (${result.value ? "session" : "null"})`);

  const [session] = await waitForSessions(adapter, pairTimeoutMs);
  if (!session) {
    throw new Error("QR pairing produced no wallet session (timed out or aborted).");
  }
  return session;
}

// The wallet silently drops signing requests until a signing allowance is granted, so
// claim it up front (this prompts the phone) rather than letting the first transaction
// hang.
async function grantSigningAllowance(
  session: WalletSession,
  adapter: TerminalAdapter,
): Promise<void> {
  console.error("Approve the signing allowance on your phone to continue.");
  const [smartContract] = await requestResourceAllocation(session, adapter, [
    { tag: "SmartContractAllowance", value: 0 },
    { tag: "AutoSigning", value: undefined },
  ]);
  if (smartContract?.tag !== "Allocated") {
    throw new Error(
      "Wallet declined the smart-contract signing allowance; cannot sign transactions.",
    );
  }
}

export async function createQrSigner(opts?: {
  appId?: string;
  hostName?: string;
  endpoints?: string[];
  pairTimeoutMs?: number;
}): Promise<SignerHandle> {
  console.error(
    chalk.yellow(
      "⚠ The QR mobile-wallet signer is experimental and still in development; expect rough edges.",
    ),
  );
  assertWebSocketSupport();
  // encodeAddress needs wasm crypto initialised; the keystore path gets this via createAccountFromSource.
  await cryptoWaitReady();

  // hostName must be present in the proposal or the wallet rejects pairing, and it
  // defaults to the appId so the wallet shows the same identity it derives from.
  // endpoints must match the wallet's People chain or the handshake never lands.
  const appId = opts?.appId ?? DEFAULT_QR_APP_ID;
  const adapter = createTerminalAdapter({
    appId,
    ...(opts?.endpoints ? { endpoints: opts.endpoints } : {}),
    hostMetadata: { hostName: opts?.hostName ?? appId, platformType: "cli" },
  });
  const relay = opts?.endpoints?.join(", ") ?? "the default relay";

  try {
    const session = await acquireWalletSession(
      adapter,
      opts?.pairTimeoutMs ?? DEFAULT_PAIR_TIMEOUT_MS,
      relay,
    );
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
