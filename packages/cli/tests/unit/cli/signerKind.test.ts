import { afterEach, describe, expect, test } from "bun:test";
import {
  resolveSignerKind,
  resolveQrAppId,
  resolveQrPeopleEndpoints,
  assertSignerOptions,
  DEFAULT_QR_APP_ID,
  ENV,
} from "../../../src/cli/env";

const originalSigner = process.env[ENV.SIGNER];
const originalAppId = process.env[ENV.QR_APP_ID];
const originalPeopleRpc = process.env[ENV.QR_PEOPLE_RPC];

afterEach(() => {
  if (originalSigner === undefined) delete process.env[ENV.SIGNER];
  else process.env[ENV.SIGNER] = originalSigner;
  if (originalAppId === undefined) delete process.env[ENV.QR_APP_ID];
  else process.env[ENV.QR_APP_ID] = originalAppId;
  if (originalPeopleRpc === undefined) delete process.env[ENV.QR_PEOPLE_RPC];
  else process.env[ENV.QR_PEOPLE_RPC] = originalPeopleRpc;
});

describe("resolveSignerKind", () => {
  test("defaults to keystore", () => {
    delete process.env[ENV.SIGNER];
    expect(resolveSignerKind()).toBe("keystore");
  });

  test("reads DOTNS_SIGNER=qr", () => {
    process.env[ENV.SIGNER] = "qr";
    expect(resolveSignerKind()).toBe("qr");
  });

  test("an explicit flag overrides the env var", () => {
    process.env[ENV.SIGNER] = "qr";
    expect(resolveSignerKind("keystore")).toBe("keystore");
  });

  test("an unknown value falls back to keystore", () => {
    expect(resolveSignerKind("nope")).toBe("keystore");
  });
});

describe("resolveQrAppId", () => {
  test("defaults to the unified product id", () => {
    delete process.env[ENV.QR_APP_ID];
    expect(resolveQrAppId()).toBe(DEFAULT_QR_APP_ID);
  });

  test("flag beats env beats default", () => {
    process.env[ENV.QR_APP_ID] = "from-env";
    expect(resolveQrAppId()).toBe("from-env");
    expect(resolveQrAppId("from-flag")).toBe("from-flag");
  });
});

describe("resolveQrPeopleEndpoints", () => {
  test("defaults to the paseo stage", () => {
    delete process.env[ENV.QR_PEOPLE_RPC];
    expect(resolveQrPeopleEndpoints()).toEqual(["wss://paseo-people-next-rpc.polkadot.io"]);
  });

  test("resolves named stages", () => {
    expect(resolveQrPeopleEndpoints("preview")).toEqual(["wss://previewnet.substrate.dev/people"]);
    expect(resolveQrPeopleEndpoints("stable")).toEqual([
      "wss://pop3-testnet.parity-lab.parity.io/people",
    ]);
  });

  test("treats a non-stage value as a comma-separated wss list", () => {
    expect(resolveQrPeopleEndpoints("wss://a/people, wss://b/people")).toEqual([
      "wss://a/people",
      "wss://b/people",
    ]);
  });

  test("flag beats env beats default", () => {
    process.env[ENV.QR_PEOPLE_RPC] = "preview";
    expect(resolveQrPeopleEndpoints()).toEqual(["wss://previewnet.substrate.dev/people"]);
    expect(resolveQrPeopleEndpoints("stable")).toEqual([
      "wss://pop3-testnet.parity-lab.parity.io/people",
    ]);
  });
});

describe("assertSignerOptions", () => {
  test("keystore signer allows local-account flags", () => {
    expect(() => assertSignerOptions({ signer: "keystore", account: "spha" })).not.toThrow();
  });

  test("qr signer with no local flags is allowed", () => {
    delete process.env[ENV.SIGNER];
    expect(() => assertSignerOptions({ signer: "qr" })).not.toThrow();
  });

  test("qr signer rejects a local-account flag", () => {
    expect(() => assertSignerOptions({ signer: "qr", account: "spha" })).toThrow(/--account/);
  });

  test("qr signer lists every conflicting flag", () => {
    expect(() => assertSignerOptions({ signer: "qr", password: "x", mnemonic: "y" })).toThrow(
      /--password, --mnemonic/,
    );
  });

  test("qr from env is also guarded", () => {
    process.env[ENV.SIGNER] = "qr";
    expect(() => assertSignerOptions({ keyUri: "//Alice" })).toThrow(/--key-uri/);
  });
});
