import { afterAll, afterEach, expect, test } from "bun:test";
import { createDefaultAccountKeystore, runDotnsCli } from "../_helpers/cli-helpers";
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

const CONTENT_TEST_TIMEOUT_MS = 60_000;
const TEST_PASSWORD = "test-password";
const TEST_ACCOUNT = "default";

const REGISTERED_DOMAIN = "dotns";
const UNREGISTERED_DOMAIN = "unregistered123456789xyz";

const TEST_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

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

test(
  "content view shows domain content hash without auth",
  async () => {
    const viewResult = await runDotnsCli(["content", "view", REGISTERED_DOMAIN]);

    expect(viewResult.exitCode).toBe(0);
    expect(viewResult.combinedOutput).not.toContain("✗ Error:");
    expect(viewResult.combinedOutput).toContain("▶ Content View");
    expect(viewResult.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
    expect(viewResult.combinedOutput).toContain("contenthash:");
    expect(viewResult.combinedOutput).toContain("cid:");
    expect(viewResult.combinedOutput).toContain("✓ Complete");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content view shows registry information without auth",
  async () => {
    const viewResult = await runDotnsCli(["content", "view", REGISTERED_DOMAIN]);

    expect(viewResult.exitCode).toBe(0);
    expect(viewResult.combinedOutput).not.toContain("✗ Error:");
    expect(viewResult.combinedOutput).toContain("▶ Content View");
    expect(viewResult.combinedOutput).toContain("registry:");
    expect(viewResult.combinedOutput).toContain("exists:");
    expect(viewResult.combinedOutput).toContain("owner:");
    expect(viewResult.combinedOutput).toContain("resolver:");
    expect(viewResult.combinedOutput).toContain("✓ Complete");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content view handles unregistered domain without auth",
  async () => {
    const viewResult = await runDotnsCli(["content", "view", UNREGISTERED_DOMAIN]);

    expect(viewResult.exitCode).toBe(0);
    expect(viewResult.combinedOutput).toContain("▶ Content View");
    expect(viewResult.combinedOutput).toContain("exists:");
    expect(viewResult.combinedOutput).toContain("false");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set requires authentication",
  async () => {
    const setResult = await runDotnsCli(["content", "set", REGISTERED_DOMAIN, TEST_CID]);

    expect(setResult.exitCode).toBe(1);
    expect(setResult.combinedOutput).toContain("Error");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set works with keystore authentication",
  async () => {
    createPathsForTest("content_set_with_keystore");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const setResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "content",
        "set",
        REGISTERED_DOMAIN,
        TEST_CID,
        "--account",
        TEST_ACCOUNT,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expect(setResult.combinedOutput).toContain("▶ Content Set");
    expect(setResult.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set works with mnemonic flag",
  async () => {
    const setResult = await runDotnsCli([
      "--mnemonic",
      DEFAULT_MNEMONIC,
      "content",
      "set",
      REGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.combinedOutput).toContain("▶ Content Set");
    expect(setResult.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set works with key-uri flag",
  async () => {
    const setResult = await runDotnsCli([
      "--key-uri",
      "//Alice",
      "content",
      "set",
      REGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.combinedOutput).toContain("▶ Content Set");
    expect(setResult.combinedOutput).toContain(REGISTERED_DOMAIN + ".dot");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set rejects both mnemonic and key-uri",
  async () => {
    const setResult = await runDotnsCli([
      "--mnemonic",
      DEFAULT_MNEMONIC,
      "--key-uri",
      "//Alice",
      "content",
      "set",
      REGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.exitCode).toBe(1);
    expect(setResult.combinedOutput).toContain("Cannot specify both");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set shows ownership verification",
  async () => {
    const setResult = await runDotnsCli([
      "--key-uri",
      "//Alice",
      "content",
      "set",
      REGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.combinedOutput).toContain("exists:");
    expect(setResult.combinedOutput).toContain("owner:");
    expect(setResult.combinedOutput).toContain("caller:");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set handles non-owner rejection",
  async () => {
    const setResult = await runDotnsCli([
      "--key-uri",
      "//Bob",
      "content",
      "set",
      REGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.combinedOutput).toContain("You do not own this domain");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);

test(
  "content set handles unregistered domain",
  async () => {
    const setResult = await runDotnsCli([
      "--key-uri",
      "//Alice",
      "content",
      "set",
      UNREGISTERED_DOMAIN,
      TEST_CID,
    ]);

    expect(setResult.combinedOutput).toContain("Domain is not registered");
  },
  { timeout: CONTENT_TEST_TIMEOUT_MS },
);
