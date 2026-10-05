import { describe, expect, test } from "bun:test";
import {
  computeStorageDepositLimit,
  ReviveClientWrapper,
  type PolkadotApiClient,
} from "../../../src/client/polkadotClient";
import { createDotnsContext } from "../../../src/core/context";
import {
  DEFAULT_NATIVE_TOKEN_DECIMALS,
  DEFAULT_NATIVE_TOKEN_SYMBOL,
} from "../../../src/utils/constants";

const ORIGIN = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const CONTRACT = "0x00000000000000000000000000000000000000aa";

function tokens(amount: bigint, decimals: number): bigint {
  return amount * 10n ** BigInt(decimals);
}

describe("computeStorageDepositLimit", () => {
  test("floors at two whole tokens for 10 decimals", () => {
    expect(computeStorageDepositLimit(0n, 10)).toBe(20_000_000_000n);
  });

  test("floors at two whole tokens for 12 decimals", () => {
    expect(computeStorageDepositLimit(0n, 12)).toBe(2_000_000_000_000n);
  });

  test("keeps the floor when the buffered estimate is below it", () => {
    expect(computeStorageDepositLimit(tokens(1n, 10), 10)).toBe(tokens(2n, 10));
  });

  test("uses the estimate plus 20% once it exceeds the floor", () => {
    expect(computeStorageDepositLimit(tokens(5n, 10), 10)).toBe(tokens(6n, 10));
  });
});

describe("ReviveClientWrapper token info", () => {
  const client = {} as PolkadotApiClient;

  test("defaults to DEFAULT_NATIVE_TOKEN_DECIMALS and DEFAULT_NATIVE_TOKEN_SYMBOL", () => {
    const wrapper = new ReviveClientWrapper(client);
    expect(wrapper.nativeTokenDecimals).toBe(DEFAULT_NATIVE_TOKEN_DECIMALS);
    expect(wrapper.nativeTokenSymbol).toBe(DEFAULT_NATIVE_TOKEN_SYMBOL);
  });

  test("rejects non-integer and negative decimals", () => {
    expect(() => new ReviveClientWrapper(client, { nativeTokenDecimals: -1 })).toThrow();
    expect(() => new ReviveClientWrapper(client, { nativeTokenDecimals: 1.5 })).toThrow();
    expect(() => new ReviveClientWrapper(client, { nativeTokenDecimals: Number.NaN })).toThrow();
  });

  test("rejects an empty symbol", () => {
    expect(() => new ReviveClientWrapper(client, { nativeTokenSymbol: "" })).toThrow();
  });

  test("createDotnsContext reads token info from the wrapper", () => {
    const clientWrapper = new ReviveClientWrapper(client, {
      nativeTokenDecimals: 12,
      nativeTokenSymbol: "DOT",
    });
    const ctx = createDotnsContext({ clientWrapper, origin: ORIGIN });
    expect(ctx.nativeTokenDecimals).toBe(12);
    expect(ctx.nativeTokenSymbol).toBe("DOT");
  });
});

describe("submitTransaction storage_deposit_limit", () => {
  async function submittedLimit(decimals: number, estimatedStorageDeposit: bigint) {
    let callArgs: any;
    const client = {
      tx: {
        Revive: {
          call: (args: unknown) => {
            callArgs = args;
            return {};
          },
        },
      },
    } as unknown as PolkadotApiClient;
    const wrapper = new ReviveClientWrapper(client, { nativeTokenDecimals: decimals }) as any;
    wrapper.ensureAccountMapped = async () => false;
    wrapper.estimateGasForCall = async () => ({
      success: true,
      gasRequired: { referenceTime: 1n, proofSize: 1n },
      storageDeposit: estimatedStorageDeposit,
    });
    wrapper.signAndSubmitExtrinsic = async () => "0x";

    await wrapper.submitTransaction(CONTRACT, 0n, "0x", ORIGIN, {}, () => {});
    return callArgs.storage_deposit_limit as bigint;
  }

  test("applies the connected chain's two-token floor", async () => {
    expect(await submittedLimit(10, 0n)).toBe(tokens(2n, 10));
    expect(await submittedLimit(12, 0n)).toBe(tokens(2n, 12));
  });

  test("derives the limit from the dry run when it exceeds the floor", async () => {
    expect(await submittedLimit(10, tokens(10n, 10))).toBe(tokens(12n, 10));
  });
});
