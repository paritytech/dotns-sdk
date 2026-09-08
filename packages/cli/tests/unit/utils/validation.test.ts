import { describe, expect, test } from "bun:test";
import {
  validateDomainLabel,
  validateGovernanceLabel,
  validateCanonicalLabel,
  isCanonicalLabel,
  isSecondLevelDotName,
  normaliseLabel,
  isPersonLabel,
  validateExistingNameLabel,
  isLitePersonLabel,
  baseLabelOf,
} from "../../../src/utils/validation";

describe("normaliseLabel", () => {
  test("lowercases, trims, and strips a single trailing .dot", () => {
    expect(normaliseLabel("  Alice.DOT ")).toBe("alice");
    expect(normaliseLabel("alice")).toBe("alice");
    expect(normaliseLabel("sub.alice.dot")).toBe("sub.alice");
  });

  test("strips the given TLD suffix rather than assuming .dot", () => {
    expect(normaliseLabel("alice.paseo", "paseo")).toBe("alice");
    expect(normaliseLabel("alice", "paseo")).toBe("alice");
    // Under the paseo TLD a trailing .dot is not a TLD and must not be stripped.
    expect(normaliseLabel("alice.dot", "paseo")).toBe("alice.dot");
    // A subdomain keeps both segments when the trailing one is not the TLD.
    expect(normaliseLabel("sub.alice", "paseo")).toBe("sub.alice");
  });
});

describe("isSecondLevelDotName", () => {
  test("distinguishes a second-level name from a subdomain under the given TLD", () => {
    expect(isSecondLevelDotName("alice.paseo", "paseo")).toBe(true);
    expect(isSecondLevelDotName("alice", "paseo")).toBe(true);
    expect(isSecondLevelDotName("sub.alice", "paseo")).toBe(false);
  });
});

describe("isCanonicalLabel", () => {
  test("accepts lowercase letters, digits and internal hyphens", () => {
    expect(isCanonicalLabel("alice")).toBe(true);
    expect(isCanonicalLabel("alice77")).toBe(true);
    expect(isCanonicalLabel("a-b-c")).toBe(true);
    expect(isCanonicalLabel("a")).toBe(true);
  });

  test("rejects dots, uppercase, spaces and other characters", () => {
    expect(isCanonicalLabel("sphakjjj.77")).toBe(false);
    expect(isCanonicalLabel("a.b")).toBe(false);
    expect(isCanonicalLabel("Alice")).toBe(false);
    expect(isCanonicalLabel("al ice")).toBe(false);
    expect(isCanonicalLabel("under_score")).toBe(false);
  });

  test("rejects leading or trailing hyphens, empty and overlong labels", () => {
    expect(isCanonicalLabel("-alice")).toBe(false);
    expect(isCanonicalLabel("alice-")).toBe(false);
    expect(isCanonicalLabel("")).toBe(false);
    expect(isCanonicalLabel("a".repeat(63))).toBe(true);
    expect(isCanonicalLabel("a".repeat(64))).toBe(false);
  });
});

describe("isSecondLevelDotName", () => {
  test("accepts a single label, with or without the .dot suffix", () => {
    expect(isSecondLevelDotName("alice")).toBe(true);
    expect(isSecondLevelDotName("alice.dot")).toBe(true);
    expect(isSecondLevelDotName("ALICE.DOT")).toBe(true);
  });

  test("rejects subdomains", () => {
    expect(isSecondLevelDotName("sub.alice")).toBe(false);
    expect(isSecondLevelDotName("sub.alice.dot")).toBe(false);
    expect(isSecondLevelDotName("a.b.c.dot")).toBe(false);
  });
});

describe("validateCanonicalLabel", () => {
  test("throws for a name containing a dot, naming the role", () => {
    expect(() => validateCanonicalLabel("sphakjjj.77", "subname")).toThrow(/subname/);
  });

  test("does not throw for a canonical label", () => {
    expect(() => validateCanonicalLabel("alice", "subname")).not.toThrow();
  });
});

