import { describe, expect, test } from "bun:test";
import {
  validateDomainLabel,
  validateGovernanceLabel,
  validateCanonicalLabel,
  isCanonicalLabel,
  isSecondLevelDotName,
  countTrailingDigits,
  stripTrailingDigits,
  normaliseLabel,
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

describe("countTrailingDigits", () => {
  test("returns 0 for a label with no trailing digits", () => {
    expect(countTrailingDigits("andrew")).toBe(0);
  });

  test("returns the digit run length for a label with trailing digits", () => {
    expect(countTrailingDigits("andrew01")).toBe(2);
    expect(countTrailingDigits("andrew1")).toBe(1);
    expect(countTrailingDigits("andrew123")).toBe(3);
  });

  test("does not count interior digits", () => {
    expect(countTrailingDigits("an12drew")).toBe(0);
    expect(countTrailingDigits("an12drew01")).toBe(2);
  });
});

describe("stripTrailingDigits", () => {
  test("returns the label unchanged when there are no trailing digits", () => {
    expect(stripTrailingDigits("andrew")).toBe("andrew");
  });

  test("strips the trailing digit run", () => {
    expect(stripTrailingDigits("andrew01")).toBe("andrew");
    expect(stripTrailingDigits("andrew123")).toBe("andrew");
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

  test("measures the stem with trailing digits stripped", () => {
    expect(() => validateGovernanceLabel("abcde1")).not.toThrow();
    expect(() => validateGovernanceLabel("abcdef1")).toThrow(
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
describe("validateGovernanceLabel is independent of the PopRules digit-suffix rule", () => {
  test("accepts ONE trailing digit, which PopRules rejects outright", () => {
    // registered on-chain: dim2.dot, paseo-next-v2
    expect(() => validateGovernanceLabel("dim2")).not.toThrow();
  });

  test("accepts THREE OR MORE trailing digits, which PopRules also rejects", () => {
    expect(() => validateGovernanceLabel("dim123")).not.toThrow();
    expect(() => validateGovernanceLabel("dim9999")).not.toThrow();
  });

  test("accepts zero trailing digits", () => {
    expect(() => validateGovernanceLabel("game")).not.toThrow();
  });

  test("accepts exactly two trailing digits", () => {
    expect(() => validateGovernanceLabel("dim22")).not.toThrow();
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
