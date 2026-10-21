import { describe, expect, test } from "bun:test";
import { Binary } from "polkadot-api";
import { encodeFunctionData, getAddress, type Address } from "viem";
import {
  assessGrant,
  decodeWhitelistGrantCall,
  describeReferendum,
  encodeGrantCalldata,
  formatBlockDuration,
  requiredBalance,
  trackRuntimeName,
  unwrapReviveCall,
  type GrantEligibility,
  type ProposalCosts,
  type ReferendumSummary,
} from "../../../src/commands/governance";
import {
  formatTokenAmount,
  matchesTypedAmount,
  typedAmount,
} from "../../../src/cli/commands/governance";
import { DOTNS_NAME_WHITELIST_ABI } from "../../../src/utils/constants";

const ME = getAddress("0x1111111111111111111111111111111111111111");
const OTHER = getAddress("0x2222222222222222222222222222222222222222");
const WHITELIST = getAddress("0xEc2f4c007b51c35DEfa96bF654f357Fc850362Ab");
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function eligibility(overrides: Partial<GrantEligibility> = {}): GrantEligibility {
  return {
    label: "web3",
    baseLength: 4,
    available: true,
    shortNamesEnabled: false,
    whitelistStatus: "Open",
    grantee: ZERO,
    beneficiaryClaim: "None",
    claimantCount: 0,
    popReservation: null,
    ...overrides,
  };
}

describe("assessGrant", () => {
  test("grants an open short name with no warnings", () => {
    const result = assessGrant(eligibility(), ME, "web3.dot");
    expect(result.blocker).toBeUndefined();
    expect(result.action).toBe("grantName");
    expect(result.warnings).toEqual([]);
  });

  test("sends a name of nine characters or more to the paid path", () => {
    const result = assessGrant(
      eligibility({ label: "paritytech", baseLength: 10 }),
      ME,
      "paritytech.dot",
    );
    expect(result.blocker).toContain("dotns register domain --name paritytech");
  });

  test("points a beneficiary who already holds the grant to the register step", () => {
    const result = assessGrant(
      eligibility({ whitelistStatus: "Claimed", grantee: ME }),
      ME,
      "web3.dot",
    );
    expect(result.blocker).toContain("--governance");
  });

  test("stops when the grant is used, even though isGrantedTo would read false", () => {
    const result = assessGrant(
      eligibility({ whitelistStatus: "Claimed", grantee: ME, available: false }),
      ME,
      "web3.dot",
    );
    expect(result.blocker).toContain("already registered");
  });

  test("stops when the name is granted to someone else", () => {
    const result = assessGrant(
      eligibility({ whitelistStatus: "Claimed", grantee: OTHER }),
      ME,
      "web3.dot",
    );
    expect(result.blocker).toContain(`granted to ${OTHER}`);
  });

  test("stops when the name is registered", () => {
    const result = assessGrant(eligibility({ available: false }), ME, "web3.dot");
    expect(result.blocker).toContain("already registered");
  });

  test("stops when the whitelist marks the name Reserved", () => {
    const result = assessGrant(eligibility({ whitelistStatus: "Reserved" }), ME, "web3.dot");
    expect(result.blocker).toContain("cannot be granted");
  });

  test("accepts the beneficiary's own request instead of granting from scratch", () => {
    const result = assessGrant(
      eligibility({ beneficiaryClaim: "Requested", claimantCount: 1 }),
      ME,
      "web3.dot",
    );
    expect(result.action).toBe("accept");
    expect(result.warnings).toEqual([]);
  });

  test("warns about other accounts' requests", () => {
    const result = assessGrant(
      eligibility({ beneficiaryClaim: "Requested", claimantCount: 3 }),
      ME,
      "web3.dot",
    );
    expect(result.warnings.join(" ")).toContain("2 other accounts have requested");
  });

  test("warns that a six to eight character name can be claimed in the App meanwhile", () => {
    const result = assessGrant(
      eligibility({
        label: "parity",
        baseLength: 6,
        shortNamesEnabled: true,
        popReservation: { owner: OTHER, expiresAt: 0n },
      }),
      ME,
      "parity.dot",
    );
    const text = result.warnings.join(" ");
    expect(text).toContain("personhood name in the Polkadot App");
    expect(text).toContain("bought on the paid path");
    expect(text).toContain(`${OTHER} holds a reservation`);
  });

  test("says nothing about the App for a name of five characters or fewer", () => {
    const result = assessGrant(eligibility({ popReservation: null }), ME, "web3.dot");
    expect(result.warnings.join(" ")).not.toContain("Polkadot App");
  });
});

describe("whitelist grant calls", () => {
  test("decodes the grant it encodes", () => {
    const data = encodeGrantCalldata("grantName", "web3", ME);
    expect(decodeWhitelistGrantCall(data)).toEqual({
      action: "grantName",
      labels: ["web3"],
      beneficiary: ME,
    });
  });

  test("decodes a batch grant with every label", () => {
    const data = encodeFunctionData({
      abi: DOTNS_NAME_WHITELIST_ABI,
      functionName: "grantNames",
      args: [["alpha", "web3"], ME],
    });
    expect(decodeWhitelistGrantCall(data)?.labels).toEqual(["alpha", "web3"]);
  });

  test("ignores whitelist calls that grant nothing", () => {
    const data = encodeFunctionData({
      abi: DOTNS_NAME_WHITELIST_ABI,
      functionName: "revokeName",
      args: ["web3"],
    });
    expect(decodeWhitelistGrantCall(data)).toBeNull();
    expect(decodeWhitelistGrantCall("0xdeadbeef")).toBeNull();
  });
});

