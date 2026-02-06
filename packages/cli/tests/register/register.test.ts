import { afterAll, afterEach, expect, test } from "bun:test";
import { ProofOfPersonhoodStatus } from "../../src/types/types";
import { generateRandomLabel } from "../../src/cli/labels";
import {
  createDefaultAccountKeystore,
  generateGovernanceLabel,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  type CliRunResult,
} from "../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/testPaths";

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
const TEST_PASSWORD = "test-password";
const TEST_ACCOUNT = "default";

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return { keystorePassword: TEST_PASSWORD, keystoreDirectoryPath: testFileKeystoreDirectoryPath };
}

test(
  "register domain: no status",
  async () => {
    createPathsForTest("register_domain_no_status");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain: pop lite",
  async () => {
    createPathsForTest("register_domain_pop_lite");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.ProofOfPersonhoodLite);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
        "--status",
        "lite",
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain: pop full",
  async () => {
    createPathsForTest("register_domain_pop_full");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.ProofOfPersonhoodFull);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
        "--status",
        "full",
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain for someone else using owner flag",
  async () => {
    createPathsForTest("register_domain_for_someone_else_using_owner");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);
    const ownerAddress = "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0";

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
        "--owner",
        ownerAddress,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain and transfer",
  async () => {
    createPathsForTest("register_domain_and_transfer");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
        "--transfer",
        "--to",
        "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name",
  async () => {
    createPathsForTest("register_domain_governance_name");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        governanceLabel,
        "--governance",
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name and transfer",
  async () => {
    createPathsForTest("register_domain_governance_name_and_transfer");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        governanceLabel,
        "--governance",
        "--transfer",
        "--to",
        "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register domain governance name for someone else using owner flag",
  async () => {
    createPathsForTest("register_domain_governance_for_someone_else_using_owner");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const governanceLabel = generateGovernanceLabel(5);
    const ownerAddress = "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0";

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        governanceLabel,
        "--governance",
        "--owner",
        ownerAddress,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, governanceLabel);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "regression: register domain must not implicitly set PoP status when --status is omitted",
  async () => {
    createPathsForTest("regression_register_domain_does_not_set_pop");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
        "domain",
        "--account",
        TEST_ACCOUNT,
        "--name",
        label,
      ],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);
