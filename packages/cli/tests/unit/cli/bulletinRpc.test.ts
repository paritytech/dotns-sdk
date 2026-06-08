import { afterEach, expect, test } from "bun:test";
import { setActiveDotnsEnvironment } from "../../../src/utils/constants";
import { ENV, resolveBulletinRpc } from "../../../src/cli/env";

const originalDotnsEnv = process.env[ENV.DOTNS_ENV];
const originalBulletinRpc = process.env[ENV.BULLETIN_RPC];

afterEach(() => {
  if (originalDotnsEnv === undefined) delete process.env[ENV.DOTNS_ENV];
  else process.env[ENV.DOTNS_ENV] = originalDotnsEnv;

  if (originalBulletinRpc === undefined) delete process.env[ENV.BULLETIN_RPC];
  else process.env[ENV.BULLETIN_RPC] = originalBulletinRpc;

  setActiveDotnsEnvironment("paseo-v2");
});

test("paseo-v2 default resolves to the existing bulletin RPC", () => {
  delete process.env[ENV.DOTNS_ENV];
  delete process.env[ENV.BULLETIN_RPC];

  expect(resolveBulletinRpc()).toBe("wss://paseo-bulletin-next-rpc.polkadot.io");
});

test("explicit argument wins over env var and active env", () => {
  process.env[ENV.DOTNS_ENV] = "paseo-v2";
  process.env[ENV.BULLETIN_RPC] = "wss://env-var-bulletin.example";

  expect(resolveBulletinRpc("wss://explicit-bulletin.example", "paseo-v2")).toBe(
    "wss://explicit-bulletin.example",
  );
});

test("env var wins over active env config when no explicit argument", () => {
  process.env[ENV.BULLETIN_RPC] = "wss://env-var-bulletin.example";

  expect(resolveBulletinRpc(undefined, "paseo-v2")).toBe("wss://env-var-bulletin.example");
});

test("falls back to active env's bulletin RPC", () => {
  delete process.env[ENV.BULLETIN_RPC];

  expect(resolveBulletinRpc(undefined, "previewnet")).toBe(
    "wss://previewnet.substrate.dev/bulletin",
  );
  expect(resolveBulletinRpc(undefined, "paseo-v2")).toBe(
    "wss://paseo-bulletin-next-rpc.polkadot.io",
  );
});

test("throws when nothing is configured (synthetic case)", () => {
  delete process.env[ENV.BULLETIN_RPC];
  process.env[ENV.DOTNS_ENV] = "previewnet";

  // Simulate an env with no bulletin RPC by mutating the active config in
  // place. We restore it via afterEach by re-activating paseo-v2.
  const active = setActiveDotnsEnvironment("previewnet");
  const originalBulletinRpcConfig = active.bulletinRpc;
  active.bulletinRpc = null;

  try {
    expect(() => resolveBulletinRpc()).toThrow(/no bulletin RPC configured/);
  } finally {
    active.bulletinRpc = originalBulletinRpcConfig;
  }
});
