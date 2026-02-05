import { afterAll, afterEach, expect, test } from "bun:test";
import {
  createDefaultAccountKeystore,
  runDotnsCli,
  type CliRunResult,
} from "../_helpers/cli-helpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/test-paths";
import { DEFAULT_MNEMONIC } from "../../src/utils/constants";

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

function expectSuccessfulLookup(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).not.toContain("EISDIR:");
  expect(result.combinedOutput).toContain(label + ".dot");
}

function expectSuccessfulOwnerLookup(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).not.toContain("EISDIR:");
  expect(result.combinedOutput).toContain("Ownership lookup");
  expect(result.combinedOutput).toContain(label + ".dot");
  expect(result.combinedOutput).toContain("Registered:");
  expect(result.combinedOutput).toContain("Owner (EVM):");
}

const LOOKUP_TEST_TIMEOUT_MS = 60_000;
const TEST_PASSWORD = "test-password";
const TEST_ACCOUNT = "default";

const REGISTERED_DOMAIN = "dotns";
const REGISTERED_DOMAIN_WITH_POP = "sphaman12";
const REGISTERED_TLD = "iwwfy3goc96";

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return { keystorePassword: TEST_PASSWORD, keystoreDirectoryPath: testFileKeystoreDirectoryPath };
}

test(
  "lookup comprehensive domain information without auth",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "name", REGISTERED_DOMAIN]);

    expectSuccessfulLookup(lookupResult, REGISTERED_DOMAIN);
    expect(lookupResult.combinedOutput).toContain("Registry");
    expect(lookupResult.combinedOutput).toContain("exists:");
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "lookup using --name flag without auth",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "--name", REGISTERED_TLD]);

    expectSuccessfulLookup(lookupResult, REGISTERED_TLD);
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "lookup owner-of shows ownership information without auth",
  async () => {
    const ownerOfResult = await runDotnsCli(["lookup", "owner-of", REGISTERED_DOMAIN]);

    expectSuccessfulOwnerLookup(ownerOfResult, REGISTERED_DOMAIN);
    expect(ownerOfResult.combinedOutput).not.toContain(
      "0x0000000000000000000000000000000000000000",
    );
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "lookup oo alias shows ownership information without auth",
  async () => {
    const ooResult = await runDotnsCli(["lookup", "oo", REGISTERED_DOMAIN_WITH_POP]);

    expectSuccessfulOwnerLookup(ooResult, REGISTERED_DOMAIN_WITH_POP);
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "lookup handles unregistered domain without auth",
  async () => {
    const unregisteredLabel = "unregistered123456789xyz";

    const lookupResult = await runDotnsCli(["lookup", "owner-of", unregisteredLabel]);

    expect(lookupResult.exitCode).toBe(1);
    expect(lookupResult.combinedOutput).toContain("Registered:");
    expect(lookupResult.combinedOutput).toContain("false");
    expect(lookupResult.combinedOutput).toContain("(none)");
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "lookup reserved domain shows reserved status",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "name", REGISTERED_DOMAIN]);

    expectSuccessfulLookup(lookupResult, REGISTERED_DOMAIN);
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "list command requires authentication",
  async () => {
    createPathsForTest("list_with_auth");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const listResult = await runDotnsCli(
      ["--password", keystorePassword, "list", "--account", TEST_ACCOUNT],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expect(listResult.exitCode).toBe(1);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "list command works with mnemonic flag",
  async () => {
    const listResult = await runDotnsCli(["--mnemonic", DEFAULT_MNEMONIC, "list"]);

    expect(listResult.exitCode).toBe(1);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);

test(
  "list command works with key-uri flag",
  async () => {
    const listResult = await runDotnsCli(["--key-uri", "//Alice", "list"]);

    expect(listResult.exitCode).toBe(1);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: LOOKUP_TEST_TIMEOUT_MS },
);
