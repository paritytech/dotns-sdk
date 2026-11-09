import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
  mockHeliaClient,
  waitForAbort,
  type MockHeliaClientBehaviour,
} from "../../_helpers/heliaClientMock";
import type { BulletinProgressEvent } from "../../../src/types/types";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const GATEWAY = "https://gateway-one.test";
const SECOND_GATEWAY = "https://gateway-two.test";
const BLOCK = new Uint8Array([1]);

const helia: MockHeliaClientBehaviour = {
  fetchBlock: async () => BLOCK,
  destroy: async () => {},
};
let nodeStopCount: number;
let gatewayFetch: (url: string, init: RequestInit) => Promise<Response>;

mockHeliaClient(helia);

const { describeVerificationFailures, verificationGateways, verifyCid } =
  await import("../../../src/bulletin/ipfs");
const { verifyUploadedCid } = await import("../../../src/commands/bulletin");

// A macrotask starts only after every queued promise callback has run, so the
// other side's failure is fully recorded before this side resolves.
function waitForNextMacrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  return promise;
}

beforeEach(() => {
  nodeStopCount = 0;
  helia.destroy = async () => {
    nodeStopCount += 1;
  };
  helia.fetchBlock = async () => {
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
  helia.fetchBlock = async () => BLOCK;
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
  const p2pFetchStart = Promise.withResolvers<AbortSignal>();
  helia.fetchBlock = (_cid, signal) => {
    p2pFetchStart.resolve(signal);
    return waitForAbort(signal);
  };
  gatewayFetch = async () => {
    await p2pFetchStart.promise;
    return new Response(null, { status: 200 });
  };

  const verification = await verifyCid(CID, [GATEWAY]);

  expect(verification).toEqual({
    success: { cid: CID, resolvable: true, gateway: GATEWAY, statusCode: 200 },
  });
  expect((await p2pFetchStart.promise).aborted).toBe(true);
  await waitForNextMacrotask();
  expect(nodeStopCount).toBe(1);
});

test("fails only when every check fails, listing P2P first and gateways in order", async () => {
  helia.fetchBlock = async () => {
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
  helia.fetchBlock = async () => {
    p2pFailure.resolve();
    throw new Error("dial failed");
  };
  gatewayFetch = async () => {
    await p2pFailure.promise;
    await waitForNextMacrotask();
    return new Response(null, { status: 200 });
  };

  const verification = await verifyCid(CID, [GATEWAY]);

  expect("success" in verification && verification.success.gateway).toBe(GATEWAY);
});

test("a fast gateway failure leaves P2P to resolve later", async () => {
  const gatewayFailure = Promise.withResolvers<void>();
  helia.fetchBlock = async () => {
    await gatewayFailure.promise;
    await waitForNextMacrotask();
    return BLOCK;
  };
  gatewayFetch = async () => {
    gatewayFailure.resolve();
    throw new TypeError("fetch failed");
  };

  const verification = await verifyCid(CID, [GATEWAY]);

  expect("success" in verification && verification.success.gateway).toBe("p2p/bitswap");
});

// Verification runs after the content is stored, so a cleanup error must not
// replace its result or propagate into the upload's retry loop.
test("a failure to stop the node is reported and the result kept", async () => {
  const warning = Promise.withResolvers<unknown>();
  const warn = spyOn(console, "warn").mockImplementation((message) => warning.resolve(message));
  helia.fetchBlock = async () => BLOCK;
  helia.destroy = async () => {
    throw new Error("libp2p stop failed");
  };

  const verification = await verifyCid(CID, []);

  expect("success" in verification).toBe(true);
  expect(await warning.promise).toBe(
    "Failed to stop the P2P verification node: libp2p stop failed",
  );
  warn.mockRestore();
});

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

async function collectUploadPhases(gateways: readonly string[]): Promise<BulletinProgressEvent[]> {
  const phases: BulletinProgressEvent[] = [];
  await verifyUploadedCid((phase) => phases.push(phase), "CID", CID, gateways);
  return phases;
}

test("upload verification reports the source that resolved the CID", async () => {
  helia.fetchBlock = (_cid, signal) => waitForAbort(signal);
  gatewayFetch = async () => new Response(null, { status: 200 });

  expect(await collectUploadPhases([GATEWAY])).toEqual([
    { phase: "verify", state: "start", message: "Verifying CID on Bulletin P2P and IPFS gateways" },
    { phase: "verify", state: "success", message: `CID verified via ${GATEWAY}` },
  ]);
});

// The upload has already stored the content, so a failed check is a warning and
// must not reject into the upload's retry loop.
test("upload verification warns with every failure and does not reject", async () => {
  helia.fetchBlock = async () => {
    throw new Error("no Bulletin peer has the block");
  };
  gatewayFetch = async () => new Response(null, { status: 404 });

  expect(await collectUploadPhases([GATEWAY, SECOND_GATEWAY])).toEqual([
    { phase: "verify", state: "start", message: "Verifying CID on Bulletin P2P and IPFS gateways" },
    {
      phase: "verify",
      state: "warning",
      message: `CID not yet resolvable: p2p/bitswap: no Bulletin peer has the block; ${GATEWAY}: HTTP 404; ${SECOND_GATEWAY}: HTTP 404`,
    },
  ]);
});
