import { describe, expect, test } from "bun:test";
import { dotliViewUrls } from "../../../src/utils/constants";

describe("dotliViewUrls", () => {
  test("builds gateway subdomain URLs, stripping the .dot TLD", () => {
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dot.li", "https://alice.paseo.li"]);
  });

  test("handles a multi-label subname", () => {
    expect(dotliViewUrls("pr170.dotns.dot")).toEqual([
      "https://pr170.dotns.dot.li",
      "https://pr170.dotns.paseo.li",
    ]);
  });

  test("accepts a name without the .dot suffix", () => {
    expect(dotliViewUrls("alice")).toEqual(["https://alice.dot.li", "https://alice.paseo.li"]);
  });

  test("lowercases the name", () => {
    expect(dotliViewUrls("Alice.DOT")).toEqual(["https://alice.dot.li", "https://alice.paseo.li"]);
  });
});
