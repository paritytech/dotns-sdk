import { expect, test } from "bun:test";
import {
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  ALICE_SS58,
  ALICE_EVM,
  TEST_TIMEOUT_MS,
  runDotnsCli,
} from "../../_helpers/cliHelpers";

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
  "account grant reads a name's grant record",
  async () => {
    const result = await runDotnsCli([
      "account",
      "grant",
      "getsomecash",
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("Error:");
    expect(result.combinedOutput).toContain("status:");
    expect(result.combinedOutput).toContain("grantee:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account grant with an owner address answers the registerReserved gate",
  async () => {
    const result = await runDotnsCli([
      "account",
      "grant",
      "getsomecash",
      ALICE_EVM,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(parsed.label).toBeString();
    expect(parsed.status).toBeString();
    expect(typeof parsed.grantedTo).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "account grant resolves an SS58 owner address",
  async () => {
    const result = await runDotnsCli([
      "account",
      "grant",
      "getsomecash",
      ALICE_SS58,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(typeof parsed.grantedTo).toBe("boolean");
  },
  { timeout: TEST_TIMEOUT_MS },
);
