import { afterAll, afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { promises as fs } from "node:fs";

import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  TEST_ACCOUNT,
  TEST_PASSWORD,
  type CliRunResult,
} from "../../_helpers/cliHelpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../../_helpers/testPaths";
import {
  DEFAULT_AUTHORIZATION_BYTES,
  DEFAULT_AUTHORIZATION_TRANSACTIONS,
  BULLETIN_BLOCK_TIME_MS,
} from "../../../src/utils/constants";
import { estimateBlockDate, formatEstimatedDate } from "../../../src/commands/bulletin";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let testFileKeystoreDirectoryPath: string | undefined;
const BULLETIN_TEST_TIMEOUT_MS = 3 * 60_000;

type JsonUploadResult = {
  cid: string;
  contenthash: string;
  preview: string;
  path: string;
  type: "file" | "directory";
  size: number;
};

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

function spongePath(): string {
  return path.resolve(__dirname, "../../_files/sponge.png");
}

async function createTestDirectory(testName: string): Promise<string> {
  const dirPath = path.join(testFileTemporaryRootDirectoryPath!, testName);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, "index.html"), "<html><body>Hello</body></html>");
  await fs.writeFile(path.join(dirPath, "style.css"), "body { color: red; }");
  return dirPath;
}

async function ensureDefaultKeystore() {
  if (!testFileKeystoreDirectoryPath) throw new Error("Missing test file keystore directory path");

  await createDefaultAccountKeystore(testFileKeystoreDirectoryPath, TEST_PASSWORD);

  return { keystorePassword: TEST_PASSWORD, keystoreDirectoryPath: testFileKeystoreDirectoryPath };
}

function expectSuccessfulUpload(result: CliRunResult) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Bulletin Upload");
  expect(result.combinedOutput).toContain("cid:");
  expect(result.combinedOutput).toContain("✓ Upload Complete");
}

function expectSuccessfulAuthorize(result: CliRunResult) {
  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Bulletin Authorize");
}

function stripAnsiCodes(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function extractLastCid(result: CliRunResult): string {
  const cleanOutput = stripAnsiCodes(result.combinedOutput);
  const matches = [...cleanOutput.matchAll(/cid:\s+([a-z0-9]+)\s*/gi)];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1]?.[1] ?? "";
}

function extractContenthash(result: CliRunResult): string {
  const cleanOutput = stripAnsiCodes(result.combinedOutput);
  const matches = [...cleanOutput.matchAll(/contenthash:\s+(0x[0-9a-f]+)\s*/gi)];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1]?.[1] ?? "";
}

function parseJsonUploadResult(result: CliRunResult): JsonUploadResult {
  return JSON.parse(result.standardOutput);
}

