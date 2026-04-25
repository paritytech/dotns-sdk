import { afterAll, afterEach, expect, test } from "bun:test";
import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  runDotnsCli,
  TEST_ACCOUNT,
  TEST_PASSWORD,
  TEST_TIMEOUT_MS,
  type CliRunResult,
} from "../../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../../_helpers/testPaths";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let testFileKeystoreDirectoryPath: string | undefined;

const REGISTERED_DOMAIN = "dotnscli";
const UNREGISTERED_DOMAIN = "unregistered123456789xyz";
const TEST_KEY = "test-text-key";
const TEST_VALUE = "test-text-value";

function createPathsForTest(testName: string) {
  const paths = createKeystorePathsForTest(testName);
  createdTestTemporaryDirectoryPaths.push(paths.testTemporaryDirectoryPath);

  if (!testFileTemporaryRootDirectoryPath) {
    testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;
  }
  if (!testFileKeystoreDirectoryPath) {
    testFileKeystoreDirectoryPath = paths.testFileKeystoreDirectoryPath;
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
    testFileKeystoreDirectoryPath = undefined;
  }
});

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) {
    throw new Error("Missing test file keystore directory path");
  }

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return {
    keystorePassword: TEST_PASSWORD,
    keystoreDirectoryPath: testFileKeystoreDirectoryPath,
  };
}

function runTextView(domain: string, key: string) {
  return runDotnsCli(["text", "view", domain, key]);
}

function runTextSet(
  authArgs: string[],
  domain: string,
  key: string,
  value: string,
  env?: Record<string, string>,
) {
  return runDotnsCli(["text", ...authArgs, "set", domain, key, value], env);
}

function expectSuccessfulView(result: CliRunResult) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Text View");
  expect(result.combinedOutput).toContain("✓ Complete");
}

function expectTextSetHeader(result: CliRunResult, domain: string) {
  expect(result.combinedOutput).toContain("▶ Text Set");
  expect(result.combinedOutput).toContain(domain + ".dot");
}

test(
  "text view shows registry and text record for registered domain",
  async () => {
    const result = await runTextView(REGISTERED_DOMAIN, TEST_KEY);

    expectSuccessfulView(result);
    expect(result.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
    expect(result.combinedOutput).toContain("registry:");
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("owner:");
    expect(result.combinedOutput).toContain("resolver:");
    expect(result.combinedOutput).toContain("key:");
    expect(result.combinedOutput).toContain("value:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text view reports unregistered domain",
  async () => {
    const result = await runTextView(UNREGISTERED_DOMAIN, TEST_KEY);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("▶ Text View");
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("false");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set requires authentication",
  async () => {
    const { testTemporaryDirectoryPath } = createPathsForTest("text_set_requires_auth");

    const result = await runDotnsCli(
      ["text", "--password", TEST_PASSWORD, "set", REGISTERED_DOMAIN, TEST_KEY, TEST_VALUE],
      { DOTNS_KEYSTORE_PATH: testTemporaryDirectoryPath },
    );

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("Error");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set works with keystore authentication",
  async () => {
    createPathsForTest("text_set_with_keystore");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      [
        "text",
        "--password",
        keystorePassword,
        "--account",
        TEST_ACCOUNT,
        "set",
        REGISTERED_DOMAIN,
        TEST_KEY,
        TEST_VALUE,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectTextSetHeader(result, REGISTERED_DOMAIN);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set works with mnemonic flag",
  async () => {
    const result = await runTextSet(
      ["--mnemonic", DEFAULT_MNEMONIC],
      REGISTERED_DOMAIN,
      TEST_KEY,
      TEST_VALUE,
    );

    expectTextSetHeader(result, REGISTERED_DOMAIN);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set with key-uri shows ownership verification",
  async () => {
    const result = await runTextSet(
      ["--key-uri", ALICE_KEY_URI],
      REGISTERED_DOMAIN,
      TEST_KEY,
      TEST_VALUE,
    );

    expectTextSetHeader(result, REGISTERED_DOMAIN);
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("owner:");
    expect(result.combinedOutput).toContain("caller:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set rejects both mnemonic and key-uri",
  async () => {
    const result = await runTextSet(
      ["--mnemonic", DEFAULT_MNEMONIC, "--key-uri", ALICE_KEY_URI],
      REGISTERED_DOMAIN,
      TEST_KEY,
      TEST_VALUE,
    );

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("Cannot specify both");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set rejects non-owner",
  async () => {
    const result = await runTextSet(
      ["--key-uri", "//Bob"],
      REGISTERED_DOMAIN,
      TEST_KEY,
      TEST_VALUE,
    );

    expect(result.combinedOutput).toContain("You do not own this domain");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "text set rejects unregistered domain",
  async () => {
    const result = await runTextSet(
      ["--key-uri", ALICE_KEY_URI],
      UNREGISTERED_DOMAIN,
      TEST_KEY,
      TEST_VALUE,
    );

    expect(result.combinedOutput).toContain("is not registered");
  },
  { timeout: TEST_TIMEOUT_MS },
);
