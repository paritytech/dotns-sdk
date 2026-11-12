import { afterEach, describe, expect, test } from "bun:test";
import type { PolkadotClient } from "polkadot-api";
import { chain } from "@parity/trinity-stack/reader";
import { assertExpectedChain } from "../../../src/cli/context";
import { setActiveDotnsEnvironment, DOTNS_ENVIRONMENTS } from "../../../src/utils/environments";
import { ENV } from "../../../src/cli/env";
import stacksJson from "../../../.trinity/stacks.json" with { type: "json" };

const PASEO_GENESIS = DOTNS_ENVIRONMENTS["paseo-v2"].genesisHash;

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
    const previewnet = DOTNS_ENVIRONMENTS.previewnet.genesisHash;
    // Both prefixes come from the bundled stacks: a previewnet restart changes its hash, and a
    // hardcoded prefix would break on every stack update.
    const pattern = new RegExp(
      `WRONG CHAIN.*paseo-v2.*expects Asset Hub genesis ${PASEO_GENESIS.slice(0, 6)}.*genesis ${previewnet.slice(0, 6)}`,
      "s",
    );
    await expect(assertExpectedChain(clientReporting(previewnet))).rejects.toThrow(pattern);
  });

  test("polkadot refuses a Paseo endpoint", async () => {
    setActiveDotnsEnvironment("polkadot");
    await expect(assertExpectedChain(clientReporting(PASEO_GENESIS))).rejects.toThrow(
      /WRONG CHAIN.*polkadot.*paseo-v2's Asset Hub/s,
    );
  });

  test("hash comparison is case-insensitive", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    await assertExpectedChain(clientReporting(PASEO_GENESIS.toUpperCase().replace("0X", "0x")));
  });

  // A restarted chain has a new genesis and a newer published stack than the copy in the CLI.
  test("a mismatch on a bundled stack prints the stack's published link", async () => {
    const polkadot = DOTNS_ENVIRONMENTS.polkadot;
    const error = await assertExpectedChain(clientReporting("0xdead"), "asset-hub", polkadot).catch(
      (error) => error,
    );
    expect(error.message).toContain(`--stack '${stacksJson.polkadot}'`);
  });

  test("an endpoint of another known chain does not get a --stack hint", async () => {
    const error = await assertExpectedChain(
      clientReporting(PASEO_GENESIS),
      "asset-hub",
      DOTNS_ENVIRONMENTS.polkadot,
    ).catch((error) => error);
    expect(error.message).not.toContain("--stack '");
  });

  test("a stack passed with --stack is not sent back to --stack", async () => {
    const passed = { ...DOTNS_ENVIRONMENTS.polkadot, publishedLink: null };
    const error = await assertExpectedChain(clientReporting("0xdead"), "asset-hub", passed).catch(
      (error) => error,
    );
    expect(error.message).toContain("WRONG CHAIN");
    expect(error.message).not.toContain("--stack '");
  });

  test("a bulletin mismatch points at the bulletin knobs", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    await expect(assertExpectedChain(clientReporting("0xdead"), "bulletin")).rejects.toThrow(
      /--bulletin-rpc and DOTNS_BULLETIN_RPC/,
    );
  });

  test("the escape hatch bypasses the check", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    process.env[ENV.SKIP_CHAIN_CHECK] = "1";
    await assertExpectedChain(clientReporting("0xdead"));
  });

  test("a known chain is named in the error alongside its hash", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const previewnet = DOTNS_ENVIRONMENTS.previewnet.genesisHash;
    await expect(assertExpectedChain(clientReporting(previewnet))).rejects.toThrow(
      /endpoint is previewnet's Asset Hub/,
    );
  });

  test("the bulletin connection is checked against the bulletin genesis", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const bulletin = chain(DOTNS_ENVIRONMENTS["paseo-v2"].descriptor, "Bulletin").genesisHash;
    await assertExpectedChain(clientReporting(bulletin), "bulletin");
    await expect(
      assertExpectedChain(clientReporting(DOTNS_ENVIRONMENTS["paseo-v2"].genesisHash), "bulletin"),
    ).rejects.toThrow(/paseo-v2's Asset Hub/);
  });

  test("the caller can inject the environment", async () => {
    setActiveDotnsEnvironment("paseo-v2");
    const previewnet = DOTNS_ENVIRONMENTS.previewnet;
    await assertExpectedChain(clientReporting(previewnet.genesisHash), "asset-hub", previewnet);
  });
});
