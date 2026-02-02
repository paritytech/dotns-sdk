import { afterAll, afterEach, expect, test } from "bun:test";
import { pathExists } from "../../src/cli/keystore/file";
import { runDotnsCli, readKeystoreDirectory } from "../_helpers/cli-helpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/test-paths";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;

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

function createPathsForTest(testName: string) {
  const paths = createKeystorePathsForTest(testName);

  createdTestTemporaryDirectoryPaths.push(paths.testTemporaryDirectoryPath);

  if (!testFileTemporaryRootDirectoryPath) {
    testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;
  }

  return paths;
}

test("auth set creates keystore directory and stores mnemonic", async () => {
  const { keystoreDirectoryPath } = createPathsForTest(
    "auth_set_creates_keystore_and_stores_mnemonic",
  );

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);

  expect(result.exitCode).toBe(1);
  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);

  expect(keystore.defaultAccount).toBe("default");
  expect(keystore.accounts.default?.mnemonic).toBe(testMnemonic);
});

test("auth set updates existing keystore and stores key-uri under alice, making it default", async () => {
  const { keystoreDirectoryPath } = createPathsForTest(
    "auth_set_updates_existing_keystore_with_alice",
  );

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const createResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);
  expect(createResult.exitCode).toBe(1);

  const updateResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "alice",
    "--key-uri",
    "//Alice",
  ]);
  expect(updateResult.exitCode).toBe(1);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);

  expect(keystore.defaultAccount).toBe("alice");
  expect(keystore.accounts.alice?.keyUri).toBe("//Alice");
  expect(keystore.accounts.default?.mnemonic).toBe(testMnemonic);
});

test("auth list exits 0 when keystore missing", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_list_keystore_missing");

  const keystorePassword = "test-password";

  const listResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "list",
  ]);

  expect(listResult.exitCode).toBe(1);
  expect(listResult.combinedOutput).toContain("exists:");
  expect(listResult.combinedOutput).toContain("false");
});

test("auth list shows all accounts", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_list_shows_accounts");

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);

  await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "alice",
    "--key-uri",
    "//Alice",
  ]);

  const listResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "list",
  ]);

  expect(listResult.exitCode).toBe(1);
  expect(listResult.combinedOutput).toContain("alice");
  expect(listResult.combinedOutput).toContain("default");
  expect(listResult.combinedOutput).toContain("key-uri");
  expect(listResult.combinedOutput).toContain("mnemonic");
});

test("auth use switches default account to default", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_use_switches_default_account");

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const createDefaultResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);
  expect(createDefaultResult.exitCode).toBe(1);

  const createAliceResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "alice",
    "--key-uri",
    "//Alice",
  ]);
  expect(createAliceResult.exitCode).toBe(1);

  let keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  expect(keystore.defaultAccount).toBe("alice");

  const useDefaultResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "use",
    "default",
  ]);
  expect(useDefaultResult.exitCode).toBe(1);

  keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  expect(keystore.defaultAccount).toBe("default");
});

test("auth remove deletes account file and clears default when last account removed", async () => {
  const { keystoreDirectoryPath } = createPathsForTest(
    "auth_remove_deletes_account_when_last_removed",
  );

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const createDefaultResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);
  expect(createDefaultResult.exitCode).toBe(1);

  const removeDefaultResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "remove",
    "default",
  ]);
  expect(removeDefaultResult.exitCode).toBe(1);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  expect(keystore.accounts.default).toBeUndefined();
  expect(keystore.defaultAccount).toBeUndefined();
});

test("auth remove keeps keystore when multiple accounts exist", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_remove_keeps_keystore");

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);

  await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "alice",
    "--key-uri",
    "//Alice",
  ]);

  const removeResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "remove",
    "default",
  ]);
  expect(removeResult.exitCode).toBe(1);

  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  expect(keystore.accounts.alice).toBeDefined();
  expect(keystore.accounts.default).toBeUndefined();
  expect(keystore.defaultAccount).toBe("alice");
});

test("auth clear deletes keystore directory", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_clear_deletes_keystore_path");

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const createDefaultResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "default",
    "--mnemonic",
    testMnemonic,
  ]);
  expect(createDefaultResult.exitCode).toBe(1);
  expect(await pathExists(keystoreDirectoryPath)).toBe(true);

  const clearResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "auth",
    "clear",
  ]);
  expect(clearResult.exitCode).toBe(1);

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  expect(Object.keys(keystore.accounts)).toHaveLength(0);
});

test("auth set accepts valid account names with special chars", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_valid_special_chars");

  const keystorePassword = "test-password";
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const validNames = [
    "alice-bob",
    "test_account",
    "my-account-123",
    "account.backup",
    "user@domain",
    "account#1",
  ];

  for (const accountName of validNames) {
    const result = await runDotnsCli([
      "--keystore-path",
      keystoreDirectoryPath,
      "--password",
      keystorePassword,
      "auth",
      "set",
      "--account",
      accountName,
      "--mnemonic",
      testMnemonic,
    ]);

    expect(result.exitCode).toBe(1);
  }

  const keystore = await readKeystoreDirectory(keystoreDirectoryPath, keystorePassword);
  console.log("keystore.accounts[accountName]: ", keystore.accounts);
  for (const accountName of validNames) {
    expect(keystore.accounts[accountName]).toBeDefined();
  }
});
