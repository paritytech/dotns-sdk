import { afterEach, describe, expect, test } from "bun:test";
import {
  isSupportedProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  UnsupportedProtocolVersionError,
} from "../../../src/core/protocolVersion";
import { enforceProtocolVersion } from "../../../src/cli/context";
import { ENV } from "../../../src/cli/env";
import type { ReviveClientWrapper } from "../../../src/client/polkadotClient";

afterEach(() => {
  delete process.env[ENV.SKIP_VERSION_CHECK];
});

describe("isSupportedProtocolVersion", () => {
  test("every listed release is supported", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(isSupportedProtocolVersion(version)).toBe(true);
    }
  });

  test("a network that declares nothing is not supported", () => {
    expect(isSupportedProtocolVersion(null)).toBe(false);
  });

  test("only an exact match is supported", () => {
    for (const declared of ["1.0.1", "0.9.0", "1.1.0", "2.0.0", "2.0.0-rc.1", "1.0.0+build.7"]) {
      expect(isSupportedProtocolVersion(declared)).toBe(false);
    }
  });

  test("a malformed declaration is not supported", () => {
    expect(isSupportedProtocolVersion("9.9")).toBe(false);
    expect(isSupportedProtocolVersion("one-point-oh")).toBe(false);
  });
});

describe("UnsupportedProtocolVersionError", () => {
  test("names the declared release and the supported ones", () => {
    const error = new UnsupportedProtocolVersionError("2.0.0");
    expect(error.declared).toBe("2.0.0");
    expect(error.message).toContain("it runs dotNS protocol 2.0.0");
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) expect(error.message).toContain(version);
  });

  test("says when the network declares nothing", () => {
    expect(new UnsupportedProtocolVersionError(null).message).toContain(
      "it declares no dotNS protocol version",
    );
  });

  test("says when the declaration could not be read, and why", () => {
    const cause = new Error("execution reverted\n  at a stack frame");
    const error = new UnsupportedProtocolVersionError(null, cause);
    expect(error.message).toContain("could not be read (execution reverted)");
    expect(error.message).not.toContain("stack frame");
    expect(error.cause).toBe(cause);
  });

  test("names a non-Error cause", () => {
    expect(new UnsupportedProtocolVersionError(null, "timeout").message).toContain("(timeout)");
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
