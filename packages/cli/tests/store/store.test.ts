import { expect, test } from "bun:test";
import { HARNESS_SUCCESS_EXIT_CODE, runDotnsCli, TEST_TIMEOUT_MS } from "../_helpers/cliHelpers";

const ALICE_KEY_URI = "//Alice";
const BOB_ADDRESS = "0x0000000000000000000000000000000000000001";

test(
  "store info shows store status",
  async () => {
    const result = await runDotnsCli(["store", "info", "--key-uri", ALICE_KEY_URI]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("✗ Error:");
    expect(result.combinedOutput).toContain("Store Info");
    expect(result.combinedOutput).toContain("factory:");
    expect(result.combinedOutput).toContain("owner:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store info --json returns structured result",
  async () => {
    const result = await runDotnsCli(["store", "info", "--key-uri", ALICE_KEY_URI, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("▶");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.owner).toBeString();
    expect(parsed.exists).toBeBoolean();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store list shows values",
  async () => {
    const result = await runDotnsCli(["store", "list", "--key-uri", ALICE_KEY_URI]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("✗ Error:");
    expect(result.combinedOutput).toContain("Store Values");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store list --json returns structured result",
  async () => {
    const result = await runDotnsCli(["store", "list", "--key-uri", ALICE_KEY_URI, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("▶");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.values).toBeArray();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store check shows authorization status",
  async () => {
    const result = await runDotnsCli(["store", "check", BOB_ADDRESS, "--key-uri", ALICE_KEY_URI]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("✗ Error:");
    expect(result.combinedOutput).toContain("Authorization Status");
    expect(result.combinedOutput).toContain("authorized:");
    expect(result.combinedOutput).toContain("controller:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store check --json returns structured result ",
  async () => {
    const result = await runDotnsCli([
      "store",
      "check",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("▶");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.address).toBeString();
    expect(parsed.isAuthorized).toBeBoolean();
    expect(parsed.isDotnsController).toBeBoolean();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store authorize and unauthorize round-trip",
  async () => {
    const authorizeResult = await runDotnsCli([
      "store",
      "authorize",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(authorizeResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(authorizeResult.combinedOutput).not.toContain("✗ Error:");

    const checkAfterAuth = await runDotnsCli([
      "store",
      "check",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const authStatus = JSON.parse(checkAfterAuth.combinedOutput.trim());
    expect(authStatus.isAuthorized).toBe(true);

    const unauthorizeResult = await runDotnsCli([
      "store",
      "unauthorize",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(unauthorizeResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(unauthorizeResult.combinedOutput).not.toContain("✗ Error:");

    const checkAfterRevoke = await runDotnsCli([
      "store",
      "check",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const revokedStatus = JSON.parse(checkAfterRevoke.combinedOutput.trim());
    expect(revokedStatus.isAuthorized).toBe(false);
  },
  { timeout: TEST_TIMEOUT_MS * 3 },
);

test(
  "store authorize-controller and unauthorize-controller round-trip",
  async () => {
    const authorizeResult = await runDotnsCli([
      "store",
      "authorize-controller",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(authorizeResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(authorizeResult.combinedOutput).not.toContain("✗ Error:");

    const checkAfterAuth = await runDotnsCli([
      "store",
      "check",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const authStatus = JSON.parse(checkAfterAuth.combinedOutput.trim());
    expect(authStatus.isDotnsController).toBe(true);

    const unauthorizeResult = await runDotnsCli([
      "store",
      "unauthorize-controller",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(unauthorizeResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(unauthorizeResult.combinedOutput).not.toContain("✗ Error:");

    const checkAfterRevoke = await runDotnsCli([
      "store",
      "check",
      BOB_ADDRESS,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const revokedStatus = JSON.parse(checkAfterRevoke.combinedOutput.trim());
    expect(revokedStatus.isDotnsController).toBe(false);
  },
  { timeout: TEST_TIMEOUT_MS * 3 },
);

test(
  "store set, get, and delete round-trip",
  async () => {
    const testKey = "test.mykey";
    const testValue = "hello-from-cli";

    const setResult = await runDotnsCli([
      "store",
      "set",
      testKey,
      testValue,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(setResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(setResult.combinedOutput).not.toContain("✗ Error:");

    const getResult = await runDotnsCli([
      "store",
      "get",
      testKey,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const getValue = JSON.parse(getResult.combinedOutput.trim());
    expect(getValue.value).toBe(testValue);
    expect(getValue.exists).toBe(true);

    const deleteResult = await runDotnsCli([
      "store",
      "delete",
      testKey,
      "--key-uri",
      ALICE_KEY_URI,
    ]);

    expect(deleteResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(deleteResult.combinedOutput).not.toContain("✗ Error:");

    const getAfterDelete = await runDotnsCli([
      "store",
      "get",
      testKey,
      "--key-uri",
      ALICE_KEY_URI,
      "--json",
    ]);

    const deletedValue = JSON.parse(getAfterDelete.combinedOutput.trim());
    expect(deletedValue.exists).toBe(false);
    expect(deletedValue.value).toBe("");
  },
  { timeout: TEST_TIMEOUT_MS * 3 },
);
