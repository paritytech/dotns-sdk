import { describe, expect, test } from "bun:test";
import { encodeFunctionResult } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import {
  getUserProofOfPersonhoodStatus,
  setUserProofOfPersonhoodStatus,
} from "../../../src/commands/register";
import { POP_RULES_ABI } from "../../../src/utils/constants";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import type { ReviveClientWrapper } from "../../../src/client/polkadotClient";

type CallEvent = "ensureAccountMapped" | "performDryRunCall" | "submitTransaction";

function createTrackingClient(currentStatus: ProofOfPersonhoodStatus) {
  const callOrder: CallEvent[] = [];

  const encodedStatus = encodeFunctionResult({
    abi: POP_RULES_ABI,
    functionName: "userPopStatus",
    result: BigInt(currentStatus) as any,
  });

  const client = {
    async ensureAccountMapped() {
      callOrder.push("ensureAccountMapped");
    },
    async performDryRunCall() {
      callOrder.push("performDryRunCall");
      return { result: { value: { data: encodedStatus, flags: 0n } } };
    },
    async submitTransaction() {
      callOrder.push("submitTransaction");
      return "0xdeadbeef" as const;
    },
  } as unknown as ReviveClientWrapper;

  return { client, callOrder };
}

const substrateAddress = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const evmAddress = "0x000000000000000000000000000000000000dead" as const;
const placeholderSigner = {} as PolkadotSigner;

describe("setUserProofOfPersonhoodStatus maps account before dry-run (regression for #89)", () => {
  test("ensureAccountMapped runs before the PoP dry-run read", async () => {
    const { client, callOrder } = createTrackingClient(
      ProofOfPersonhoodStatus.ProofOfPersonhoodFull,
    );

    await setUserProofOfPersonhoodStatus(
      client,
      substrateAddress,
      placeholderSigner,
      evmAddress,
      "",
      ProofOfPersonhoodStatus.ProofOfPersonhoodFull,
    );

    const mapIndex = callOrder.indexOf("ensureAccountMapped");
    const dryRunIndex = callOrder.indexOf("performDryRunCall");

    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(dryRunIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeLessThan(dryRunIndex);
  });

  test("skips submitTransaction when current status equals desired", async () => {
    const { client, callOrder } = createTrackingClient(
      ProofOfPersonhoodStatus.ProofOfPersonhoodLite,
    );

    await setUserProofOfPersonhoodStatus(
      client,
      substrateAddress,
      placeholderSigner,
      evmAddress,
      "",
      ProofOfPersonhoodStatus.ProofOfPersonhoodLite,
    );

    expect(callOrder).not.toContain("submitTransaction");
  });

  test("getUserProofOfPersonhoodStatus alone does not map the account", async () => {
    const { client, callOrder } = createTrackingClient(ProofOfPersonhoodStatus.NoStatus);

    await getUserProofOfPersonhoodStatus(client, substrateAddress, evmAddress);

    expect(callOrder).toContain("performDryRunCall");
    expect(callOrder).not.toContain("ensureAccountMapped");
  });
});
