import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  checkProtocolVersion,
  isSupportedProtocolVersion,
  readProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  UnsupportedProtocolVersionError,
} from "../../../src/core/protocolVersion";
import * as realContext from "../../../src/core/context";
import { assertSupportedProtocolVersion, enforceProtocolVersion } from "../../../src/cli/context";
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
    for (const declared of ["1.0.1", "0.9.0", "1.1.1", "2.0.0", "2.0.0-rc.1", "1.1.0+build.7"]) {
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

const ORIGIN = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

// Another suite replaces `read` process-wide, so these tests install their own: while
// a test sets `declared`, it answers the two version reads (the controller's
// protocolRegistry(), then the registry's protocolVersion()); every other read, and
// every read outside these tests, goes to the real implementation.
let declared: string | Error | undefined;
const realRead = realContext.read;

function versionRead(...args: Parameters<typeof realContext.read>): Promise<unknown> {
  const functionName = args[3];
  if (declared !== undefined && functionName === "protocolRegistry") {
    return Promise.resolve("0x00000000000000000000000000000000000000aa");
  }
  if (declared !== undefined && functionName === "protocolVersion") {
    return declared instanceof Error ? Promise.reject(declared) : Promise.resolve(declared);
  }
  return realRead(...args);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: versionRead }));

afterEach(() => {
  declared = undefined;
});

const wrapper = {} as ReviveClientWrapper;

function contextDeclaring(value: string | Error) {
  declared = value;
  return realContext.createDotnsContext({
    clientWrapper: wrapper,
    origin: ORIGIN,
    environment: "paseo-v2",
  });
}

describe("readProtocolVersion", () => {
  test("an empty or blank declaration reads as none", async () => {
    expect(await readProtocolVersion(contextDeclaring(""))).toBeNull();
    expect(await readProtocolVersion(contextDeclaring("   "))).toBeNull();
  });

  test("a padded declaration is trimmed", async () => {
    expect(await readProtocolVersion(contextDeclaring(" 1.0.0 "))).toBe("1.0.0");
  });
});

describe("checkProtocolVersion", () => {
  test("returns a supported declaration", async () => {
    expect(await checkProtocolVersion(contextDeclaring("1.0.0"))).toBe("1.0.0");
  });

  test("refuses a release outside the list, patch releases included", async () => {
    await expect(checkProtocolVersion(contextDeclaring("1.0.1"))).rejects.toBeInstanceOf(
      UnsupportedProtocolVersionError,
    );
  });

  test("a failed read is refused with its cause", async () => {
    const failure = new Error("connection reset");
    const error = await checkProtocolVersion(contextDeclaring(failure)).catch((e) => e);
    expect(error).toBeInstanceOf(UnsupportedProtocolVersionError);
    expect(error.cause).toBe(failure);
    expect(error.message).toContain("(connection reset)");
  });
});

describe("assertSupportedProtocolVersion", () => {
  test("names the CLI escape hatch, which core leaves out", async () => {
    declared = "0.7.0";
    const error = await assertSupportedProtocolVersion(wrapper, ORIGIN, "paseo-v2").catch((e) => e);
    expect(error).toBeInstanceOf(UnsupportedProtocolVersionError);
    expect(error.message).toContain(`Set ${ENV.SKIP_VERSION_CHECK}=1`);
    expect(new UnsupportedProtocolVersionError("0.7.0").message).not.toContain(
      ENV.SKIP_VERSION_CHECK,
    );
  });
});
