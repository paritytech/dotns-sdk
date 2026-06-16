import { afterEach, describe, expect, test } from "bun:test";
import { warnIfDevKeyOnTestnet } from "../../../src/cli/commands/bulletin";
import {
  DEFAULT_BULLETIN_AUTHORIZER_KEY_URI,
  DEFAULT_SUDO_KEY_URI,
  setActiveDotnsEnvironment,
} from "../../../src/utils/constants";
import { getPreviewUrl } from "../../../src/bulletin/cidHistory";
import type { UploadRecord } from "../../../src/types/types";

describe("bulletin authorizer default", () => {
  test("defaults to //Eve, the seeded AllowedAuthorizers account", () => {
    expect(DEFAULT_BULLETIN_AUTHORIZER_KEY_URI).toBe("//Eve");
  });

  test("is distinct from the sudo key, which stays //Alice", () => {
    expect(DEFAULT_SUDO_KEY_URI).toBe("//Alice");
    expect(DEFAULT_BULLETIN_AUTHORIZER_KEY_URI).not.toBe(DEFAULT_SUDO_KEY_URI);
  });
});

describe("warnIfDevKeyOnTestnet", () => {
  const originalWarn = console.warn;
  let warnings: string[] = [];

  const captureWarnings = (): void => {
    warnings = [];
    console.warn = (...values: unknown[]) => {
      warnings.push(values.map(String).join(" "));
    };
  };

  afterEach(() => {
    console.warn = originalWarn;
  });

  test("warns when the default authorizer is used against previewnet", () => {
    captureWarnings();
    warnIfDevKeyOnTestnet(DEFAULT_BULLETIN_AUTHORIZER_KEY_URI, "previewnet");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(DEFAULT_BULLETIN_AUTHORIZER_KEY_URI);
  });

  test("stays silent on paseo-v2 even with the default authorizer", () => {
    captureWarnings();
    warnIfDevKeyOnTestnet(DEFAULT_BULLETIN_AUTHORIZER_KEY_URI, "paseo-v2");
    expect(warnings.length).toBe(0);
  });

  test("stays silent when an explicit signer overrides the default", () => {
    captureWarnings();
    warnIfDevKeyOnTestnet("//Bob", "previewnet");
    expect(warnings.length).toBe(0);
  });
});

describe("getPreviewUrl", () => {
  const record: UploadRecord = { cid: "bafyfoo", path: "x", type: "file", size: 1, timestamp: "" };

  afterEach(() => {
    setActiveDotnsEnvironment("paseo-v2");
  });

  test("returns an https preview link on the environment that has a web app", () => {
    setActiveDotnsEnvironment("paseo-v2");
    const url = getPreviewUrl(record);
    expect(url?.startsWith("https://dotns.paseo.li/#/preview/")).toBe(true);
  });

  test("returns null (never throws) on an environment with no web app", () => {
    setActiveDotnsEnvironment("previewnet");
    expect(getPreviewUrl(record)).toBeNull();
  });
});
