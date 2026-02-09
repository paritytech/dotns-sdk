import { afterAll, afterEach, expect, test } from "bun:test";
import { pathExists } from "../../src/cli/keystore/file";
import {
  runDotnsCli,
  readKeystoreDirectory,
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  TEST_PASSWORD,
} from "../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/testPaths";
import { DEFAULT_MNEMONIC } from "../../src/utils/constants";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;

function createPathsForTest(testName: string) {
  const paths = createKeystorePathsForTest(testName);
  createdTestTemporaryDirectoryPaths.push(paths.testTemporaryDirectoryPath);

  if (!testFileTemporaryRootDirectoryPath) {
    testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;
  }

  return paths;
}

afterEach(() => {
  for (const testTemporaryDirectoryPath of createdTestTemporaryDirectoryPaths) {
    cleanupTestTemporaryDirectory(testTemporaryDirectoryPath);
  }
  createdTestTemporaryDirectoryPaths.length = 0;
});

afterAll(() => {
  if (testFileTemporaryRootDirectoryPath) {
    cleanupTestFileTemporaryDirectory(testFileTemporaryRootDirectoryPath);
    testFileTemporaryRootDirectoryPath = undefined;
  }
});

function runAuthSet(keystoreDirectoryPath: string, account: string, authArgs: string[]) {
  return runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    TEST_PASSWORD,
    "auth",
    "set",
    "--account",
    account,
    ...authArgs,
  ]);
}

function runAuthList(keystoreDirectoryPath: string) {
  return runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    TEST_PASSWORD,
    "auth",
    "list",
  ]);
}

function runAuthUse(keystoreDirectoryPath: string, account: string) {
  return runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    TEST_PASSWORD,
    "auth",
    "use",
    account,
  ]);
}

function runAuthRemove(keystoreDirectoryPath: string, account: string) {
  return runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    TEST_PASSWORD,
    "auth",
    "remove",
    account,
  ]);
}

function runAuthClear(keystoreDirectoryPath: string) {
  return runDotnsCli(["--keystore-path", keystoreDirectoryPath, "auth", "clear"]);
}

async function setupDefaultAccount(keystoreDirectoryPath: string) {
  const result = await runAuthSet(keystoreDirectoryPath, "default", [
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  return result;
}

async function setupDefaultAndAliceAccounts(keystoreDirectoryPath: string) {
  await setupDefaultAccount(keystoreDirectoryPath);
  const result = await runAuthSet(keystoreDirectoryPath, "alice", ["--key-uri", ALICE_KEY_URI]);
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  return result;
}

test("auth set creates keystore and stores multiple accounts", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_multiple_accounts");

  await setupDefaultAndAliceAccounts(keystoreDirectoryPath);

  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(keystore.accounts.default?.mnemonic).toBe(DEFAULT_MNEMONIC);
  expect(keystore.accounts.alice?.keyUri).toBe(ALICE_KEY_URI);
  expect(keystore.defaultAccount).toBe("alice");
});

test("auth set accepts account names with special characters", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_special_chars");

  const validNames = ["alice-bob", "test_account", "my-account-123"];

  for (const accountName of validNames) {
    const result = await runAuthSet(keystoreDirectoryPath, accountName, [
      "--mnemonic",
      DEFAULT_MNEMONIC,
    ]);
    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  }

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  for (const accountName of validNames) {
    expect(keystore.accounts[accountName]).toBeDefined();
  }
});

test("auth list reports missing keystore", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_list_missing_keystore");

  const result = await runAuthList(keystoreDirectoryPath);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("exists:");
  expect(result.combinedOutput).toContain("false");
});

test("auth list shows all accounts and auth types", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_list_shows_accounts");

  await setupDefaultAndAliceAccounts(keystoreDirectoryPath);

  const result = await runAuthList(keystoreDirectoryPath);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("alice");
  expect(result.combinedOutput).toContain("default");
  expect(result.combinedOutput).toContain("key-uri");
  expect(result.combinedOutput).toContain("mnemonic");
});

test("auth use switches default account", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_use_switches_default");

  await setupDefaultAndAliceAccounts(keystoreDirectoryPath);

  let keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(keystore.defaultAccount).toBe("alice");

  const result = await runAuthUse(keystoreDirectoryPath, "default");
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(keystore.defaultAccount).toBe("default");
});

test("auth remove last account clears default", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_remove_last_account");

  await setupDefaultAccount(keystoreDirectoryPath);

  const result = await runAuthRemove(keystoreDirectoryPath, "default");
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(keystore.accounts.default).toBeUndefined();
  expect(keystore.defaultAccount).toBeUndefined();
});

test("auth remove preserves remaining accounts and reassigns default", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_remove_preserves_remaining");

  await setupDefaultAndAliceAccounts(keystoreDirectoryPath);

  const result = await runAuthRemove(keystoreDirectoryPath, "default");
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(keystore.accounts.alice).toBeDefined();
  expect(keystore.accounts.default).toBeUndefined();
  expect(keystore.defaultAccount).toBe("alice");
});

test("auth clear deletes all accounts", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_clear_deletes_all");

  await setupDefaultAccount(keystoreDirectoryPath);
  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const result = await runAuthClear(keystoreDirectoryPath);
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, TEST_PASSWORD);
  expect(Object.keys(keystore.accounts)).toHaveLength(0);
});
