import { describe, it, expect } from "bun:test";
import { isCanonicalLabel, isSameDotName, isRegistrableDotName } from "./domain";

describe("isRegistrableDotName", () => {
  it("accepts second-level names with or without the suffix", () => {
    expect(isRegistrableDotName("alice")).toBe(true);
    expect(isRegistrableDotName("alice.dot")).toBe(true);
    expect(isRegistrableDotName(" Alice.DOT ")).toBe(true);
  });

  it("rejects subdomains", () => {
    expect(isRegistrableDotName("sub.alice.dot")).toBe(false);
    expect(isRegistrableDotName("a.b.c.dot")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isRegistrableDotName("")).toBe(false);
    expect(isRegistrableDotName(".dot")).toBe(false);
  });
});

describe("isSameDotName", () => {
  it("matches names regardless of the .dot suffix", () => {
    expect(isSameDotName("alice.dot", "alice")).toBe(true);
    expect(isSameDotName("pr158.dotns.dot", "pr158.dotns")).toBe(true);
  });

  it("matches regardless of case and surrounding whitespace", () => {
    expect(isSameDotName("Alice.DOT", "  alice.dot ")).toBe(true);
  });

  it("does not match different names", () => {
    expect(isSameDotName("alice.dot", "bob.dot")).toBe(false);
    expect(isSameDotName("pr158.dotns.dot", "dotns.dot")).toBe(false);
  });

  it("returns false when either name is empty or missing", () => {
    expect(isSameDotName(null, "alice.dot")).toBe(false);
    expect(isSameDotName("alice.dot", undefined)).toBe(false);
    expect(isSameDotName("", "")).toBe(false);
  });
});

describe("isCanonicalLabel", () => {
  it("accepts lowercase letters, digits and internal hyphens", () => {
    expect(isCanonicalLabel("alice")).toBe(true);
    expect(isCanonicalLabel("alice77")).toBe(true);
    expect(isCanonicalLabel("a-b-c")).toBe(true);
    expect(isCanonicalLabel("a")).toBe(true);
    expect(isCanonicalLabel("9")).toBe(true);
  });

  it("rejects names containing a dot", () => {
    expect(isCanonicalLabel("sphakjjj.77")).toBe(false);
    expect(isCanonicalLabel("a.b")).toBe(false);
    expect(isCanonicalLabel(".dot")).toBe(false);
  });

  it("rejects uppercase and non-ascii", () => {
    expect(isCanonicalLabel("Alice")).toBe(false);
    expect(isCanonicalLabel("café")).toBe(false);
  });

  it("rejects leading or trailing hyphens", () => {
    expect(isCanonicalLabel("-alice")).toBe(false);
    expect(isCanonicalLabel("alice-")).toBe(false);
    expect(isCanonicalLabel("-")).toBe(false);
  });

  it("rejects spaces and disallowed characters", () => {
    expect(isCanonicalLabel("al ice")).toBe(false);
    expect(isCanonicalLabel("alice!")).toBe(false);
    expect(isCanonicalLabel("under_score")).toBe(false);
  });

  it("rejects empty and overlong labels", () => {
    expect(isCanonicalLabel("")).toBe(false);
    expect(isCanonicalLabel("a".repeat(63))).toBe(true);
    expect(isCanonicalLabel("a".repeat(64))).toBe(false);
  });
});
