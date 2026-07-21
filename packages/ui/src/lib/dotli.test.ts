import { afterEach, describe, expect, it } from "bun:test";
import { dotliViewUrls } from "./dotli";

const originalWindow = globalThis.window;

function setHostname(hostname: string | undefined): void {
  if (hostname === undefined) {
    // @ts-expect-error deleting the test stand-in for a headless environment
    delete globalThis.window;
    return;
  }
  // @ts-expect-error minimal window stand-in for hostname derivation
  globalThis.window = { location: { hostname } };
}

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error restoring the absent window
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe("dotliViewUrls", () => {
  it("uses the gateway the app is served from", () => {
    setHostname("dotns.dot.li");
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dot.li"]);

    setHostname("dotns.paseo.li");
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.paseo.li"]);

    setHostname("dotns.dev-dot.li");
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dev-dot.li"]);
  });

  it("falls back to dot.li on non-gateway hosts", () => {
    setHostname("localhost");
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dot.li"]);

    setHostname("127.0.0.1");
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dot.li"]);

    setHostname(undefined);
    expect(dotliViewUrls("alice.dot")).toEqual(["https://alice.dot.li"]);
  });

  it("strips the .dot suffix and lower-cases the label", () => {
    setHostname("dotns.paseo.li");
    expect(dotliViewUrls("ALICE.dot")).toEqual(["https://alice.paseo.li"]);
    expect(dotliViewUrls("alice")).toEqual(["https://alice.paseo.li"]);
  });
});
