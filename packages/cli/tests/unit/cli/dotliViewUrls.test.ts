import { afterEach, expect, test } from "bun:test";
import { dotliViewUrls, setActiveDotnsEnvironment } from "../../../src/utils/constants";

afterEach(() => {
  setActiveDotnsEnvironment("paseo-v2");
});

test("paseo-v2 emits only its paseo.li gateway", () => {
  setActiveDotnsEnvironment("paseo-v2");
  expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.paseo.li"]);
});

test("devnet emits only its dev-dot.li gateway", () => {
  setActiveDotnsEnvironment("devnet");
  expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dev-dot.li"]);
});

test("previewnet emits no dot.li gateway", () => {
  setActiveDotnsEnvironment("previewnet");
  expect(dotliViewUrls("alice.dot")).toEqual([]);
});
