import { describe, it, expect } from "bun:test";
import { encodeErrorResult, type Abi } from "viem";
import { decodeRevertReason } from "./contractErrors";

const SAMPLE_ABI = [
  { type: "error", name: "EscrowNotConfigured", inputs: [] },
  { type: "error", name: "CommitmentNotFound", inputs: [{ name: "commitment", type: "bytes32" }] },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
] as const satisfies Abi;

const COMMITMENT = `0x${"ab".repeat(32)}` as const;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const ROLE = `0x${"cd".repeat(32)}` as const;

describe("decodeRevertReason", () => {
  it("decodes a no-argument error to its name", () => {
    const data = encodeErrorResult({ abi: SAMPLE_ABI, errorName: "EscrowNotConfigured" });
    expect(decodeRevertReason(data)).toBe("EscrowNotConfigured");
  });

  it("decodes an error with arguments to name and values", () => {
    const data = encodeErrorResult({
      abi: SAMPLE_ABI,
      errorName: "CommitmentNotFound",
      args: [COMMITMENT],
    });
    expect(decodeRevertReason(data)).toBe(`CommitmentNotFound(${COMMITMENT})`);
  });

  it("decodes multi-argument errors", () => {
    const data = encodeErrorResult({
      abi: SAMPLE_ABI,
      errorName: "AccessControlUnauthorizedAccount",
      args: [ACCOUNT, ROLE],
    });
    expect(decodeRevertReason(data)).toBe(`AccessControlUnauthorizedAccount(${ACCOUNT}, ${ROLE})`);
  });

  it("returns null for empty or missing revert data", () => {
    expect(decodeRevertReason(undefined)).toBeNull();
    expect(decodeRevertReason("0x")).toBeNull();
  });

  it("returns null when the selector is not in any contract ABI", () => {
    expect(decodeRevertReason("0xdeadbeef")).toBeNull();
  });
});