async function runBulletinUpload(args: string[]) {
  const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

  return runDotnsCli(
    ["--password", keystorePassword, "bulletin", "upload", "--account", TEST_ACCOUNT, ...args],
    { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
  );
}

function runBulletinAuthorize(args: string[]) {
  return runDotnsCli(["bulletin", "authorize", ...args]);
}

async function runBulletinAuthorizeWithAccount(args: string[] = []) {
  const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

  return runDotnsCli(
    ["--password", keystorePassword, "bulletin", "authorize", "--account", TEST_ACCOUNT, ...args],
    { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
  );
}

function runBulletinStatus(args: string[]) {
  return runDotnsCli(["bulletin", "status", ...args]);
}

function runBulletinHistory(args: string[] = []) {
  return runDotnsCli(["bulletin", "history", ...args]);
}

test(
  "bulletin upload directory json parallel",
  async () => {
    createPathsForTest("bulletin_upload_directory_json_parallel");
    const dirPath = await createTestDirectory("test_site_json_parallel");

    const result = await runBulletinUpload([
      dirPath,
      "--json",
      "--concurrency",
      "3",
      "--no-history",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = parseJsonUploadResult(result);
    expect(parsed.cid).toMatch(/^bafy|^bafk/);
    expect(parsed.type).toBe("directory");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload json cid matches interactive cid",
  async () => {
    createPathsForTest("bulletin_upload_json_cid_matches_interactive");

    const jsonResult = await runBulletinUpload([spongePath(), "--json", "--no-history"]);
    const interactiveResult = await runBulletinUpload([spongePath(), "--no-history"]);

    expect(jsonResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(interactiveResult.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const jsonCid = parseJsonUploadResult(jsonResult).cid;
    const interactiveCid = extractLastCid(interactiveResult);

    expect(jsonCid).toBe(interactiveCid);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload --profile-upload keeps json output stable and writes report",
  async () => {
    createPathsForTest("bulletin_upload_profile_json");
    const profileOutputPath = path.join(
      testFileTemporaryRootDirectoryPath!,
      `upload-profile-${Date.now()}.json`,
    );

    const result = await runBulletinUpload([
      spongePath(),
      "--json",
      "--profile-upload",
      "--profile-output",
      profileOutputPath,
      "--no-history",
    ]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = parseJsonUploadResult(result);
    expect(parsed.cid).toMatch(/^bafy|^bafk/);
    expect(parsed.contenthash).toMatch(/^[0-9a-f]+$/i);
    expect(parsed.preview).toContain("preview");
    expect(parsed.type).toBe("file");

    const profileRaw = await fs.readFile(profileOutputPath, "utf8");
    const profileParsed = JSON.parse(profileRaw);

    expect(profileParsed.meta).toBeDefined();
    expect(Array.isArray(profileParsed.samples)).toBe(true);
    expect(Array.isArray(profileParsed.waves)).toBe(true);
    expect(profileParsed.summary).toBeDefined();
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload directory",
  async () => {
    createPathsForTest("bulletin_upload_directory");
    const dirPath = await createTestDirectory("test_site");

    const result = await runBulletinUpload([dirPath, "--no-history"]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain("directory");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload directory with concurrency",
  async () => {
    createPathsForTest("bulletin_upload_directory_parallel");
    const dirPath = await createTestDirectory("test_site_parallel");

    const result = await runBulletinUpload([dirPath, "--concurrency", "3", "--no-history"]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain("directory (parallel");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload directory with contenthash",
  async () => {
    createPathsForTest("bulletin_upload_directory_contenthash");
    const dirPath = await createTestDirectory("test_site_contenthash");

    const result = await runBulletinUpload([dirPath, "--print-contenthash", "--no-history"]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain("directory");
    expect(extractContenthash(result)).toMatch(/^0x[0-9a-f]+$/i);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize with positional address",
  async () => {
    createPathsForTest("bulletin_authorize_positional");
    const targetAddress = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

    const result = await runBulletinAuthorize([targetAddress]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain(targetAddress);
    expect(result.combinedOutput).toContain("rpc:");
    expect(result.combinedOutput).toContain("transactions:");
    expect(result.combinedOutput).toContain("signer:");
    expect(result.combinedOutput).toContain("//Alice");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize with --account resolves target from keystore",
  async () => {
    createPathsForTest("bulletin_authorize_account_flag");

    const result = await runBulletinAuthorizeWithAccount();

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain("target:");
    expect(result.combinedOutput).toContain("signer:");
    expect(result.combinedOutput).toContain("//Alice");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize with custom transactions and bytes",
  async () => {
    createPathsForTest("bulletin_authorize_custom_limits");
    const targetAddress = "5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y";

    const result = await runBulletinAuthorize([
      targetAddress,
      "--transactions",
      "100",
      "--bytes",
      "1000",
    ]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain("1000.00 B");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize custom rpc",
  async () => {
    createPathsForTest("bulletin_authorize_custom_rpc");
    const targetAddress = "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy";

    const result = await runBulletinAuthorize([targetAddress]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain("wss://paseo-bulletin-rpc.polkadot.io");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test("bulletin history empty", async () => {
  await runDotnsCli(["bulletin", "history:clear"]);

  const result = await runBulletinHistory();

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("No uploads in history");
});

test("bulletin history json output", async () => {
  const result = await runBulletinHistory(["--json"]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  const parsed = JSON.parse(result.combinedOutput);
  expect(Array.isArray(parsed)).toBe(true);
});

test("bulletin history clear", async () => {
  const result = await runDotnsCli(["bulletin", "history:clear"]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Cleared");
});

test("bulletin history remove nonexistent cid", async () => {
  const result = await runDotnsCli(["bulletin", "history:remove", "bafybeifake123"]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("not found");
});

function isAuthorizationSufficient(
  existingTransactions: number,
  existingBytes: bigint,
  requestedTransactions: number = DEFAULT_AUTHORIZATION_TRANSACTIONS,
  requestedBytes: bigint = DEFAULT_AUTHORIZATION_BYTES,
): boolean {
  return existingTransactions >= requestedTransactions && existingBytes >= requestedBytes;
}

describe("authorization sufficiency check", () => {
  test("DEFAULT_AUTHORIZATION_BYTES is 500 MB", () => {
    expect(DEFAULT_AUTHORIZATION_BYTES).toBe(BigInt(524288000));
  });

  test("Paseo account with 196 GB passes sufficiency check against 500 MB default", () => {
    const paseoExistingBytes = BigInt(196) * BigInt(1024 * 1024 * 1024);
    expect(isAuthorizationSufficient(1_000_000, paseoExistingBytes)).toBe(true);
  });

  test("Paseo account would have FAILED with old 1 TB default", () => {
    const oldDefaultBytes = BigInt(1099511627776);
    const paseoExistingBytes = BigInt(196) * BigInt(1024 * 1024 * 1024);

    expect(paseoExistingBytes < oldDefaultBytes).toBe(true);
    expect(
      isAuthorizationSufficient(
        1_000_000,
        paseoExistingBytes,
        DEFAULT_AUTHORIZATION_TRANSACTIONS,
        oldDefaultBytes,
      ),
    ).toBe(false);
  });

  test("zero authorization fails sufficiency check", () => {
    expect(isAuthorizationSufficient(0, 0n)).toBe(false);
  });
});

describe("estimateBlockDate", () => {
  test("returns a future date when target block is ahead of current block", () => {
    const now = Date.now();
    const currentBlock = 1000;
    const targetBlock = 2000;
    const result = estimateBlockDate(currentBlock, targetBlock);
    const expectedMs = (targetBlock - currentBlock) * BULLETIN_BLOCK_TIME_MS;

    expect(result.getTime()).toBeGreaterThanOrEqual(now + expectedMs - 100);
    expect(result.getTime()).toBeLessThanOrEqual(now + expectedMs + 100);
  });

  test("returns a past date when target block is behind current block", () => {
    const now = Date.now();
    const currentBlock = 2000;
    const targetBlock = 1000;
    const result = estimateBlockDate(currentBlock, targetBlock);

    expect(result.getTime()).toBeLessThan(now);
  });

  test("returns approximately now when target equals current block", () => {
    const now = Date.now();
    const result = estimateBlockDate(1000, 1000);

    expect(Math.abs(result.getTime() - now)).toBeLessThan(100);
  });
});

describe("formatEstimatedDate", () => {
  test("formats date as YYYY-MM-DD HH:MM UTC", () => {
    const date = new Date("2026-03-24T14:30:00.000Z");
    expect(formatEstimatedDate(date)).toBe("2026-03-24 14:30 UTC");
  });

  test("pads single-digit month and day", () => {
    const date = new Date("2026-01-05T08:05:00.000Z");
    expect(formatEstimatedDate(date)).toBe("2026-01-05 08:05 UTC");
  });
});

test(
  "bulletin authorize with --force re-authorizes already authorized account",
  async () => {
    createPathsForTest("bulletin_authorize_force");
    const targetAddress = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

    const firstResult = await runBulletinAuthorize([targetAddress]);
    expectSuccessfulAuthorize(firstResult);

    const forceResult = await runBulletinAuthorize([targetAddress, "--force"]);
    expectSuccessfulAuthorize(forceResult);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize shows expiration date",
  async () => {
    createPathsForTest("bulletin_authorize_expiration");
    const targetAddress = "5GNJqTPyNqANBkUVMN1LPPrxXnFouWA2MRQg3gKrUYgw6J9y";

    const result = await runBulletinAuthorize([targetAddress]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain("expires:");
    expect(result.combinedOutput).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize json output includes expiresAt",
  async () => {
    createPathsForTest("bulletin_authorize_json_expires");
    const targetAddress = "5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw";

    const result = await runBulletinAuthorize([targetAddress, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.standardOutput);
    expect(parsed.ok).toBe(true);
    expect(parsed.expiresAt).toBeDefined();
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin status shows authorization for authorized account",
  async () => {
    createPathsForTest("bulletin_status_authorized");
    const targetAddress = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

    await runBulletinAuthorize([targetAddress]);

    const result = await runBulletinStatus([targetAddress]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("Authorization Status");
    expect(result.combinedOutput).toContain("authorized");
    expect(result.combinedOutput).toContain("expires:");
    expect(result.combinedOutput).toContain("transactions:");
    expect(result.combinedOutput).toContain("bytes:");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin status json output includes all fields",
  async () => {
    createPathsForTest("bulletin_status_json");
    const targetAddress = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

    const result = await runBulletinStatus([targetAddress, "--json"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    const parsed = JSON.parse(result.standardOutput);
    expect(parsed.address).toBe(targetAddress);
    expect(parsed.authorized).toBe(true);
    expect(typeof parsed.expired).toBe("boolean");
    expect(typeof parsed.transactions).toBe("number");
    expect(parsed.expiresAt).toBeDefined();
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin status shows not authorized for unknown account",
  async () => {
    createPathsForTest("bulletin_status_not_authorized");
    const targetAddress = "5CiPPseXPECbkjWCa6MnjNokrgYjMqmKndv2rSneWj6VLWZK";

    const result = await runBulletinStatus([targetAddress]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).toContain("not authorized");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);
