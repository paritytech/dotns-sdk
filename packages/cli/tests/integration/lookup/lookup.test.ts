import { afterAll, afterEach, expect, test } from "bun:test";
import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
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
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import { generateRandomLabel } from "../../../src/cli/labels";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let testFileKeystoreDirectoryPath: string | undefined;

const REGISTERED_DOMAIN = "dotnscli";
const REGISTERED_DOMAIN_WITH_POP = "sphaman12";
const REGISTERED_TLD = "dotns";
const BOB_SS58 = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

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
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).not.toContain("EISDIR:");
  expect(result.combinedOutput).toContain(label + ".dot");
}

function expectSuccessfulOwnerLookup(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).not.toContain("EISDIR:");
  expect(result.combinedOutput).toContain("Ownership lookup");
  expect(result.combinedOutput).toContain(label + ".dot");
  expect(result.combinedOutput).toContain("Registered:");
  expect(result.combinedOutput).toContain("Owner (EVM):");
}

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return { keystorePassword: TEST_PASSWORD, keystoreDirectoryPath: testFileKeystoreDirectoryPath };
}

async function registerFreshDomainForAlice(): Promise<string> {
  const label = generateRandomLabel(ProofOfPersonhoodStatus.ProofOfPersonhoodFull);

  const result = await runDotnsCli([
    "register",
    "domain",
    "--name",
    label,
    "--status",
    "full",
    "--key-uri",
    "//Alice",
  ]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("✓ Operation Complete");

  return label;
}

test(
  "lookup comprehensive domain information without auth",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "name", REGISTERED_DOMAIN]);

    expectSuccessfulLookup(lookupResult, REGISTERED_DOMAIN);
    expect(lookupResult.combinedOutput).toContain("Registry");
    expect(lookupResult.combinedOutput).toContain("exists:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup using --name flag without auth",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "--name", REGISTERED_TLD]);

    expectSuccessfulLookup(lookupResult, REGISTERED_TLD);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup name --json returns structured result with no human output",
  async () => {
    const result = await runDotnsCli(["lookup", "name", REGISTERED_DOMAIN, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("═══");
    expect(result.combinedOutput).not.toContain("▶");
    expect(result.combinedOutput).not.toContain("✓");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.domain).toBe(`${REGISTERED_DOMAIN}.dot`);
    expect(parsed.node).toBeString();
    expect(parsed.exists).toBeBoolean();
    expect(parsed.owner).toBeString();
    expect(parsed.resolver).toBeString();
  },
  { timeout: TEST_TIMEOUT_MS },
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
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup oo alias shows ownership information without auth",
  async () => {
    const ooResult = await runDotnsCli(["lookup", "oo", REGISTERED_DOMAIN_WITH_POP]);

    expectSuccessfulOwnerLookup(ooResult, REGISTERED_DOMAIN_WITH_POP);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup handles unregistered domain without auth",
  async () => {
    const unregisteredLabel = "unregistered123456789xyz";

    const lookupResult = await runDotnsCli(["lookup", "owner-of", unregisteredLabel]);

    expect(lookupResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(lookupResult.combinedOutput).toContain("Registered:");
    expect(lookupResult.combinedOutput).toContain("false");
    expect(lookupResult.combinedOutput).toContain("(none)");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup owner-of --json returns structured result",
  async () => {
    const result = await runDotnsCli(["lookup", "owner-of", REGISTERED_DOMAIN, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("═══");
    expect(result.combinedOutput).not.toContain("🔎");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.label).toBe(REGISTERED_DOMAIN);
    expect(parsed.domain).toBe(`${REGISTERED_DOMAIN}.dot`);
    expect(parsed.registered).toBeBoolean();
    expect(parsed.ownerEvm).toBeString();
    expect(parsed.ownerSubstrate).toBeString();
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup reserved domain shows reserved status",
  async () => {
    const lookupResult = await runDotnsCli(["lookup", "name", REGISTERED_DOMAIN]);

    expectSuccessfulLookup(lookupResult, REGISTERED_DOMAIN);
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup transfer with substrate destination using positional label",
  async () => {
    const label = await registerFreshDomainForAlice();

    const result = await runDotnsCli([
      "lookup",
      "transfer",
      label,
      "-d",
      BOB_SS58,
      "--key-uri",
      "//Alice",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("✗ Error:");
    expect(result.combinedOutput).toContain("Transfer");
    expect(result.combinedOutput).toContain(label + ".dot");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup transfer with --name flag falls back to parent option",
  async () => {
    const label = await registerFreshDomainForAlice();

    const result = await runDotnsCli([
      "lookup",
      "transfer",
      "--name",
      label,
      "-d",
      BOB_SS58,
      "--key-uri",
      "//Alice",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("✗ Error:");
    expect(result.combinedOutput).toContain("Transfer");
    expect(result.combinedOutput).toContain(label + ".dot");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "lookup transfer --json returns structured result",
  async () => {
    const label = await registerFreshDomainForAlice();

    const result = await runDotnsCli([
      "lookup",
      "transfer",
      label,
      "-d",
      BOB_SS58,
      "--key-uri",
      "//Alice",
      "--json",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    expect(result.combinedOutput).not.toContain("═══");
    expect(result.combinedOutput).not.toContain("▶");

    const parsed = JSON.parse(result.combinedOutput.trim());

    expect(parsed.label).toBe(label);
    expect(parsed.domain).toBe(`${label}.dot`);
    expect(parsed.destination).toBe(BOB_SS58);
    expect(parsed.recipient).toBeString();
    expect(parsed.transferred).toBe(true);
  },
  { timeout: TEST_TIMEOUT_MS },
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

    expect(listResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "list command works with mnemonic flag",
  async () => {
    const listResult = await runDotnsCli(["--mnemonic", DEFAULT_MNEMONIC, "list"]);

    expect(listResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: TEST_TIMEOUT_MS },
);

test(
  "list command works with key-uri flag",
  async () => {
    const listResult = await runDotnsCli(["--key-uri", "//Alice", "list"]);

    expect(listResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(listResult.combinedOutput).not.toContain("✗ Error:");
  },
  { timeout: TEST_TIMEOUT_MS },
);
