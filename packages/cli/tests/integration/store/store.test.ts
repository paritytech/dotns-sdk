import { beforeAll, expect, test } from "bun:test";
import {
  ALICE_KEY_URI,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  TEST_TIMEOUT_MS,
} from "../../_helpers/cliHelpers";

const CLAIM_TIMEOUT_MS = 3 * 60_000;

// The User Store is owner-bound and must be claimed once before values can be
// written. Self-provision it for Alice so the suite never depends on prior
// on-chain state.
beforeAll(async () => {
  const result = await runDotnsCli(["store", "claim", "--key-uri", ALICE_KEY_URI]);
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
}, CLAIM_TIMEOUT_MS);

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
  "store claim is idempotent once the store exists",
  async () => {
    const result = await runDotnsCli(["store", "claim", "--key-uri", ALICE_KEY_URI, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.storeAddress).toBeString();
    expect(parsed.alreadyClaimed).toBe(true);
    expect(parsed.tx).toBeNull();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "store list returns structured values",
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
