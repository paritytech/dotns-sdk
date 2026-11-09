import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as realHeliaClient from "../../../src/bulletin/heliaClient";
import type { HeliaFetchResult } from "../../../src/bulletin/heliaClient";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GATEWAY = "https://gateway.test";
const polkadot = DOTNS_ENVIRONMENTS.polkadot;

type GatewayFetch = (url: string, init: RequestInit) => Promise<Response>;

let fetchBlock: (cid: string, signal: AbortSignal) => Promise<HeliaFetchResult>;
let gatewayFetch: GatewayFetch;
let heliaStopCount: number;

mock.module("../../../src/bulletin/heliaClient", () => ({
  ...realHeliaClient,
  getSharedHeliaClient: () => ({
    fetchBlock: (cid: string, signal: AbortSignal) => fetchBlock(cid, signal),
  }),
  destroySharedHeliaClient: async () => {
    heliaStopCount += 1;
  },
}));

const { verificationGateways, verifySingleFileCid } = await import("../../../src/bulletin/ipfs");

const block: HeliaFetchResult = { data: new Uint8Array([1]), size: 1 };

function waitForAbort(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  return promise;
}

// A macrotask starts only after every queued promise callback has run, so the
// other side's failure is fully recorded before this side resolves.
function waitForNextMacrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  return promise;
}

beforeEach(() => {
  heliaStopCount = 0;
  fetchBlock = async () => {
    throw new Error("unexpected P2P fetch");
  };
  gatewayFetch = async () => {
    throw new Error("unexpected gateway fetch");
  };
  spyOn(globalThis, "fetch").mockImplementation(((url: string, init: RequestInit) =>
    gatewayFetch(url, init)) as unknown as typeof fetch);
});

afterEach(() => {
  mock.restore();
  setActiveDotnsEnvironment("paseo-v2");
});

test("polkadot verifies over the Bulletin boot nodes", () => {
  expect(polkadot.ipfsGatewayUrl).toBeNull();
  expect(polkadot.bulletinP2pPeers.length).toBeGreaterThan(0);
  for (const peer of polkadot.bulletinP2pPeers) expect(peer).toMatch(/\/wss\/p2p\/12D3KooW/);
});

test("P2P resolving first wins, aborts the gateway check and stops Helia", async () => {
  let gatewaySignal: AbortSignal | undefined;
  fetchBlock = async () => block;
  gatewayFetch = (_url, init) => {
    gatewaySignal = init.signal!;
    return waitForAbort(gatewaySignal);
  };

  const result = await verifySingleFileCid(CID, GATEWAY);

  expect(result).toEqual({ cid: CID, resolvable: true, gateway: "p2p/bitswap" });
  expect(gatewaySignal?.aborted).toBe(true);
  expect(heliaStopCount).toBe(1);
});

test("the gateway resolving first wins and aborts the P2P fetch", async () => {
  let p2pSignal: AbortSignal | undefined;
  fetchBlock = (_cid, signal) => {
    p2pSignal = signal;
    return waitForAbort(signal);
  };
  gatewayFetch = async () => new Response(null, { status: 200 });

  const result = await verifySingleFileCid(CID, GATEWAY);

  expect(result).toEqual({ cid: CID, resolvable: true, gateway: GATEWAY, statusCode: 200 });
  expect(p2pSignal?.aborted).toBe(true);
  expect(heliaStopCount).toBe(1);
});

test("fails only when both fail, reporting both errors", async () => {
  fetchBlock = async () => {
    throw new Error("no Bulletin peer has the block");
  };
  gatewayFetch = async () => new Response(null, { status: 404 });

  const result = await verifySingleFileCid(CID, GATEWAY);

  expect(result).toEqual({
    cid: CID,
    resolvable: false,
    gateway: `p2p/bitswap, ${GATEWAY}`,
    errorMessage: `p2p/bitswap: no Bulletin peer has the block; ${GATEWAY}: HTTP 404`,
  });
});

test("a fast P2P failure leaves the gateway to resolve later", async () => {
  const p2pFailure = Promise.withResolvers<void>();
  fetchBlock = async () => {
    p2pFailure.resolve();
    throw new Error("dial failed");
  };
  gatewayFetch = async () => {
    await p2pFailure.promise;
    await waitForNextMacrotask();
    return new Response(null, { status: 200 });
  };

  const result = await verifySingleFileCid(CID, GATEWAY);

  expect(result.resolvable).toBe(true);
  expect(result.gateway).toBe(GATEWAY);
});

test("a fast gateway failure leaves P2P to resolve later", async () => {
  const gatewayFailure = Promise.withResolvers<void>();
  fetchBlock = async () => {
    await gatewayFailure.promise;
    await waitForNextMacrotask();
    return block;
  };
  gatewayFetch = async () => {
    gatewayFailure.resolve();
    throw new TypeError("fetch failed");
  };

  const result = await verifySingleFileCid(CID, GATEWAY);

  expect(result.resolvable).toBe(true);
  expect(result.gateway).toBe("p2p/bitswap");
});

// Without a gateway, an unresolved P2P check is the result: verification never
// throws into the upload's retry loop, and no public gateway stands in.
test("an environment without a gateway reports the P2P failure alone", async () => {
  setActiveDotnsEnvironment("polkadot");
  fetchBlock = async () => {
    throw new Error("dial failed");
  };

  const result = await verifySingleFileCid(CID);

  expect(result).toEqual({
    cid: CID,
    resolvable: false,
    gateway: "p2p/bitswap",
    errorMessage: "p2p/bitswap: dial failed",
  });
  expect(verificationGateways()).toEqual([]);
});
