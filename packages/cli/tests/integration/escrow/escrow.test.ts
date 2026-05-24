import { afterAll, afterEach, expect, test } from "bun:test";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import { generateRandomLabel } from "../../../src/cli/labels";
import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  TEST_PASSWORD,
  TEST_ACCOUNT,
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

function escrowCli(
  keystoreDirectoryPath: string,
  args: string[],
): Promise<CliRunResult> {
  return runDotnsCli(["escrow", ...args, "--account", TEST_ACCOUNT], {
    DOTNS_KEYSTORE_PATH: keystoreDirectoryPath,
    DOTNS_KEYSTORE_PASSWORD: TEST_PASSWORD,
  });
}

function expectSuccessfulRegistration(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("✓ Operation Complete");
  expect(result.combinedOutput).toContain(`${label}.dot`);
}

const ESCROW_TEST_TIMEOUT_MS = 3 * 60_000;

test(
  "escrow status reflects the deposit after a NoStatus registration",
  async () => {
    createPathsForTest("escrow_status_after_register");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);
    expectSuccessfulRegistration(registerResult, label);

    const statusResult = await escrowCli(keystorePath, ["status", label, "--json"]);

    expect(statusResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(statusResult.combinedOutput).not.toContain("✗ Error:");

    // Parse the JSON line, ignoring banner/spinner output.
    const jsonLine = statusResult.standardOutput
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("{"));
    expect(jsonLine).toBeDefined();

    const position = JSON.parse(jsonLine!) as {
      domain: string;
      recipient: string;
      amount: string;
      released: boolean;
      claimed: boolean;
    };
    expect(position.domain).toBe(label);
    expect(position.released).toBe(false);
    expect(position.claimed).toBe(false);
    // Amount is the flat deposit D, rendered as a decimal string by viem's bigint replacer.
    expect(BigInt(position.amount)).toBeGreaterThan(0n);
  },
  { timeout: ESCROW_TEST_TIMEOUT_MS },
);

test(
  "escrow release flips the position to released and starts the cooldown",
  async () => {
    createPathsForTest("escrow_release_flips_state");
    const keystorePath = await ensureDefaultKeystore();
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    const registerResult = await registerDomain(keystorePath, ["--name", label]);
    expectSuccessfulRegistration(registerResult, label);

    const releaseResult = await escrowCli(keystorePath, ["release", label]);
    expect(releaseResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(releaseResult.combinedOutput).not.toContain("✗ Error:");
    expect(releaseResult.combinedOutput).toContain("Released");

    const statusResult = await escrowCli(keystorePath, ["status", label, "--json"]);
    const jsonLine = statusResult.standardOutput
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("{"));
    expect(jsonLine).toBeDefined();

    const position = JSON.parse(jsonLine!) as {
      released: boolean;
      withdrawAvailableAt: string;
    };
    expect(position.released).toBe(true);
    expect(BigInt(position.withdrawAvailableAt)).toBeGreaterThan(0n);

    // The post-cooldown half of the flow (withdraw + claim-withdrawal) is intentionally
    // not exercised here: on a real chain the cooldown is on the order of days and would
    // make the integration suite useless to run on every commit. Cover it in a separate
    // long-running suite or with chain-time manipulation when one is available.
  },
  { timeout: ESCROW_TEST_TIMEOUT_MS },
);

test(
  "escrow status returns null for a name that was never deposited",
  async () => {
    createPathsForTest("escrow_status_null_for_unregistered");
    const keystorePath = await ensureDefaultKeystore();

    // A long label that almost certainly was never registered. Stem length and
    // digit-count rules are enforced by the classifier; this shape is a clean
    // NoStatus-tier label with no trailing digits.
    const ghostLabel = "ghostnamethatwasneverdeposited";

    const statusResult = await escrowCli(keystorePath, ["status", ghostLabel, "--json"]);
    expect(statusResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(statusResult.combinedOutput).not.toContain("✗ Error:");

    const jsonLine = statusResult.standardOutput
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("null") || line.startsWith("{"));
    expect(jsonLine).toBeDefined();
    expect(jsonLine).toBe("null");
  },
  { timeout: ESCROW_TEST_TIMEOUT_MS },
);
