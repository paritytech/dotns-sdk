import { afterAll, afterEach, expect, test } from "bun:test";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import { generateRandomLabel } from "../../../src/cli/labels";
import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  TEST_PASSWORD,
  TEST_ACCOUNT,
  BOB_EVM_ADDRESS,
  runDotnsCli,
  type CliRunResult,
} from "../../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../../_helpers/testPaths";

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

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");
  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);
  return testFileKeystoreDirectoryPath;
}

function registerDomain(keystoreDirectoryPath: string, args: string[]): Promise<CliRunResult> {
  return runDotnsCli(["register", "domain", "--account", TEST_ACCOUNT, ...args], {
    DOTNS_KEYSTORE_PATH: keystoreDirectoryPath,
    DOTNS_KEYSTORE_PASSWORD: TEST_PASSWORD,
  });
}

function delegateCli(keystoreDirectoryPath: string, args: string[]): Promise<CliRunResult> {
  return runDotnsCli(["delegate", ...args, "--account", TEST_ACCOUNT], {
    DOTNS_KEYSTORE_PATH: keystoreDirectoryPath,
    DOTNS_KEYSTORE_PASSWORD: TEST_PASSWORD,
  });
}

function parseJsonLine(result: CliRunResult): unknown {
  const jsonLine = result.standardOutput
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") || line.startsWith("null"));
  expect(jsonLine).toBeDefined();
  return JSON.parse(jsonLine!);
}

const DELEGATE_TEST_TIMEOUT_MS = 3 * 60_000;

test(
  "delegate set then status returns the delegate; revoke clears it",
  async () => {
    createPathsForTest("delegate_set_status_revoke");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);
    expect(registerResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(registerResult.combinedOutput).toContain("✓ Operation Complete");

    const setResult = await delegateCli(keystorePath, ["set", label, BOB_EVM_ADDRESS, "--json"]);
    expect(setResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(setResult.combinedOutput).not.toContain("✗ Error:");
    const setJson = parseJsonLine(setResult) as { name: string; delegate: string; txHash: string };
    expect(setJson.name).toBe(`${label}.dot`);
    expect(setJson.delegate.toLowerCase()).toBe(BOB_EVM_ADDRESS.toLowerCase());
    expect(setJson.txHash).toMatch(/^0x[0-9a-fA-F]+$/);

    const statusResult = await delegateCli(keystorePath, ["status", label, "--json"]);
    const statusJson = parseJsonLine(statusResult) as { delegate: string | null };
    expect(statusJson.delegate).not.toBeNull();
    expect(statusJson.delegate!.toLowerCase()).toBe(BOB_EVM_ADDRESS.toLowerCase());

    const revokeResult = await delegateCli(keystorePath, ["revoke", label, "--json"]);
    expect(revokeResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(revokeResult.combinedOutput).not.toContain("✗ Error:");

    const afterRevoke = await delegateCli(keystorePath, ["status", label, "--json"]);
    const afterRevokeJson = parseJsonLine(afterRevoke) as { delegate: string | null };
    expect(afterRevokeJson.delegate).toBeNull();
  },
  { timeout: DELEGATE_TEST_TIMEOUT_MS },
);

test(
  "delegate status is null for a name with no delegate",
  async () => {
    createPathsForTest("delegate_status_null");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);
    expect(registerResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const statusResult = await delegateCli(keystorePath, ["status", label, "--json"]);
    expect(statusResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const statusJson = parseJsonLine(statusResult) as { delegate: string | null };
    expect(statusJson.delegate).toBeNull();
  },
  { timeout: DELEGATE_TEST_TIMEOUT_MS },
);
