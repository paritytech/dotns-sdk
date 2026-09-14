import { afterEach, describe, expect, test } from "bun:test";
import type { PolkadotClient } from "polkadot-api";
import { assertExpectedChain } from "../../../src/cli/context";
import { setActiveDotnsEnvironment, DOTNS_ENVIRONMENTS } from "../../../src/utils/constants";
import { ENV } from "../../../src/cli/env";

const PASEO_GENESIS = DOTNS_ENVIRONMENTS["paseo-v2"].genesisHash!;

function clientReporting(genesisHash: string): PolkadotClient {
  return { getChainSpecData: async () => ({ genesisHash }) } as unknown as PolkadotClient;
}

afterEach(() => {
  setActiveDotnsEnvironment("paseo-v2");
  delete process.env[ENV.SKIP_CHAIN_CHECK];
});

describe("assertExpectedChain", () => {
  test("passes when the chain reports the environment's genesis", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    await assertExpectedChain(clientReporting(PASEO_GENESIS));
  });

  test("fails naming both chains on a mismatch", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const previewnet = DOTNS_ENVIRONMENTS.previewnet.genesisHash!;
    await expect(assertExpectedChain(clientReporting(previewnet))).rejects.toThrow(
      /not paseo-v2.*reports genesis 0xc27c.*expects 0x4349/s,
    );
  });

  test("the escape hatch bypasses the check", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    process.env[ENV.SKIP_CHAIN_CHECK] = "1";
    await assertExpectedChain(clientReporting("0xdead"));
  });

  test("a known chain is named in the error, not just hashed", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const previewnet = DOTNS_ENVIRONMENTS.previewnet.genesisHash!;
    await expect(assertExpectedChain(clientReporting(previewnet))).rejects.toThrow(
      /endpoint is previewnet's Asset Hub/,
    );
  });

  test("the bulletin connection is checked against the bulletin genesis", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const bulletin = DOTNS_ENVIRONMENTS["paseo-v2"].bulletinGenesisHash!;
    await assertExpectedChain(clientReporting(bulletin), "bulletin");
    await expect(
      assertExpectedChain(clientReporting(DOTNS_ENVIRONMENTS["paseo-v2"].genesisHash!), "bulletin"),
    ).rejects.toThrow(/paseo-v2's Asset Hub/);
  });

  test("the caller can inject the environment", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const previewnet = DOTNS_ENVIRONMENTS.previewnet;
    await assertExpectedChain(clientReporting(previewnet.genesisHash!), "asset-hub", previewnet);
  });
});
