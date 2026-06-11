import { afterEach, expect, test } from "bun:test";
import { setActiveDotnsEnvironment } from "../../../src/utils/constants";
import { ENV, resolveBulletinRpc } from "../../../src/cli/env";
import { resolveBulletinCacheAssetHubRpc } from "../../../src/cli/commands/bulletin";

const originalDotnsEnv = process.env[ENV.DOTNS_ENV];
const originalBulletinRpc = process.env[ENV.BULLETIN_RPC];
const originalRpc = process.env[ENV.RPC];

afterEach(() => {
  if (originalDotnsEnv === undefined) delete process.env[ENV.DOTNS_ENV];
  else process.env[ENV.DOTNS_ENV] = originalDotnsEnv;

  if (originalBulletinRpc === undefined) delete process.env[ENV.BULLETIN_RPC];
  else process.env[ENV.BULLETIN_RPC] = originalBulletinRpc;

  if (originalRpc === undefined) delete process.env[ENV.RPC];
  else process.env[ENV.RPC] = originalRpc;

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

test("bulletin cache Asset Hub RPC uses merged CLI rpc before DOTNS_RPC", () => {
  process.env[ENV.RPC] = "wss://stale-env-asset-hub.example";

  expect(
    resolveBulletinCacheAssetHubRpc({
      rpc: "wss://explicit-asset-hub.example",
      env: "paseo-v2",
    }),
  ).toBe("wss://explicit-asset-hub.example");
});

test("bulletin cache Asset Hub RPC uses selected environment when no rpc override exists", () => {
  delete process.env[ENV.RPC];

  expect(resolveBulletinCacheAssetHubRpc({ env: "previewnet" })).toBe(
    "wss://previewnet.substrate.dev/asset-hub",
  );
});

test("bulletin cache rejects custom Bulletin env override without matching target", () => {
  delete process.env[ENV.DOTNS_ENV];
  delete process.env[ENV.RPC];
  process.env[ENV.BULLETIN_RPC] = "wss://custom-bulletin.example";

  expect(() => resolveBulletinCacheAssetHubRpc({})).toThrow("custom Bulletin RPC requires");
});

test("bulletin cache accepts custom Bulletin override with explicit environment", () => {
  process.env[ENV.RPC] = "wss://stale-env-asset-hub.example";
  process.env[ENV.BULLETIN_RPC] = "wss://custom-bulletin.example";

  expect(resolveBulletinCacheAssetHubRpc({ env: "paseo-v2" })).toBe(
    "wss://paseo-asset-hub-next-rpc.polkadot.io",
  );
});

test("bulletin cache custom Bulletin with DOTNS_ENV ignores stale DOTNS_RPC", () => {
  process.env[ENV.DOTNS_ENV] = "paseo-v2";
  process.env[ENV.RPC] = "wss://stale-env-asset-hub.example";
  process.env[ENV.BULLETIN_RPC] = "wss://custom-bulletin.example";

  expect(resolveBulletinCacheAssetHubRpc({})).toBe("wss://paseo-asset-hub-next-rpc.polkadot.io");
});

test("bulletin cache accepts custom Bulletin override with explicit Asset Hub RPC", () => {
  delete process.env[ENV.DOTNS_ENV];
  process.env[ENV.BULLETIN_RPC] = "wss://custom-bulletin.example";

  expect(
    resolveBulletinCacheAssetHubRpc({
      rpc: "wss://explicit-asset-hub.example",
    }),
  ).toBe("wss://explicit-asset-hub.example");
});
