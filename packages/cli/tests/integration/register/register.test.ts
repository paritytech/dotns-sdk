import { afterAll, afterEach, expect, test } from "bun:test";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import { generateRandomLabel } from "../../../src/cli/labels";
import {
  createDefaultAccountKeystore,
  generateGovernanceLabel,
  HARNESS_SUCCESS_EXIT_CODE,
  TEST_PASSWORD,
  TEST_ACCOUNT,
  TEST_OWNER_EVM_ADDRESS,
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

function expectSuccessfulRegistration(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).not.toContain("EISDIR:");
  expect(result.combinedOutput).toContain("✓ Operation Complete");
  expect(result.combinedOutput).toContain(`${label}.dot`);
}

function expectNoPopStatusMutationAttempt(result: CliRunResult) {
  expect(result.combinedOutput).not.toContain("• Setting PoP status");
  expect(result.combinedOutput).not.toContain("Current PoP status");
  expect(result.combinedOutput).not.toContain("desired:");
  expect(result.combinedOutput).not.toContain("Status already set");
}

const REGISTER_TEST_TIMEOUT_MS = 3 * 60_000;

test(
  "register domain: no status",
  async () => {
    createPathsForTest("register_domain_no_status");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain for someone else using owner flag",
  async () => {
    createPathsForTest("register_domain_for_someone_else_using_owner");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);
    const ownerAddress = TEST_OWNER_EVM_ADDRESS;

    const registerResult = await registerDomain(keystorePath, [
      "--name",
      label,
      "--owner",
      ownerAddress,
    ]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain and transfer",
  async () => {
    createPathsForTest("register_domain_and_transfer");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, [
      "--name",
      label,
      "--transfer",
      "--to",
      TEST_OWNER_EVM_ADDRESS,
    ]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name",
  async () => {
    createPathsForTest("register_domain_governance_name");
    const keystorePath = await ensureDefaultKeystore();
    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await registerDomain(keystorePath, [
      "--name",
      governanceLabel,
      "--governance",
    ]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name and transfer",
  async () => {
    createPathsForTest("register_domain_governance_name_and_transfer");
    const keystorePath = await ensureDefaultKeystore();
    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await registerDomain(keystorePath, [
      "--name",
      governanceLabel,
      "--governance",
      "--transfer",
      "--to",
      TEST_OWNER_EVM_ADDRESS,
    ]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name for someone else using owner flag",
  async () => {
    createPathsForTest("register_domain_governance_for_someone_else_using_owner");
    const keystorePath = await ensureDefaultKeystore();
    const governanceLabel = generateGovernanceLabel(5);
    const ownerAddress = TEST_OWNER_EVM_ADDRESS;

    const registerResult = await registerDomain(keystorePath, [
      "--name",
      governanceLabel,
      "--governance",
      "--owner",
      ownerAddress,
    ]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "regression: register domain must not implicitly set PoP status",
  async () => {
    createPathsForTest("regression_register_domain_does_not_set_pop");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

// --json tests

test(
  "register domain --json returns structured result",
  async () => {
    createPathsForTest("register_domain_json");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const result = await runDotnsCli(
      ["register", "domain", "--account", TEST_ACCOUNT, "--name", label, "--json"],
      { DOTNS_KEYSTORE_PATH: keystorePath, DOTNS_KEYSTORE_PASSWORD: TEST_PASSWORD },
    );

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("═══");
    expect(result.combinedOutput).not.toContain("▶");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.ok).toBe(true);
    expect(parsed.label).toBe(label);
    expect(parsed.domain).toBe(`${label}.dot`);
    expect(parsed.owner).toBeString();
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);
