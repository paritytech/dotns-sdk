import { afterEach, expect, test } from "bun:test";
import { verifyCidWithMultipleGateways, verifySingleFileCid } from "../../../src/bulletin/ipfs";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const polkadot = DOTNS_ENVIRONMENTS.polkadot;
const polkadotPeers = polkadot.bulletinP2pPeers;

afterEach(() => {
  polkadot.bulletinP2pPeers = polkadotPeers;
  setActiveDotnsEnvironment("paseo-v2");
});

test("polkadot verifies over the Bulletin boot nodes", () => {
  expect(polkadot.ipfsGatewayUrl).toBeNull();
  expect(polkadot.bulletinP2pPeers.length).toBeGreaterThan(0);
  for (const peer of polkadot.bulletinP2pPeers) expect(peer).toMatch(/\/wss\/p2p\/12D3KooW/);
});

// Without a gateway, an unresolved P2P check is the result: verification never
// throws into the upload's retry loop. No peers keeps the test off the network.
test("reports unresolved without throwing when the environment has no gateway", async () => {
  setActiveDotnsEnvironment("polkadot");
  polkadot.bulletinP2pPeers = [];
  const result = await verifySingleFileCid(CID);
  expect(result.resolvable).toBe(false);
  expect(result.gateway).toBe("p2p/bitswap");
});

test("probes no public gateway when the environment has no gateway", async () => {
  setActiveDotnsEnvironment("polkadot");
  const results = await verifyCidWithMultipleGateways(CID);
  expect(results.size).toBe(0);
});
