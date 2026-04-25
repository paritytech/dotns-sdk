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
import {
  deriveSubstrateAddress,
  fundAccountFromAlice,
  generateFreshMnemonic,
} from "../../_helpers/fundAccount";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let testFileKeystoreDirectoryPath: string | undefined;

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

function expectSuccessfulPopSet(result: CliRunResult) {
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("✓ PoP Status Updated");
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
}

function expectSuccessfulInfo(result: CliRunResult) {
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("ProofOfPersonhood Status");
  expect(result.combinedOutput).toContain("substrate:");
  expect(result.combinedOutput).toContain("evm:");
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
}

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return { keystorePassword: TEST_PASSWORD, keystoreDirectoryPath: testFileKeystoreDirectoryPath };
}

test(
  "pop set lite with keystore at pop level",
  async () => {
    createPathsForTest("pop_set_lite_pop_level");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      ["pop", "--password", keystorePassword, "--account", TEST_ACCOUNT, "set", "lite"],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set full with keystore at set level",
  async () => {
    createPathsForTest("pop_set_full_set_level");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      ["pop", "set", "full", "--password", keystorePassword, "--account", TEST_ACCOUNT],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set lite with mnemonic flag",
  async () => {
    const result = await runDotnsCli(["pop", "--mnemonic", DEFAULT_MNEMONIC, "set", "lite"]);

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set full with mnemonic flag at set level",
  async () => {
    const result = await runDotnsCli(["pop", "set", "full", "--mnemonic", DEFAULT_MNEMONIC]);

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set lite with key-uri flag",
  async () => {
    const result = await runDotnsCli(["pop", "--key-uri", ALICE_KEY_URI, "set", "lite"]);

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop info with keystore at pop level",
  async () => {
    createPathsForTest("pop_info_pop_level");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      ["pop", "--password", keystorePassword, "--account", TEST_ACCOUNT, "info"],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulInfo(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop info with keystore at info level",
  async () => {
    createPathsForTest("pop_info_info_level");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      ["pop", "info", "--password", keystorePassword, "--account", TEST_ACCOUNT],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulInfo(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop info with mnemonic flag",
  async () => {
    const result = await runDotnsCli(["pop", "--mnemonic", DEFAULT_MNEMONIC, "info"]);

    expectSuccessfulInfo(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop info with key-uri flag at pop level",
  async () => {
    const result = await runDotnsCli(["pop", "--key-uri", ALICE_KEY_URI, "info"]);

    expectSuccessfulInfo(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set fails without status argument",
  async () => {
    const result = await runDotnsCli(["pop", "--mnemonic", DEFAULT_MNEMONIC, "set"]);

    expect(result.exitCode).toBe(1);
    expect(result.combinedOutput).toContain("error:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set fails with invalid status",
  async () => {
    const result = await runDotnsCli(["pop", "--mnemonic", DEFAULT_MNEMONIC, "set", "invalid"]);

    expect(result.exitCode).toBe(1);
    expect(result.combinedOutput).toContain("Error:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop set with mixed option levels",
  async () => {
    createPathsForTest("pop_set_mixed");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      ["pop", "--password", keystorePassword, "set", "lite", "--account", TEST_ACCOUNT],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulPopSet(result);
  },
  { timeout: TEST_TIMEOUT_MS },
);

// --json tests

test(
  "pop info --json returns structured result",
  async () => {
    const result = await runDotnsCli(["pop", "--key-uri", ALICE_KEY_URI, "info", "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("📋");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.substrate).toBeString();
    expect(parsed.evm).toBeString();
    expect(parsed.status).toBeString();
    expect(parsed.statusCode).toBeNumber();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "pop info auto-maps a fresh, funded mnemonic and returns statusCode 0",
  async () => {
    const freshMnemonic = await generateFreshMnemonic();
    const freshSubstrateAddress = await deriveSubstrateAddress(freshMnemonic);

    await fundAccountFromAlice(freshSubstrateAddress);

    const result = await runDotnsCli(["pop", "info", "--mnemonic", freshMnemonic, "--json"]);

    expect(result.combinedOutput).not.toContain("Contract reverted");
    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = JSON.parse(result.combinedOutput.trim());
    expect(parsed.substrate).toBe(freshSubstrateAddress);
    expect(parsed.evm).toBeString();
    expect(parsed.statusCode).toBe(0);
    expect(parsed.status).toBe("nostatus");
  },
  { timeout: TEST_TIMEOUT_MS * 2 },
);

test(
  "pop set --json returns structured result",
  async () => {
    const result = await runDotnsCli(["pop", "--key-uri", ALICE_KEY_URI, "set", "lite", "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("✓ PoP Status Updated");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBeString();
    expect(parsed.statusCode).toBeNumber();
  },
  { timeout: TEST_TIMEOUT_MS },
);
