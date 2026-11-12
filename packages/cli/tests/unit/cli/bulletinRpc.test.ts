import { afterEach, expect, test } from "bun:test";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/environments";
import { ENV, resolveBulletinRpc } from "../../../src/cli/env";

const SAVED_ENV = [ENV.DOTNS_ENV, ENV.STACK, ENV.BULLETIN_RPC] as const;
const originalEnv = Object.fromEntries(SAVED_ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of SAVED_ENV) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  setActiveDotnsEnvironment("paseo-v2");
});

test("explicit argument wins over env var and active env", () => {
  setActiveDotnsEnvironment("paseo-v2");
  process.env[ENV.BULLETIN_RPC] = "wss://env-var-bulletin.example";

  expect(resolveBulletinRpc("wss://explicit-bulletin.example")).toBe(
    "wss://explicit-bulletin.example",
  );
});

test("env var wins over active env config when no explicit argument", () => {
  setActiveDotnsEnvironment("paseo-v2");
  process.env[ENV.BULLETIN_RPC] = "wss://env-var-bulletin.example";

  expect(resolveBulletinRpc()).toBe("wss://env-var-bulletin.example");
});

test("falls back to the bulletin chain of the active environment's stack", () => {
  delete process.env[ENV.BULLETIN_RPC];

  for (const environment of Object.values(DOTNS_ENVIRONMENTS)) {
    setActiveDotnsEnvironment(environment);
    const bulletin = environment.descriptor.chains.find((chain) => chain.role === "Bulletin");
    expect(resolveBulletinRpc()).toBe(bulletin!.rpc[0]!);
  }
});
