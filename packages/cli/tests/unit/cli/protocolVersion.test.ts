import { afterEach, describe, expect, test } from "bun:test";
import {
  classifyProtocolVersion,
  newestSupportedProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  UnsupportedProtocolVersionError,
} from "../../../src/core/protocolVersion";
import { enforceProtocolVersion } from "../../../src/cli/context";
import { ENV } from "../../../src/cli/env";
import type { ReviveClientWrapper } from "../../../src/client/polkadotClient";

const NEWEST = newestSupportedProtocolVersion();

afterEach(() => {
  delete process.env[ENV.SKIP_VERSION_CHECK];
});

describe("classifyProtocolVersion", () => {
  test("every listed release is supported", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(classifyProtocolVersion(version)).toEqual({ kind: "supported", declared: version });
    }
  });

  test("no declaration is undeclared, as on deployments before 0.8.0", () => {
    expect(classifyProtocolVersion(null)).toEqual({ kind: "undeclared", declared: null });
    expect(classifyProtocolVersion("")).toEqual({ kind: "undeclared", declared: null });
    expect(classifyProtocolVersion("   ")).toEqual({ kind: "undeclared", declared: null });
  });

  test("surrounding whitespace does not change the verdict", () => {
    expect(classifyProtocolVersion(` ${NEWEST} `)).toEqual({ kind: "supported", declared: NEWEST });
  });

  test("a later patch of the newest release is unknown, not refused", () => {
    expect(classifyProtocolVersion("1.0.7").kind).toBe("unknown");
  });

  test("an unlisted older release is unknown", () => {
    expect(classifyProtocolVersion("0.7.0").kind).toBe("unknown");
    expect(classifyProtocolVersion("0.9.1").kind).toBe("unknown");
  });

  test("a newer minor or major is refused", () => {
    expect(classifyProtocolVersion("1.1.0")).toEqual({ kind: "newer", declared: "1.1.0" });
    expect(classifyProtocolVersion("2.0.0")).toEqual({ kind: "newer", declared: "2.0.0" });
  });

  test("a prerelease or build of a newer release is refused too", () => {
    expect(classifyProtocolVersion("2.0.0-rc.1").kind).toBe("newer");
    expect(classifyProtocolVersion("1.1.0+build.7").kind).toBe("newer");
  });

  test("a prerelease of a supported major.minor is unknown", () => {
    expect(classifyProtocolVersion("1.0.1-rc.1").kind).toBe("unknown");
  });

  test("a malformed declaration is unknown, so it never locks users out", () => {
    expect(classifyProtocolVersion("one-point-oh").kind).toBe("unknown");
    expect(classifyProtocolVersion("9.9").kind).toBe("unknown");
  });
});

describe("UnsupportedProtocolVersionError", () => {
  test("names the declared and the newest supported release", () => {
    const error = new UnsupportedProtocolVersionError("2.0.0");
    expect(error.declared).toBe("2.0.0");
    expect(error.message).toContain("2.0.0");
    expect(error.message).toContain(NEWEST);
    expect(error.message).toContain("Upgrade the SDK");
  });
});

describe("enforceProtocolVersion", () => {
  test("the escape hatch skips the check without touching the chain", async () => {
    process.env[ENV.SKIP_VERSION_CHECK] = "1";
    // A wrapper that would throw on any use proves nothing was read.
    const untouchable = new Proxy(
      {},
      {
        get() {
          throw new Error("the chain was read despite DOTNS_SKIP_VERSION_CHECK=1");
        },
      },
    ) as ReviveClientWrapper;
    await enforceProtocolVersion(untouchable, "unused", "paseo-v2");
  });
});
