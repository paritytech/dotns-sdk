import { describe, expect, test } from "bun:test";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../../src/client/polkadotClient";

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const ALICE_EVM = "0x9621dde636de098b43efb0fa9b61facfe328f99d";

type FakeChain = { client: PolkadotApiClient; mapCalls: () => number };

function fakeChain(answers: Array<"mapped" | "unmapped" | "error">): FakeChain {
  let reads = 0;
  let maps = 0;
  const client = {
    apis: { ReviveApi: { address: async () => ({ asHex: () => ALICE_EVM }) } },
    query: {
      Revive: {
        OriginalAccount: {
          getValue: async () => {
            const answer = answers[Math.min(reads++, answers.length - 1)];
            if (answer === "error") throw new Error("RPC dropped the read");
            return answer === "mapped" ? ALICE : undefined;
          },
        },
      },
    },
    tx: {
      Revive: {
        map_account: () => {
          maps++;
          throw new Error("map_account must not be built");
        },
      },
    },
  } as unknown as PolkadotApiClient;
  return { client, mapCalls: () => maps };
}

const signer = {} as never;

describe("ensureAccountMapped", () => {
  test("retries a failed mapping read instead of mapping again", async () => {
    const chain = fakeChain(["error", "mapped"]);
    await expect(
      new ReviveClientWrapper(chain.client).ensureAccountMapped(ALICE, signer),
    ).resolves.toBe(true);
    expect(chain.mapCalls()).toBe(0);
  });

  test("surfaces a read that keeps failing rather than signing map_account", async () => {
    const chain = fakeChain(["error"]);
    await expect(
      new ReviveClientWrapper(chain.client).ensureAccountMapped(ALICE, signer),
    ).rejects.toThrow("RPC dropped the read");
    expect(chain.mapCalls()).toBe(0);
  });

  test("maps only when the chain answers that the account is unmapped", async () => {
    const chain = fakeChain(["unmapped"]);
    await expect(
      new ReviveClientWrapper(chain.client).ensureAccountMapped(ALICE, signer),
    ).rejects.toThrow("map_account must not be built");
    expect(chain.mapCalls()).toBe(1);
  });
});

test("checkIfAccountMapped still reads a failure as unmapped for display", async () => {
  expect(
    await new ReviveClientWrapper(fakeChain(["error"]).client).checkIfAccountMapped(ALICE),
  ).toBe(false);
});
