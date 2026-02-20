import { afterAll, afterEach, expect, test } from "bun:test";
import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  TEST_ACCOUNT,
  TEST_PASSWORD,
  TEST_TIMEOUT_MS,
  type CliRunResult,
} from "../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/testPaths";
import { DEFAULT_MNEMONIC } from "../../src/utils/constants";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let testFileKeystoreDirectoryPath: string | undefined;

const REGISTERED_DOMAIN = "dotnscli";
const UNREGISTERED_DOMAIN = "unregistered123456789xyz";
const TEST_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

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

function runContentView(domain: string) {
  return runDotnsCli(["content", "view", domain]);
}

function runContentSet(
  authArgs: string[],
  domain: string,
  cid: string,
  env?: Record<string, string>,
) {
  return runDotnsCli(["content", ...authArgs, "set", domain, cid], env);
}

function expectSuccessfulView(result: CliRunResult) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Content View");
  expect(result.combinedOutput).toContain("✓ Complete");
}

function expectContentSetHeader(result: CliRunResult, domain: string) {
  expect(result.combinedOutput).toContain("▶ Content Set");
  expect(result.combinedOutput).toContain(domain + ".dot");
}

test(
  "content view shows registry and content hash for registered domain",
  async () => {
    const result = await runContentView(REGISTERED_DOMAIN);

    expectSuccessfulView(result);
    expect(result.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
    expect(result.combinedOutput).toContain("registry:");
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("owner:");
    expect(result.combinedOutput).toContain("resolver:");
    expect(result.combinedOutput).toContain("contenthash:");
    expect(result.combinedOutput).toContain("cid:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content view reports unregistered domain",
  async () => {
    const result = await runContentView(UNREGISTERED_DOMAIN);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("▶ Content View");
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("false");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set requires authentication",
  async () => {
    const { testTemporaryDirectoryPath } = createPathsForTest("content_set_requires_auth");

    const result = await runDotnsCli(
      ["content", "--password", TEST_PASSWORD, "set", REGISTERED_DOMAIN, TEST_CID],
      { DOTNS_KEYSTORE_PATH: testTemporaryDirectoryPath },
    );

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("Error");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set works with keystore authentication",
  async () => {
    createPathsForTest("content_set_with_keystore");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const result = await runDotnsCli(
      [
        "content",
        "--password",
        keystorePassword,
        "--account",
        TEST_ACCOUNT,
        "set",
        REGISTERED_DOMAIN,
        TEST_CID,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectContentSetHeader(result, REGISTERED_DOMAIN);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set works with mnemonic flag",
  async () => {
    const result = await runContentSet(
      ["--mnemonic", DEFAULT_MNEMONIC],
      REGISTERED_DOMAIN,
      TEST_CID,
    );

    expectContentSetHeader(result, REGISTERED_DOMAIN);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set with key-uri shows ownership verification",
  async () => {
    const result = await runContentSet(["--key-uri", "//Alice"], REGISTERED_DOMAIN, TEST_CID);

    expectContentSetHeader(result, REGISTERED_DOMAIN);
    expect(result.combinedOutput).toContain("exists:");
    expect(result.combinedOutput).toContain("owner:");
    expect(result.combinedOutput).toContain("caller:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set rejects both mnemonic and key-uri",
  async () => {
    const result = await runContentSet(
      ["--mnemonic", DEFAULT_MNEMONIC, "--key-uri", "//Alice"],
      REGISTERED_DOMAIN,
      TEST_CID,
    );

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("Cannot specify both");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set rejects non-owner",
  async () => {
    const result = await runContentSet(["--key-uri", "//Bob"], REGISTERED_DOMAIN, TEST_CID);

    expect(result.combinedOutput).toContain("You do not own this domain");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "content set rejects unregistered domain",
  async () => {
    const result = await runContentSet(["--key-uri", "//Alice"], UNREGISTERED_DOMAIN, TEST_CID);

    expect(result.combinedOutput).toContain("is not registered");
  },
  { timeout: TEST_TIMEOUT_MS },
);
