import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";

const publicKey = new Uint8Array(32).fill(7);
const signer = {
  publicKey,
  signTx: async () => new Uint8Array(),
  signBytes: async () => new Uint8Array(),
};

// Registered at module scope so it lands before qrSigner.ts (imported lazily below) loads.
mock.module("@parity/product-sdk-terminal", () => ({
  createTerminalAdapter: () => ({
    appId: "dotns-cli",
    sso: {
      pairingStatus: { subscribe: () => () => {} },
      authenticate: async () => ({ isErr: () => false }),
    },
    destroy: async () => {},
  }),
  renderQrCode: async () => "<qr>",
  waitForSessions: async () => [{ remoteAccount: { accountId: publicKey } }],
  createSessionSigner: () => signer,
}));

mock.module("@parity/product-sdk-terminal/host", () => ({
  getCachedAllocation: async () => null,
  requestResourceAllocation: async () => [
    { tag: "Allocated", value: { tag: "SmartContractAllowance", dest: 0 } },
    { tag: "NotAvailable", value: undefined },
  ],
}));

let createQrSigner: typeof import("../../../src/cli/qrSigner").createQrSigner;

beforeAll(async () => {
  await cryptoWaitReady();
  ({ createQrSigner } = await import("../../../src/cli/qrSigner"));
});

describe("createQrSigner", () => {
  const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  afterEach(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
  });

  test("throws a clear error when no global WebSocket is available", async () => {
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    await expect(createQrSigner()).rejects.toThrow(/WebSocket/);
  });

  test("returns the SS58 origin derived from the paired signer's public key", async () => {
    const handle = await createQrSigner();
    expect(handle.origin).toBe(encodeAddress(publicKey, 42));
    expect(handle.signer).toBe(signer);
  });
});
