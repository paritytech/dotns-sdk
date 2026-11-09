import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GATEWAY = "https://gateway-one.test";
const SECOND_GATEWAY = "https://gateway-two.test";
const BLOCK = new Uint8Array([1]);

let fetchBlock: (cid: string, signal: AbortSignal) => Promise<Uint8Array>;
let destroyNode: () => Promise<void>;
let nodeStopCount: number;
let gatewayFetch: (url: string, init: RequestInit) => Promise<Response>;

mock.module("../../../src/bulletin/heliaClient", () => ({
  BulletinHeliaClient: class {
    fetchBlock(cid: string, signal: AbortSignal) {
      return fetchBlock(cid, signal);
    }
    destroy() {
      nodeStopCount += 1;
      return destroyNode();
    }
  },
}));

const { describeVerificationFailures, verificationGateways, verifyCid, verifySingleFileCid } =
  await import("../../../src/bulletin/ipfs");

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
  nodeStopCount = 0;
  destroyNode = async () => {};
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

test("P2P resolving first wins, aborts every gateway check and stops the node", async () => {
  const gatewaySignals: AbortSignal[] = [];
  fetchBlock = async () => BLOCK;
  gatewayFetch = (_url, init) => {
    gatewaySignals.push(init.signal!);
    return waitForAbort(init.signal!);
  };

  const verification = await verifyCid(CID, [GATEWAY, SECOND_GATEWAY]);

  expect(verification).toEqual({
    success: { cid: CID, resolvable: true, gateway: "p2p/bitswap" },
  });
  expect(gatewaySignals.map((signal) => signal.aborted)).toEqual([true, true]);
  await waitForNextMacrotask();
  expect(nodeStopCount).toBe(1);
});

test("a gateway resolving first wins and aborts the P2P fetch", async () => {
  let p2pSignal: AbortSignal | undefined;
  fetchBlock = (_cid, signal) => {
    p2pSignal = signal;
    return waitForAbort(signal);
  };
  gatewayFetch = async () => new Response(null, { status: 200 });

  const verification = await verifySingleFileCid(CID, GATEWAY);

  expect(verification).toEqual({
    success: { cid: CID, resolvable: true, gateway: GATEWAY, statusCode: 200 },
  });
  expect(p2pSignal?.aborted).toBe(true);
  await waitForNextMacrotask();
  expect(nodeStopCount).toBe(1);
});

test("fails only when every check fails, listing P2P first and gateways in order", async () => {
  fetchBlock = async () => {
    throw new Error("no Bulletin peer has the block");
  };
  gatewayFetch = async (url) =>
    url.startsWith(GATEWAY)
      ? new Response(null, { status: 404 })
      : Promise.reject(new TypeError("fetch failed"));

  const verification = await verifyCid(CID, [GATEWAY, SECOND_GATEWAY]);

  expect("failures" in verification && verification.failures).toEqual([
    {
      cid: CID,
      resolvable: false,
      gateway: "p2p/bitswap",
      errorMessage: "no Bulletin peer has the block",
    },
    { cid: CID, resolvable: false, gateway: GATEWAY, statusCode: 404 },
    { cid: CID, resolvable: false, gateway: SECOND_GATEWAY, errorMessage: "fetch failed" },
  ]);
  expect("failures" in verification && describeVerificationFailures(verification.failures)).toBe(
    `p2p/bitswap: no Bulletin peer has the block; ${GATEWAY}: HTTP 404; ${SECOND_GATEWAY}: fetch failed`,
  );
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

  const verification = await verifySingleFileCid(CID, GATEWAY);

  expect("success" in verification && verification.success.gateway).toBe(GATEWAY);
});

test("a fast gateway failure leaves P2P to resolve later", async () => {
  const gatewayFailure = Promise.withResolvers<void>();
  fetchBlock = async () => {
    await gatewayFailure.promise;
    await waitForNextMacrotask();
    return BLOCK;
  };
  gatewayFetch = async () => {
    gatewayFailure.resolve();
    throw new TypeError("fetch failed");
  };

  const verification = await verifySingleFileCid(CID, GATEWAY);

  expect("success" in verification && verification.success.gateway).toBe("p2p/bitswap");
});

// Verification runs after the content is stored, so a cleanup error must not
// replace its result or reach the upload's retry loop.
test("a failure to stop the node is reported and the result kept", async () => {
  const warned = Promise.withResolvers<unknown>();
  const warn = spyOn(console, "warn").mockImplementation((message) => warned.resolve(message));
  fetchBlock = async () => BLOCK;
  destroyNode = async () => {
    throw new Error("libp2p stop failed");
  };

  const verification = await verifyCid(CID, []);

  expect("success" in verification).toBe(true);
  expect(await warned.promise).toBe("Failed to stop the P2P verification node: libp2p stop failed");
  warn.mockRestore();
});

test("an environment without a gateway reports the P2P failure alone", async () => {
  setActiveDotnsEnvironment("polkadot");
  fetchBlock = async () => {
    throw new Error("dial failed");
  };

  const verification = await verifySingleFileCid(CID);

  expect(verification).toEqual({
    failures: [
      { cid: CID, resolvable: false, gateway: "p2p/bitswap", errorMessage: "dial failed" },
    ],
  });
});

// Public gateways only back up the environment's own gateway; without one, they
// are not probed.
test("verification gateways put the environment gateway before the public ones", () => {
  setActiveDotnsEnvironment("paseo-v2");
  expect(verificationGateways()).toEqual([
    DOTNS_ENVIRONMENTS["paseo-v2"].ipfsGatewayUrl!,
    "https://dweb.link",
    "https://cloudflare-ipfs.com",
    "https://w3s.link",
  ]);

  setActiveDotnsEnvironment("polkadot");
  expect(verificationGateways()).toEqual([]);
});
