import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
  mockHeliaClient,
  waitForAbort,
  type MockHeliaClientBehaviour,
} from "../../_helpers/heliaClientMock";
import { DOTNS_ENVIRONMENTS } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const PASEO_GATEWAY = DOTNS_ENVIRONMENTS["paseo-v2"].ipfsGatewayUrl!;

const helia: MockHeliaClientBehaviour = {
  fetchBlock: async () => new Uint8Array([1]),
  destroy: async () => {},
};
let gatewayFetch: (url: string, init: RequestInit) => Promise<Response>;

mockHeliaClient(helia);

const { runDotnsCli } = await import("../../_helpers/cliHelpers");

async function runVerifyJson(): Promise<unknown> {
  const result = await runDotnsCli(["bulletin", "verify", CID, "--env", "paseo-v2", "--json"]);
  return JSON.parse(result.standardOutput.trim().split("\n")[0]!);
}

beforeEach(() => {
  spyOn(globalThis, "fetch").mockImplementation(((url: string, init: RequestInit) =>
    gatewayFetch(url, init)) as unknown as typeof fetch);
});

afterEach(() => {
  mock.restore();
});

test("--json reports method p2p with only the P2P entry when P2P resolves first", async () => {
  helia.fetchBlock = async () => new Uint8Array([1]);
  gatewayFetch = (_url, init) => waitForAbort(init.signal!);

  expect(await runVerifyJson()).toEqual({
    cid: CID,
    resolvable: true,
    method: "p2p",
    gateways: [{ gateway: "p2p/bitswap", resolvable: true }],
  });
});

test("--json reports method gateway with only that gateway when it resolves first", async () => {
  helia.fetchBlock = (_cid, signal) => waitForAbort(signal);
  gatewayFetch = (url, init) =>
    url.startsWith(PASEO_GATEWAY)
      ? Promise.resolve(new Response(null, { status: 200 }))
      : waitForAbort(init.signal!);

  expect(await runVerifyJson()).toEqual({
    cid: CID,
    resolvable: true,
    method: "gateway",
    gateways: [{ gateway: PASEO_GATEWAY, resolvable: true, statusCode: 200 }],
  });
});

test("--json reports method none with every failure, P2P first", async () => {
  helia.fetchBlock = async () => {
    throw new Error("no Bulletin peer has the block");
  };
  gatewayFetch = async () => new Response(null, { status: 404 });

  expect(await runVerifyJson()).toEqual({
    cid: CID,
    resolvable: false,
    method: "none",
    gateways: [
      { gateway: "p2p/bitswap", resolvable: false, errorMessage: "no Bulletin peer has the block" },
      { gateway: PASEO_GATEWAY, resolvable: false, statusCode: 404 },
      { gateway: "https://dweb.link", resolvable: false, statusCode: 404 },
      { gateway: "https://cloudflare-ipfs.com", resolvable: false, statusCode: 404 },
      { gateway: "https://w3s.link", resolvable: false, statusCode: 404 },
    ],
  });
});
