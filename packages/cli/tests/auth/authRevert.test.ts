import { afterAll, afterEach, expect, test } from "bun:test";
import { runDotnsCli } from "../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/testPaths";
import { DEFAULT_MNEMONIC } from "../../src/utils/constants";

const createdTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;

afterEach(() => {
  for (const temporaryDirectoryPath of createdTemporaryDirectoryPaths) {
    cleanupTestTemporaryDirectory(temporaryDirectoryPath);
  }
  createdTemporaryDirectoryPaths.length = 0;
});

afterAll(() => {
  if (testFileTemporaryRootDirectoryPath) {
    cleanupTestFileTemporaryDirectory(testFileTemporaryRootDirectoryPath);
    testFileTemporaryRootDirectoryPath = undefined;
  }
});

function createPathsForTest(testName: string) {
  const paths = createKeystorePathsForTest(testName);

  createdTemporaryDirectoryPaths.push(paths.testTemporaryDirectoryPath);

  if (!testFileTemporaryRootDirectoryPath) {
    testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;
  }

  return paths;
}

test("auth set rejects account name with forward slash", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_forward_slash");
  const keystorePassword = "test-password";
  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "test/account",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("path separators");
});

test("auth set rejects account name with backslash", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_backslash");
  const keystorePassword = "test-password";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "test\\account",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("path separators");
});

test("auth set rejects account name that is just a dot", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_single_dot");
  const keystorePassword = "test-password";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    ".",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("'.' or '..'");
});

test("auth set rejects account name that is double dots", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_double_dots");
  const keystorePassword = "test-password";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "..",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("'.' or '..'");
});

test("auth set rejects account name starting with dot", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_leading_dot");
  const keystorePassword = "test-password";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    ".hidden",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("start or end with a dot");
});

test("auth set rejects account name ending with dot", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_trailing_dot");
  const keystorePassword = "test-password";

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    "account.",
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("start or end with a dot");
});

test("auth set rejects account name with special characters", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_special_chars");
  const keystorePassword = "test-password";

  const invalidNames = [
    "test<account",
    "test>account",
    "test:account",
    'test"account',
    "test|account",
    "test?account",
    "test*account",
  ];

  for (const accountName of invalidNames) {
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
      DEFAULT_MNEMONIC,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.combinedOutput).toContain("special characters");
  }
});

test("auth set rejects account name that is too long", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_set_rejects_too_long");
  const keystorePassword = "test-password";
  const tooLongName = "a".repeat(256);

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    tooLongName,
    "--mnemonic",
    DEFAULT_MNEMONIC,
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("too long");
});

test("auth use rejects non-existent account", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_use_rejects_nonexistent");
  const keystorePassword = "test-password";

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
    DEFAULT_MNEMONIC,
  ]);

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "use",
    "nonexistent",
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("Account not found");
});

test("auth remove rejects non-existent account", async () => {
  const { keystoreDirectoryPath } = createPathsForTest("auth_remove_rejects_nonexistent");
  const keystorePassword = "test-password";

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
    DEFAULT_MNEMONIC,
  ]);

  const result = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "remove",
    "nonexistent",
  ]);

  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("Account not found");
});
