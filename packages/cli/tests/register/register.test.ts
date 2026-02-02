import { afterAll, afterEach, expect, test } from "bun:test";
import { ProofOfPersonhoodStatus } from "../../src/types/types";
import { generateRandomLabel } from "../../src/cli/labels";
import {
  createDefaultAccountKeystore,
  generateGovernanceLabel,
  runDotnsCli,
  type CliRunResult,
} from "../_helpers/cli-helpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/test-paths";

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
  expect(result.exitCode).toBe(1);
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
  "register base: no status",
  async () => {
    createPathsForTest("register_base_no_status");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      ["--password", keystorePassword, "register", "--account", TEST_ACCOUNT, "--name", label],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);

test(
  "register base: pop lite",
  async () => {
    createPathsForTest("register_base_pop_lite");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.ProofOfPersonhoodLite);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register base: pop full",
  async () => {
    createPathsForTest("register_base_pop_full");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.ProofOfPersonhoodFull);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register for someone else using owner flag",
  async () => {
    createPathsForTest("register_for_someone_else_using_owner");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);
    const ownerAddress = "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0";

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register and transfer",
  async () => {
    createPathsForTest("register_and_transfer");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register governance name",
  async () => {
    createPathsForTest("register_governance_name");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register governance name and transfer",
  async () => {
    createPathsForTest("register_governance_name_and_transfer");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const governanceLabel = generateGovernanceLabel(5);

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "register governance name for someone else using owner flag",
  async () => {
    createPathsForTest("register_governance_for_someone_else_using_owner");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();
    const governanceLabel = generateGovernanceLabel(5);
    const ownerAddress = "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0";

    const registerResult = await runDotnsCli(
      [
        "--password",
        keystorePassword,
        "register",
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
  "regression: register must not implicitly set PoP status when --status is omitted",
  async () => {
    createPathsForTest("regression_register_does_not_set_pop");

    const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await runDotnsCli(
      ["--password", keystorePassword, "register", "--account", TEST_ACCOUNT, "--name", label],
      { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
    );

    expectNoPopStatusMutationAttempt(registerResult);
    expectSuccessfulRegistration(registerResult, label);
  },
  { timeout: REGISTER_TEST_TIMEOUT_MS },
);
