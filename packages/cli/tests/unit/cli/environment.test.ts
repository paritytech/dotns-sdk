import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  DOTNS_ENVIRONMENTS,
  getActiveDotnsEnvironment,
  resolveDotnsEnvironmentId,
  setActiveDotnsEnvironment,
} from "../../../src/utils/environments";
import { ENV, resolveRpc, selectDotnsEnvironment } from "../../../src/cli/env";
import { printCommandHeader } from "../../../src/cli/ui";

const SAVED_ENV = [ENV.DOTNS_ENV, ENV.STACK, ENV.RPC] as const;
const originalEnv = Object.fromEntries(SAVED_ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  mock.restore();
  for (const name of SAVED_ENV) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  setActiveDotnsEnvironment("paseo-v2");
});

function clearSelection() {
  for (const name of SAVED_ENV) delete process.env[name];
}

test("defaults to polkadot", async () => {
  clearSelection();

  await selectDotnsEnvironment({});
  expect(getActiveDotnsEnvironment().id).toBe("polkadot");
  expect(resolveRpc()).toBe(DOTNS_ENVIRONMENTS.polkadot.rpc);
});

// Built-in stacks run only from the copies bundled with the CLI.
test("selecting a bundled environment does not fetch anything", async () => {
  clearSelection();
  const fetchSpy = spyOn(globalThis, "fetch");
  await selectDotnsEnvironment({});
  await selectDotnsEnvironment({ env: "previewnet" });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("accepts friendly paseo-v2 aliases, including the stack's own name", () => {
  expect(resolveDotnsEnvironmentId("Paseo V2")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("v2")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("next")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("paseo-next-v2")).toBe("paseo-v2");
  expect(resolveDotnsEnvironmentId("paseo")).toBe("paseo-v2");
});

test("accepts polkadot aliases", () => {
  expect(resolveDotnsEnvironmentId("mainnet")).toBe("polkadot");
  expect(resolveDotnsEnvironmentId(undefined)).toBe("polkadot");
  expect(resolveDotnsEnvironmentId("Polkadot")).toBe("polkadot");
});

test("an unknown environment points at --stack", () => {
  expect(() => resolveDotnsEnvironmentId("kusama")).toThrow(/--stack/);
});

test("each environment id runs from its bundled stack", () => {
  expect(DOTNS_ENVIRONMENTS["paseo-v2"].descriptor.id).toBe("paseo-next-v2");
  expect(DOTNS_ENVIRONMENTS.previewnet.descriptor.id).toBe("previewnet");
  expect(DOTNS_ENVIRONMENTS.polkadot.descriptor.id).toBe("polkadot");
});

test("DOTNS_ENV selects the environment", async () => {
  clearSelection();
  process.env[ENV.DOTNS_ENV] = "paseo-v2";

  await selectDotnsEnvironment({});
  expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  expect(resolveRpc()).toBe(DOTNS_ENVIRONMENTS["paseo-v2"].rpc);
});

test("--env takes precedence over DOTNS_ENV and DOTNS_STACK while --rpc only overrides the endpoint", async () => {
  clearSelection();
  process.env[ENV.DOTNS_ENV] = "polkadot";
  process.env[ENV.STACK] = "/nonexistent/stack.json";
  process.env[ENV.RPC] = "wss://env-rpc.example";

  await selectDotnsEnvironment({ env: "paseo-v2" });
  expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  expect(resolveRpc("wss://cli-rpc.example")).toBe("wss://cli-rpc.example");
  expect(resolveRpc()).toBe("wss://env-rpc.example");
});

test("--stack cannot be combined with --env", async () => {
  await expect(
    selectDotnsEnvironment({ stack: "/nonexistent/stack.json", network: "polkadot" }),
  ).rejects.toThrow(/--stack .* --env/);
});

test("DOTNS_STACK and DOTNS_ENV together are rejected", async () => {
  clearSelection();
  process.env[ENV.DOTNS_ENV] = "polkadot";
  process.env[ENV.STACK] = "/nonexistent/stack.json";

  await expect(selectDotnsEnvironment({})).rejects.toThrow(/DOTNS_STACK or DOTNS_ENV/);
});

test("printCommandHeader emits one contextual line with version, action, target and network", () => {
  setActiveDotnsEnvironment("paseo-v2");
  const originalWrite = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    printCommandHeader("Escrow status", "alice.dot");
  } finally {
    process.stderr.write = originalWrite as typeof process.stderr.write;
  }
  expect(captured).toContain("dotns ");
  expect(captured).toContain("Escrow status");
  expect(captured).toContain("alice.dot");
  expect(captured).toContain("(paseo-v2)");
  expect(captured).not.toContain("═");
});