describe("validateDomainLabel digit-suffix rule", () => {
  test("accepts labels with no trailing digits", () => {
    expect(() => validateDomainLabel("andrew")).not.toThrow();
  });

  test("accepts labels with exactly two trailing digits", () => {
    expect(() => validateDomainLabel("andrew01")).not.toThrow();
  });

  // dotns v0.6.0 measures ordinary labels as written: any digit count is a
  // different name, none is rejected.
  test("accepts labels with any trailing digit count", () => {
    expect(() => validateDomainLabel("andrew1")).not.toThrow();
    expect(() => validateDomainLabel("andrew123")).not.toThrow();
    expect(() => validateDomainLabel("andrew9999")).not.toThrow();
  });

  test("rejects labels shorter than three characters", () => {
    expect(() => validateDomainLabel("ab")).toThrow();
  });

  test("rejects labels with uppercase characters", () => {
    expect(() => validateDomainLabel("Andrew01")).toThrow();
  });

  test("rejects labels with leading or trailing hyphen", () => {
    expect(() => validateDomainLabel("-andrew")).toThrow();
    expect(() => validateDomainLabel("andrew-")).toThrow();
  });
});

describe("validateGovernanceLabel stem-length rule", () => {
  test("accepts stems of five characters or fewer", () => {
    expect(() => validateGovernanceLabel("vitalik".slice(0, 5))).not.toThrow();
    expect(() => validateGovernanceLabel("gavin")).not.toThrow();
  });

  test("rejects stems longer than five characters", () => {
    expect(() => validateGovernanceLabel("vitalik")).toThrow(
      /base name must be 5 characters or fewer/,
    );
  });

  // Since v0.6.0 `PopRules._stemEnd` measures every label as written unless it is a
  // lite label, so a trailing digit counts towards the base.
  test("measures an ordinary label whole, digits included", () => {
    expect(() => validateGovernanceLabel("abcd1")).not.toThrow();
    expect(() => validateGovernanceLabel("abcde1")).toThrow(
      /base name must be 5 characters or fewer/,
    );
  });

  test("does not apply the PopRules digit-suffix rule", () => {
    expect(() => validateGovernanceLabel("abcd1")).not.toThrow();
  });
});

// The digit-suffix rule ("zero or exactly two trailing digits") is a PopRules
// rule. registerReserved never consults PopRules — its only on-chain label checks
// are isSingleLabel() and length >= 3 — so applying that rule to this path would
// reject labels the contract accepts. Governance labels only.
//
// The contrast with the normal path is asserted at the bottom of this block, so
// the two rule sets can be read side by side rather than two files apart.
describe("validateGovernanceLabel measures the base as v0.6.0 does", () => {
  test("accepts any digit count while the whole label stays within the reserved band", () => {
    // registered on-chain: dim2.dot, paseo-next-v2
    expect(() => validateGovernanceLabel("dim2")).not.toThrow();
    expect(() => validateGovernanceLabel("dim22")).not.toThrow();
    expect(() => validateGovernanceLabel("game")).not.toThrow();
  });

  test("rejects once the label as written leaves the reserved band", () => {
    expect(() => validateGovernanceLabel("dim123")).toThrow(
      /base name must be 5 characters or fewer/,
    );
    expect(() => validateGovernanceLabel("dim9999")).toThrow(
      /base name must be 5 characters or fewer/,
    );
  });

  test("the NORMAL path accepts any digit count too", () => {
    expect(() => validateDomainLabel("dim2")).not.toThrow();
    expect(() => validateDomainLabel("dim123")).not.toThrow();
    expect(() => validateDomainLabel("dimtwo")).not.toThrow();
    expect(() => validateDomainLabel("dimtwo01")).not.toThrow();
  });
});

describe("validateGovernanceLabel canonical-label rules", () => {
  test("rejects uppercase characters", () => {
    expect(() => validateGovernanceLabel("Dim2")).toThrow(/governance label/);
  });

  test("rejects labels containing a dot", () => {
    expect(() => validateGovernanceLabel("dim.dot")).toThrow(/governance label/);
  });

  test("rejects leading or trailing hyphen", () => {
    expect(() => validateGovernanceLabel("-dim")).toThrow(/governance label/);
    expect(() => validateGovernanceLabel("dim-")).toThrow(/governance label/);
  });

  test("rejects labels shorter than three characters", () => {
    expect(() => validateGovernanceLabel("ab")).toThrow(/minimum length of 3 characters/);
  });
});

