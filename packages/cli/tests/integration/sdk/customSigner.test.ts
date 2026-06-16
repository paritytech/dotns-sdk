import { describe, expect, test } from "bun:test";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Address,
} from "@polkadot-labs/hdkd-helpers";
import {
  createDotnsContext,
  classifyDomainName,
  setPrimaryName,
  MissingSignerError,
  ReviveClientWrapper,
  type PolkadotApiClient,
} from "../../../src/core";
import { RPC_ENDPOINTS } from "../../../src/utils/constants";

// Builds a PolkadotSigner with no dependency on @polkadot/keyring or the CLI auth
// stack — the same shape a mobile wallet, browser extension, or hardware signer
// would supply. This is the heart of issue #136: the consumer brings the signer.
function createCustomSigner(): { signer: PolkadotSigner; origin: string } {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE));
  const keypair = sr25519CreateDerive(miniSecret)("//Alice");
  const signer = getPolkadotSigner(keypair.publicKey, "Sr25519", async (input) =>
    keypair.sign(input),
  );
  return { signer, origin: ss58Address(keypair.publicKey) };
}

describe("custom signer injection (#136)", () => {
  test("createDotnsContext accepts a self-built signer and carries it unchanged", () => {
    const { signer, origin } = createCustomSigner();
    const ctx = createDotnsContext({
      clientWrapper: {} as ReviveClientWrapper,
      origin,
      signer,
    });
    expect(ctx.signer).toBe(signer);
    expect(ctx.origin).toBe(origin);
  });

  test("rejects an EVM (H160) origin so signer and origin cannot be confused", () => {
    const { signer } = createCustomSigner();
    expect(() =>
      createDotnsContext({
        clientWrapper: {} as ReviveClientWrapper,
        origin: "0x35cdb23ff7fc86e8dccd577ca309bfea9c978d20",
        signer,
      }),
    ).toThrow();
  });

  test("a write through a signer-less context fails fast with MissingSignerError", async () => {
    const { origin } = createCustomSigner();
    const ctx = createDotnsContext({ clientWrapper: {} as ReviveClientWrapper, origin });
    await expect(setPrimaryName(ctx, "alice")).rejects.toBeInstanceOf(MissingSignerError);
  });

  test("reads run end-to-end against the chain via the injected signer's context", async () => {
    const { signer, origin } = createCustomSigner();
    const rpc = process.env.DOTNS_RPC ?? RPC_ENDPOINTS[0];
    const rawClient = createClient(getWsProvider(rpc));
    try {
      const client = rawClient.getTypedApi(paseo) as PolkadotApiClient;
      const ctx = createDotnsContext({
        clientWrapper: new ReviveClientWrapper(client),
        origin,
        signer,
      });
      const classification = await classifyDomainName(ctx, "alice");
      expect(classification).toBeDefined();
      expect(typeof classification.requiredStatus).toBe("number");
    } finally {
      rawClient.destroy();
    }
  }, 60_000);
});

describe("DotnsContext construction invariants", () => {
  const baseOpts = () => {
    const { origin } = createCustomSigner();
    return { clientWrapper: {} as ReviveClientWrapper, origin };
  };

  test("freezes the context and its resolved contract book", () => {
    const ctx = createDotnsContext(baseOpts());
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.contracts)).toBe(true);
  });

  test("never invents a default signer when none is supplied", () => {
    const ctx = createDotnsContext(baseOpts());
    expect(ctx.signer).toBeUndefined();
  });

  test("rejects an unknown environment instead of silently defaulting", () => {
    expect(() => createDotnsContext({ ...baseOpts(), environment: "not-a-real-env" })).toThrow();
  });
});
