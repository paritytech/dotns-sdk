import { expect, test } from "bun:test";
import {
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  TEST_TIMEOUT_MS,
  runDotnsCli,
} from "../../_helpers/cliHelpers";

const ALICE_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const ALICE_EVM = "0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac";

test(
  "account is-mapped with Alice SS58 returns mapped status",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-mapped",
      ALICE_SS58,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Error:");
    expect(result.combinedOutput).toContain("mapped:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is-mapped --json returns structured result",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-mapped",
      ALICE_SS58,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Connecting");
    expect(result.combinedOutput).not.toContain("Resolving");

    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(parsed.address).toBeString();
    expect(parsed.evmAddress).toBeString();
    expect(typeof parsed.isMapped).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is alias works for is-mapped",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is",
      ALICE_SS58,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(typeof parsed.isMapped).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is-mapped with EVM address returns mapped status",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-mapped",
      ALICE_EVM,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Error:");
    expect(result.combinedOutput).toContain("mapped:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is-whitelisted with SS58 address returns whitelist status",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-whitelisted",
      ALICE_SS58,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Error:");
    expect(result.combinedOutput).toContain("whitelisted:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is-whitelisted with EVM address returns whitelist status",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-whitelisted",
      ALICE_EVM,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Error:");
    expect(result.combinedOutput).toContain("whitelisted:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account is-whitelisted --json returns structured result",
  async () => {
    const result = await runDotnsCli([
      "account",
      "is-whitelisted",
      ALICE_EVM,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Connecting");

    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(parsed.address).toBeString();
    expect(parsed.evmAddress).toBeString();
    expect(typeof parsed.isWhitelisted).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account iw alias works for is-whitelisted",
  async () => {
    const result = await runDotnsCli([
      "account",
      "iw",
      ALICE_EVM,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(typeof parsed.isWhitelisted).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);
