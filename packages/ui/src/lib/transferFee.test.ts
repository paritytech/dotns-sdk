import { describe, it, expect } from "bun:test";
import { transferFeeOutcome } from "./transferFee";

describe("transferFeeOutcome", () => {
  it("is free when the recipient meets the name tier and is not a downgrade", () => {
    expect(transferFeeOutcome(0, 0, 0)).toEqual({ paysFloor: false, reason: "" });
    expect(transferFeeOutcome(1, 1, 2)).toEqual({ paysFloor: false, reason: "" });
    expect(transferFeeOutcome(0, 1, 2)).toEqual({ paysFloor: false, reason: "" });
  });

  it("charges the floor for a reach miss when the recipient is below the name tier", () => {
    expect(transferFeeOutcome(2, 0, 1)).toEqual({ paysFloor: true, reason: "below name tier" });
    expect(transferFeeOutcome(1, 0, 0)).toEqual({ paysFloor: true, reason: "below name tier" });
  });

  it("charges the floor for a downgrade when the recipient is a lower tier than the sender", () => {
    expect(transferFeeOutcome(0, 2, 1)).toEqual({ paysFloor: true, reason: "downgrade" });
    expect(transferFeeOutcome(0, 1, 0)).toEqual({ paysFloor: true, reason: "downgrade" });
  });

  it("reports both reasons when the recipient misses reach and is a downgrade", () => {
    expect(transferFeeOutcome(2, 2, 0)).toEqual({ paysFloor: true, reason: "reach + downgrade" });
    expect(transferFeeOutcome(2, 1, 0)).toEqual({ paysFloor: true, reason: "reach + downgrade" });
  });
});
