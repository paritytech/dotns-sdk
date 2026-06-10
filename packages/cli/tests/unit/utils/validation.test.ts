import { describe, expect, test } from "bun:test";
import {
  validateDomainLabel,
  validateGovernanceLabel,
  validateCanonicalLabel,
  isCanonicalLabel,
  countTrailingDigits,
  stripTrailingDigits,
} from "../../../src/utils/validation";

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

  test("rejects labels with exactly one trailing digit", () => {
    expect(() => validateDomainLabel("andrew1")).toThrow(
      /must have either no trailing digits or exactly two/,
    );
  });

  test("rejects labels with three or more trailing digits", () => {
    expect(() => validateDomainLabel("andrew123")).toThrow(
      /must have either no trailing digits or exactly two/,
    );
    expect(() => validateDomainLabel("andrew9999")).toThrow(
      /must have either no trailing digits or exactly two/,
    );
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

  test("inherits the digit-suffix rule from validateDomainLabel", () => {
    expect(() => validateGovernanceLabel("abcd1")).toThrow(
      /must have either no trailing digits or exactly two/,
    );
  });
});
