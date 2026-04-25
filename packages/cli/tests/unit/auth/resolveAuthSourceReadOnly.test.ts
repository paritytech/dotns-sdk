import { afterEach, describe, expect, test } from "bun:test";
import { resolveAuthSourceReadOnly } from "../../../src/commands/auth";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";
import { ENV } from "../../../src/cli/env";
import { ALICE_KEY_URI } from "../../_helpers/cliHelpers";

const CUSTOM_MNEMONIC =
  "absorb oppose idea expire husband layer subject flip pause ahead daring stem";

const previousEnv = {
  mnemonic: process.env[ENV.MNEMONIC],
  keyUri: process.env[ENV.KEY_URI],
};

function clearAuthEnv(): void {
  delete process.env[ENV.MNEMONIC];
  delete process.env[ENV.KEY_URI];
}

function restoreAuthEnv(): void {
  if (previousEnv.mnemonic === undefined) delete process.env[ENV.MNEMONIC];
  else process.env[ENV.MNEMONIC] = previousEnv.mnemonic;

  if (previousEnv.keyUri === undefined) delete process.env[ENV.KEY_URI];
  else process.env[ENV.KEY_URI] = previousEnv.keyUri;
}

afterEach(() => {
  restoreAuthEnv();
});

type EnvCase = {
  label: string;
  env: { mnemonic?: string; keyUri?: string };
  expected: { source: string; isKeyUri: boolean; resolvedFrom: "env" | "default" };
};

const envCases: EnvCase[] = [
  {
    label: "no env falls back to DEFAULT_MNEMONIC",
    env: {},
    expected: { source: DEFAULT_MNEMONIC, isKeyUri: false, resolvedFrom: "default" },
  },
  {
    label: "DOTNS_MNEMONIC is used when set",
    env: { mnemonic: CUSTOM_MNEMONIC },
    expected: { source: CUSTOM_MNEMONIC, isKeyUri: false, resolvedFrom: "env" },
  },
  {
    label: "DOTNS_KEY_URI is used when mnemonic is absent",
    env: { keyUri: ALICE_KEY_URI },
    expected: { source: ALICE_KEY_URI, isKeyUri: true, resolvedFrom: "env" },
  },
  {
    label: "DOTNS_MNEMONIC takes precedence over DOTNS_KEY_URI",
    env: { mnemonic: CUSTOM_MNEMONIC, keyUri: ALICE_KEY_URI },
    expected: { source: CUSTOM_MNEMONIC, isKeyUri: false, resolvedFrom: "env" },
  },
  {
    label: "empty DOTNS_MNEMONIC falls through to default",
    env: { mnemonic: "" },
    expected: { source: DEFAULT_MNEMONIC, isKeyUri: false, resolvedFrom: "default" },
  },
];

describe("resolveAuthSourceReadOnly honours environment variables", () => {
  test.each(envCases)("$label", async ({ env, expected }) => {
    clearAuthEnv();
    if (env.mnemonic !== undefined) process.env[ENV.MNEMONIC] = env.mnemonic;
    if (env.keyUri !== undefined) process.env[ENV.KEY_URI] = env.keyUri;

    const resolved = await resolveAuthSourceReadOnly();

    expect(resolved.source).toBe(expected.source);
    expect(resolved.isKeyUri).toBe(expected.isKeyUri);
    expect(resolved.resolvedFrom).toBe(expected.resolvedFrom);
  });
});
