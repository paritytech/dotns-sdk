import { afterEach, describe, expect, test } from "bun:test";
import {
  resolveSignerKind,
  resolveQrAppId,
  resolveQrPeopleEndpoints,
  assertSignerOptions,
  DEFAULT_QR_APP_ID,
  ENV,
} from "../../../src/cli/env";
import { chain } from "@parity/trinity-stack/reader";
import {
  DOTNS_ENVIRONMENTS,
  setActiveDotnsEnvironment,
  type DotnsEnvironmentId,
} from "../../../src/utils/environments";

function peopleRpc(id: DotnsEnvironmentId): string[] {
  return chain(DOTNS_ENVIRONMENTS[id].descriptor, "People").rpc;
}

const SAVED_ENV = [ENV.SIGNER, ENV.QR_APP_ID, ENV.QR_PEOPLE_RPC, ENV.MNEMONIC] as const;
const originalEnv = Object.fromEntries(SAVED_ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of SAVED_ENV) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
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
  test("defaults to the People chain of the selected environment", () => {
    delete process.env[ENV.QR_PEOPLE_RPC];
    try {
      for (const environment of Object.values(DOTNS_ENVIRONMENTS)) {
        setActiveDotnsEnvironment(environment);
        expect(resolveQrPeopleEndpoints()).toEqual(peopleRpc(environment.id));
      }
    } finally {
      setActiveDotnsEnvironment("paseo-v2");
    }
  });

  test("resolves named stages", () => {
    expect(resolveQrPeopleEndpoints("polkadot")).toEqual(peopleRpc("polkadot"));
    expect(resolveQrPeopleEndpoints("paseo")).toEqual(peopleRpc("paseo-v2"));
    expect(resolveQrPeopleEndpoints("preview")).toEqual(peopleRpc("previewnet"));
  });

  // Pairing and signing identify the network by the same values, so `--env` values are stages too.
  test("resolves any --env value of a bundled stack as a stage", () => {
    expect(resolveQrPeopleEndpoints("paseo-v2")).toEqual(peopleRpc("paseo-v2"));
    expect(resolveQrPeopleEndpoints("ppn")).toEqual(peopleRpc("previewnet"));
    expect(resolveQrPeopleEndpoints("mainnet")).toEqual(peopleRpc("polkadot"));
  });

  test("treats a non-stage value as a comma-separated wss list", () => {
    expect(resolveQrPeopleEndpoints("wss://a/people, wss://b/people")).toEqual([
      "wss://a/people",
      "wss://b/people",
    ]);
  });

  test("rejects a non-wss URL", () => {
    expect(() => resolveQrPeopleEndpoints("https://evil/people")).toThrow(/wss:[/][/]/);
  });

  test("rejects an empty/blank value", () => {
    expect(() => resolveQrPeopleEndpoints(",,")).toThrow(/No QR pairing relay/);
  });

  // A blank flag or env var is a mistake, so it fails before the default relay is used.
  test("rejects a whitespace-only flag or env var", () => {
    expect(() => resolveQrPeopleEndpoints("   ")).toThrow(/No QR pairing relay/);
    process.env[ENV.QR_PEOPLE_RPC] = " ";
    expect(() => resolveQrPeopleEndpoints()).toThrow(/No QR pairing relay/);
  });

  test("rejects a wss URL with embedded credentials", () => {
    expect(() => resolveQrPeopleEndpoints("wss://user:pass@relay/people")).toThrow(/credentials/);
  });

  test("flag beats env beats default", () => {
    process.env[ENV.QR_PEOPLE_RPC] = "preview";
    expect(resolveQrPeopleEndpoints()).toEqual(peopleRpc("previewnet"));
    expect(resolveQrPeopleEndpoints("polkadot")).toEqual(peopleRpc("polkadot"));
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

  test("qr signer rejects a keystore secret supplied via env", () => {
    process.env[ENV.SIGNER] = "qr";
    process.env[ENV.MNEMONIC] = "bottom drive obey lake curtain smoke";
    expect(() => assertSignerOptions({})).toThrow(new RegExp(ENV.MNEMONIC));
  });
});
