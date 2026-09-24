import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { PolkadotClient } from "polkadot-api";
import { getChainTokenInfo } from "../../../src/cli/context";
import {
  DEFAULT_NATIVE_TOKEN_DECIMALS,
  DEFAULT_NATIVE_TOKEN_SYMBOL,
} from "../../../src/utils/constants";

function clientWithProperties(properties: Record<string, unknown> | undefined): PolkadotClient {
  return { getChainSpecData: async () => ({ properties }) } as unknown as PolkadotClient;
}

let warn: ReturnType<typeof spyOn>;

beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("getChainTokenInfo", () => {
  test("reads scalar properties", async () => {
    const info = await getChainTokenInfo(
      clientWithProperties({ tokenDecimals: 12, tokenSymbol: "KSM" }),
    );
    expect(info).toEqual({ nativeTokenDecimals: 12, nativeTokenSymbol: "KSM" });
    expect(warn).not.toHaveBeenCalled();
  });

  test("reads the first entry of array properties", async () => {
    const info = await getChainTokenInfo(
      clientWithProperties({ tokenDecimals: [10, 12], tokenSymbol: ["DOT", "USDT"] }),
    );
    expect(info).toEqual({ nativeTokenDecimals: 10, nativeTokenSymbol: "DOT" });
    expect(warn).not.toHaveBeenCalled();
  });

  test("accepts decimals encoded as a digit string", async () => {
    const info = await getChainTokenInfo(
      clientWithProperties({ tokenDecimals: "12", tokenSymbol: "KSM" }),
    );
    expect(info.nativeTokenDecimals).toBe(12);
  });

  test("falls back to the defaults with a warning when properties are missing", async () => {
    const info = await getChainTokenInfo(clientWithProperties(undefined));
    expect(info).toEqual({
      nativeTokenDecimals: DEFAULT_NATIVE_TOKEN_DECIMALS,
      nativeTokenSymbol: DEFAULT_NATIVE_TOKEN_SYMBOL,
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test.each([[""], [null], [true], [-1], [1.5], ["1.5"], [[]]])(
    "falls back to the default decimals for %p",
    async (tokenDecimals) => {
      const info = await getChainTokenInfo(
        clientWithProperties({ tokenDecimals, tokenSymbol: "DOT" }),
      );
      expect(info.nativeTokenDecimals).toBe(DEFAULT_NATIVE_TOKEN_DECIMALS);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  test("falls back to the default symbol for an empty string", async () => {
    const info = await getChainTokenInfo(
      clientWithProperties({ tokenDecimals: 10, tokenSymbol: "" }),
    );
    expect(info.nativeTokenSymbol).toBe(DEFAULT_NATIVE_TOKEN_SYMBOL);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
