import { afterEach, expect, test } from "bun:test";
import {
  CONTRACTS,
  getActiveDotnsEnvironment,
  resolveDotnsEnvironmentId,
  setActiveDotnsEnvironment,
} from "../../../src/utils/constants";
import { ENV, resolveRpc } from "../../../src/cli/env";

const originalDotnsEnv = process.env[ENV.DOTNS_ENV];
const originalRpc = process.env[ENV.RPC];

afterEach(() => {
  if (originalDotnsEnv === undefined) delete process.env[ENV.DOTNS_ENV];
  else process.env[ENV.DOTNS_ENV] = originalDotnsEnv;

  if (originalRpc === undefined) delete process.env[ENV.RPC];
  else process.env[ENV.RPC] = originalRpc;

  setActiveDotnsEnvironment("paseo-v2");
});

test("defaults to paseo-v2", () => {
  delete process.env[ENV.DOTNS_ENV];
  delete process.env[ENV.RPC];

  expect(resolveRpc()).toBe("wss://paseo-asset-hub-next-rpc.polkadot.io");
  expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  expect(CONTRACTS.DOTNS_REGISTRAR_CONTROLLER).toBe("0x320b72c6e70D5a631d835FfD95915B288b26E6Be");
});

test("accepts friendly paseo-v2 aliases", () => {
  expect(resolveDotnsEnvironmentId("Paseo V2")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("paseo")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("next")).toBe("paseo-v2");
});

test("DOTNS_ENV selects rpc and contract set", () => {
  process.env[ENV.DOTNS_ENV] = "paseo-v2";
  delete process.env[ENV.RPC];

  expect(resolveRpc()).toBe("wss://paseo-asset-hub-next-rpc.polkadot.io");
  expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  expect(CONTRACTS.DOTNS_REGISTRAR_CONTROLLER).toBe("0x320b72c6e70D5a631d835FfD95915B288b26E6Be");
});

test("--env takes precedence over DOTNS_ENV while --rpc only overrides endpoint", () => {
  process.env[ENV.DOTNS_ENV] = "paseo-v2";
  process.env[ENV.RPC] = "wss://env-rpc.example";

  expect(resolveRpc("wss://cli-rpc.example", "paseo-v2")).toBe("wss://cli-rpc.example");
  expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  expect(CONTRACTS.DOTNS_REGISTRAR_CONTROLLER).toBe("0x320b72c6e70D5a631d835FfD95915B288b26E6Be");
});
