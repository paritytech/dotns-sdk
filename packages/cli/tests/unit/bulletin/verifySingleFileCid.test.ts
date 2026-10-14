import { afterEach, expect, test } from "bun:test";
import { verifyCidWithMultipleGateways, verifySingleFileCid } from "../../../src/bulletin/ipfs";
import { setActiveDotnsEnvironment } from "../../../src/utils/constants";

afterEach(() => {
  setActiveDotnsEnvironment("paseo-v2");
});

// polkadot has neither P2P peers nor an IPFS gateway: verification reports the
// content as unresolved, and never throws into the upload's retry loop.
test("reports unresolved without throwing when the environment has no gateway", async () => {
  setActiveDotnsEnvironment("polkadot");
  const result = await verifySingleFileCid(
    "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
  );
  expect(result.resolvable).toBe(false);
  expect(result.gateway).toBe("p2p/bitswap");
});

test("probes no public gateway when the environment has no gateway", async () => {
  setActiveDotnsEnvironment("polkadot");
  const results = await verifyCidWithMultipleGateways(
    "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
  );
  expect(results.size).toBe(0);
});
