import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realContext from "../../../src/core/context";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";

// The caller-side eligibility checks mirror the PopRules messages, so a user sees the
// same reason whether the CLI or the contract refuses the name.

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const OWNER = "0x00000000000000000000000000000000000000ee" as `0x${string}`;
const OTHER = "0x00000000000000000000000000000000000000dd" as `0x${string}`;

let requiredStatus = ProofOfPersonhoodStatus.NoStatus;
let userStatus = ProofOfPersonhoodStatus.NoStatus;
let reservedBy: `0x${string}` | null = null;

function fakeRead(_ctx: unknown, _address: string, _abi: unknown, functionName: string): unknown {
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  if (functionName === "tld") return ".paseo";
  if (functionName === "isBaseNameReserved") {
    return [reservedBy !== null, reservedBy ?? OWNER, 0n] as const;
  }
  if (functionName === "priceWithoutCheck") {
    return { price: 10n, status: requiredStatus, userStatus, message: "" };
  }
  if (functionName === "personhoodStatus") return { status: userStatus, contextAlias: "0x" };
  throw new Error(`unexpected read: ${functionName}`);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: fakeRead }));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { getPriceAndValidateEligibility } = await import("../../../src/commands/register");

const ctx = {
  clientWrapper: {},
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_RULES: "0x00000000000000000000000000000000000000bb",
  },
} as unknown as realContext.DotnsContext;

beforeEach(() => {
  requiredStatus = ProofOfPersonhoodStatus.NoStatus;
  userStatus = ProofOfPersonhoodStatus.NoStatus;
  reservedBy = null;
  clearTldInfoCache();
});

describe("getPriceAndValidateEligibility", () => {
  test("a personhood-band name refuses a devicehood holder with the PopRules reason", async () => {
    requiredStatus = ProofOfPersonhoodStatus.Personhood;
    userStatus = ProofOfPersonhoodStatus.Devicehood;
    await expect(getPriceAndValidateEligibility(ctx, "andrew", OWNER)).rejects.toThrow(
      "Requires personhood",
    );
  });

  test("a personhood holder passes the personhood band", async () => {
    requiredStatus = ProofOfPersonhoodStatus.Personhood;
    userStatus = ProofOfPersonhoodStatus.Personhood;
    const pricing = await getPriceAndValidateEligibility(ctx, "andrew", OWNER);
    expect(pricing.priceWei).toBe(10n);
  });

  test("a device name is refused before any pricing read", async () => {
    await expect(getPriceAndValidateEligibility(ctx, "joseph.42", OWNER)).rejects.toThrow(
      /device name/,
    );
  });

  test("a base name reserved for another account names the device-name claim", async () => {
    reservedBy = OTHER;
    await expect(getPriceAndValidateEligibility(ctx, "andrewsays", OWNER)).rejects.toThrow(
      "Reserved for a device-name holder's personhood claim",
    );
  });
});