describe("unwrapReviveCall", () => {
  const revive = {
    type: "Revive",
    value: {
      type: "call",
      value: { dest: Binary.fromHex(WHITELIST), data: Binary.fromHex("0x1234") },
    },
  };

  test("reads a Root proposal", () => {
    expect(unwrapReviveCall(revive)).toEqual({
      dest: WHITELIST.toLowerCase() as `0x${string}`,
      data: "0x1234",
      viaWhitelist: false,
    });
  });

  test("looks through the Whitelisted Caller wrapper", () => {
    const wrapped = {
      type: "Whitelist",
      value: { type: "dispatch_whitelisted_call_with_preimage", value: { call: revive } },
    };
    expect(unwrapReviveCall(wrapped)?.viaWhitelist).toBe(true);
  });

  test("ignores anything that isn't a contract call", () => {
    expect(unwrapReviveCall({ type: "System", value: { type: "remark", value: {} } })).toBeNull();
  });
});

describe("referendum descriptions", () => {
  const clock = {
    now: 1_000_000,
    undecidingTimeout: 43_200,
    decisionPeriods: new Map([[0, 403_200]]),
  };

  function summary(overrides: Partial<ReferendumSummary>): ReferendumSummary {
    return { index: 7, status: "Preparing", trackId: 0, ayes: 0n, nays: 0n, ...overrides };
  }

  test("a referendum without a decision deposit counts down to its timeout", () => {
    const text = describeReferendum(
      summary({ submittedAt: 1_000_000 - 14_400, decisionDepositPlaced: false }),
      clock,
    );
    expect(text).toBe("Preparing · times out in 2 days · needs a decision deposit");
  });

  test("a deciding referendum shows the time left and the aye share", () => {
    const text = describeReferendum(
      summary({ status: "Deciding", decidingSince: 1_000_000 - 100_800, ayes: 62n, nays: 38n }),
      clock,
    );
    expect(text).toBe("Deciding · 21 days left · Aye 62%");
  });

  test("a confirming referendum shows when it confirms", () => {
    const text = describeReferendum(
      summary({ status: "Confirming", decidingSince: 0, confirmingUntil: 1_000_000 + 600 }),
      clock,
    );
    expect(text).toBe("Confirming · confirms in 60 minutes");
  });

  test("a finished referendum shows its outcome", () => {
    expect(describeReferendum({ index: 1, status: "Rejected" }, clock)).toBe("Rejected");
  });

  test("durations read in the largest sensible unit", () => {
    expect(formatBlockDuration(403_200)).toBe("28 days");
    expect(formatBlockDuration(14_400)).toBe("24 hours");
    expect(formatBlockDuration(100)).toBe("10 minutes");
    expect(formatBlockDuration(-5)).toBe("1 minute");
  });
});

describe("costs", () => {
  const costs: ProposalCosts = {
    submissionDeposit: 100_000_000_000n,
    preimageDeposit: 4_023_600_000n,
    preimageNoted: false,
    decisionDeposit: 1_000_000_000_000_000n,
    fees: 22_080_245n,
    decisionDepositFee: 13_281_923n,
    existentialDeposit: 100_000_000n,
    freeBalance: 0n,
    undecidingTimeout: 43_200,
  };

  test("needs the submission, the preimage, fees and the existential deposit", () => {
    expect(requiredBalance(costs, false)).toBe(104_145_680_245n);
  });

  test("adds the decision deposit and its fee when placing it", () => {
    expect(requiredBalance(costs, true)).toBe(
      104_145_680_245n + 1_000_000_000_000_000n + 13_281_923n,
    );
  });

  test("an unpriced preimage deposit adds nothing", () => {
    expect(requiredBalance({ ...costs, preimageDeposit: null }, false)).toBe(100_122_080_245n);
  });
});

describe("amounts", () => {
  test("reads whole tokens with separators and short decimals", () => {
    expect(formatTokenAmount(1_000_000_000_000_000n, 10, "DOT")).toBe("100,000 DOT");
    expect(formatTokenAmount(4_023_600_000n, 10, "DOT")).toBe("0.4023 DOT");
    expect(formatTokenAmount(100_000_000_000n, 10, "PAS")).toBe("10 PAS");
  });

  test("asks for the exact amount to be typed", () => {
    expect(typedAmount(1_000_000_000_000_000n, 10)).toBe("100000");
    expect(typedAmount(15_000_000_000n, 10)).toBe("1.5");
  });

  test("accepts the typed amount with separators but nothing else", () => {
    expect(matchesTypedAmount("100,000", "100000")).toBe(true);
    expect(matchesTypedAmount(" 100_000 ", "100000")).toBe(true);
    expect(matchesTypedAmount("y", "100000")).toBe(false);
    expect(matchesTypedAmount("10000", "100000")).toBe(false);
  });
});

test("track names lose the runtime's padding", () => {
  expect(trackRuntimeName("root\u0000\u0000\u0000")).toBe("root");
  expect(trackRuntimeName(Binary.fromText("whitelisted_caller\u0000"))).toBe("whitelisted_caller");
});