describe("isPersonLabel", () => {
  test("accepts a letters-only name", () => {
    expect(isPersonLabel("joseph")).toBe(true);
  });

  // The gateway pallet's `is_valid_person` admits neither digits nor hyphens, so a
  // label outside that shape cannot have been issued as an identity.
  test("rejects digits, hyphens, uppercase and the empty string", () => {
    expect(isPersonLabel("micha3l")).toBe(false);
    expect(isPersonLabel("andrew-x")).toBe(false);
    expect(isPersonLabel("Joseph")).toBe(false);
    expect(isPersonLabel("")).toBe(false);
  });
});

describe("isLitePersonLabel", () => {
  test("accepts a letters-only stem, one separator and exactly two digits", () => {
    expect(isLitePersonLabel("joseph.42")).toBe(true);
    expect(isLitePersonLabel("a.01")).toBe(true);
  });

  test("rejects a stem the gateway could not have issued", () => {
    expect(isLitePersonLabel("web3.42")).toBe(false);
    expect(isLitePersonLabel("andrew-x.42")).toBe(false);
  });

  test("rejects any other digit count or a missing separator", () => {
    expect(isLitePersonLabel("joseph.4")).toBe(false);
    expect(isLitePersonLabel("joseph.421")).toBe(false);
    expect(isLitePersonLabel("joseph42")).toBe(false);
    expect(isLitePersonLabel(".42")).toBe(false);
  });
});

describe("baseLabelOf", () => {
  // Mirrors `PopRules._stemEnd`, which both the tier and the reservation key use.
  test("drops the separator and allocated digits from a lite label", () => {
    expect(baseLabelOf("joseph.42")).toBe("joseph");
    expect(baseLabelOf("elizabeth.42")).toBe("elizabeth");
  });

  test("measures an ordinary label whole", () => {
    expect(baseLabelOf("web3")).toBe("web3");
    expect(baseLabelOf("joseph42")).toBe("joseph42");
    expect(baseLabelOf("longnamebob01")).toBe("longnamebob01");
  });
});

describe("isSecondLevelDotName with a lite name", () => {
  test("treats a lite name as one name, not a subdomain", () => {
    expect(isSecondLevelDotName("joseph.42")).toBe(true);
    expect(isSecondLevelDotName("joseph.42.dot")).toBe(true);
  });

  test("still treats a real subname as a subdomain", () => {
    expect(isSecondLevelDotName("sub.alice")).toBe(false);
    expect(isSecondLevelDotName("web3.42")).toBe(false);
  });
});

describe("lite names on the registration path", () => {
  // The charset error would call a perfectly valid on-chain label malformed, so the
  // registration path names the real reason instead.
  test("validateDomainLabel refuses a lite name with the gateway reason", () => {
    expect(() => validateDomainLabel("joseph.42")).toThrow(/lite personhood name/);
  });

  test("a shape the gateway cannot issue still gets the charset error", () => {
    expect(() => validateDomainLabel("web3.42")).toThrow(/only lowercase letters, digits/);
  });
});

describe("validateExistingNameLabel", () => {
  // A lite-name holder can still delegate it or make it their primary name, so
  // commands acting on an existing name accept the dotted form.
  test("accepts a lite name", () => {
    expect(() => validateExistingNameLabel("joseph.42")).not.toThrow();
  });

  test("accepts an ordinary label", () => {
    expect(() => validateExistingNameLabel("web3")).not.toThrow();
    expect(() => validateExistingNameLabel("longnamebob01")).not.toThrow();
  });

  test("still rejects a subname and other malformed input", () => {
    expect(() => validateExistingNameLabel("sub.alice")).toThrow();
    expect(() => validateExistingNameLabel("web3.42")).toThrow();
    expect(() => validateExistingNameLabel("ab")).toThrow();
  });
});
