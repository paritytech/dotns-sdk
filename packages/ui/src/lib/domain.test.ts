import { describe, it, expect } from "bun:test";
import { isCanonicalLabel } from "./domain";

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
