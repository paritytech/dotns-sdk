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
import {
  buildOrderedStoredChunks,
  clampChunkSizeBytes,
  computeNextAdaptiveWindow,
  runWaveWithRetries,
  selectWaveChunks,
  storeSingleFileToBulletin,
  type UploadWaveChunk,
} from "../../../src/bulletin/store";
import {
  isReconnectRequiredUploadError,
  isRetryableUploadError,
  normalizeUploadMaxRetries,
  runWithUploadRetries,
} from "../../../src/bulletin/uploadRetry";

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
  test("DEFAULT_AUTHORIZATION_BYTES is 1 GB", () => {
    expect(DEFAULT_AUTHORIZATION_BYTES).toBe(BigInt(1024 * 1024 * 1024));
  });

  test("Paseo account with 196 GB passes sufficiency check against 1 GB default", () => {
    const paseoExistingBytes = BigInt(196) * BigInt(1024 * 1024 * 1024);
    expect(isAuthorizationSufficient(1_000_000, paseoExistingBytes)).toBe(true);
  });

  test("Paseo account would have failed with the old 1 TB default", () => {
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

function createStoredEvent(index: string) {
  return [
    {
      type: "TransactionStorage",
      value: {
        type: "Stored",
        value: {
          index: {
            toString: () => index,
          },
        },
      },
    },
  ];
}

function createFakeSingleFileStoreClient(events: any[]) {
  let unsubscribeCalls = 0;
  let destroyCalls = 0;
  const deliveredEventTypes: string[] = [];

  const client = {
    getTypedApi: () => ({
      tx: {
        TransactionStorage: {
          store_with_cid_config: () => ({
            signSubmitAndWatch: () => ({
              subscribe: (observer: { next: (event: any) => void }) => {
                let unsubscribed = false;

                queueMicrotask(() => {
                  for (const event of events) {
                    if (unsubscribed) {
                      return;
                    }

                    deliveredEventTypes.push(event.type);
                    observer.next(event);
                  }
                });

                return {
                  unsubscribe: () => {
                    unsubscribed = true;
                    unsubscribeCalls += 1;
                  },
                };
              },
            }),
          }),
        },
      },
    }),
    destroy: () => {
      destroyCalls += 1;
    },
  };

  return {
    client: client as any,
    deliveredEventTypes,
    getUnsubscribeCalls: () => unsubscribeCalls,
    getDestroyCalls: () => destroyCalls,
  };
}

describe("adaptive window controller", () => {
  test("increases by one after two consecutive clean waves", () => {
    const first = computeNextAdaptiveWindow({
      currentWindow: 1,
      maxWindow: 4,
      cleanWaveStreak: 0,
      waveDurationMs: 5_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(first.nextWindow).toBe(1);
    expect(first.nextCleanWaveStreak).toBe(1);

    const second = computeNextAdaptiveWindow({
      currentWindow: first.nextWindow,
      maxWindow: 4,
      cleanWaveStreak: first.nextCleanWaveStreak,
      waveDurationMs: 6_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(second.nextWindow).toBe(2);
    expect(second.nextCleanWaveStreak).toBe(0);
  });

  test("halves the window on retryable errors", () => {
    const next = computeNextAdaptiveWindow({
      currentWindow: 4,
      maxWindow: 4,
      cleanWaveStreak: 1,
      waveDurationMs: 4_000,
      hadRetryableFailures: true,
      hadRetries: true,
    });

    expect(next.nextWindow).toBe(2);
    expect(next.nextCleanWaveStreak).toBe(0);
  });

  test("halves the window on slow waves", () => {
    const next = computeNextAdaptiveWindow({
      currentWindow: 3,
      maxWindow: 4,
      cleanWaveStreak: 1,
      waveDurationMs: 30_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(next.nextWindow).toBe(1);
    expect(next.nextCleanWaveStreak).toBe(0);
  });
});

describe("wave chunk selection", () => {
  test("never exceeds in-flight byte budget", () => {
    const queue: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "a" },
      { index: 1, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "b" },
      { index: 2, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "c" },
      { index: 3, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "d" },
    ];

    const selected = selectWaveChunks(queue, 4, 8 * 1024 * 1024);
    const selectedBytes = selected.reduce((sum, chunk) => sum + chunk.length, 0);

    expect(selected.length).toBe(2);
    expect(selectedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(queue.length).toBe(2);
  });

  test("throws when a single chunk exceeds budget", () => {
    const queue: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array(9 * 1024 * 1024), length: 9 * 1024 * 1024, cid: "a" },
    ];

    expect(() => selectWaveChunks(queue, 1, 8 * 1024 * 1024)).toThrow(
      "exceeds in-flight byte budget",
    );
  });
});

describe("chunk size clamping", () => {
  test("uses memory-safe defaults and bounds", () => {
    expect(clampChunkSizeBytes(undefined)).toBe(2 * 1024 * 1024);
    expect(clampChunkSizeBytes(128 * 1024)).toBe(256 * 1024);
    expect(clampChunkSizeBytes(8 * 1024 * 1024)).toBe(2 * 1024 * 1024);
  });
});

describe("chunk metadata ordering", () => {
  test("builds deterministic order from out-of-order map", () => {
    const completedByIndex = new Map([
      [2, { index: 2, cid: "cid-2", length: 30 }],
      [0, { index: 0, cid: "cid-0", length: 10 }],
      [1, { index: 1, cid: "cid-1", length: 20 }],
    ]);

    const ordered = buildOrderedStoredChunks(3, completedByIndex);
    expect(ordered.map((entry) => entry.cid)).toEqual(["cid-0", "cid-1", "cid-2"]);
  });
});

describe("wave retry behavior", () => {
  test("retries only failed chunks", async () => {
    const waveChunks: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array([1]), length: 1, cid: "cid-0" },
      { index: 1, bytes: new Uint8Array([2]), length: 1, cid: "cid-1" },
      { index: 2, bytes: new Uint8Array([3]), length: 1, cid: "cid-2" },
    ];

    const attempts = new Map<number, number>();

    const result = await runWaveWithRetries({
      waveChunks,
      jitterMs: () => 0,
      submitChunk: async (chunk, retryAttempt) => {
        const current = attempts.get(chunk.index) ?? 0;
        attempts.set(chunk.index, current + 1);

        if (chunk.index === 1 && retryAttempt === 0) {
          throw new Error("network timeout");
        }
      },
    });

    expect(result.retries).toBe(1);
    expect(result.attemptedSubmissions).toBe(4);
    expect(attempts.get(0)).toBe(1);
    expect(attempts.get(1)).toBe(2);
    expect(attempts.get(2)).toBe(1);
  });
});

describe("top-level upload retry policy", () => {
  test("uses the default retry count when unset", () => {
    expect(normalizeUploadMaxRetries(undefined)).toBe(5);
  });

  test("caps retry count at the hard limit", () => {
    expect(normalizeUploadMaxRetries(99)).toBe(20);
    expect(normalizeUploadMaxRetries("99")).toBe(20);
  });

  test("rejects invalid retry counts", () => {
    expect(() => normalizeUploadMaxRetries(-1)).toThrow(
      "maxRetries must be a whole number between 0 and 20",
    );
    expect(() => normalizeUploadMaxRetries("abc")).toThrow(
      "maxRetries must be a whole number between 0 and 20",
    );
  });

  test("recognises transient Bulletin and transport failures", () => {
    expect(isRetryableUploadError(new Error("Block xyz is not pinned (stop-call)"))).toBe(true);
    expect(isRetryableUploadError(new Error("WebSocket connection reset by peer"))).toBe(true);
    expect(isRetryableUploadError(new Error("ChainHead disjointed"))).toBe(true);
    expect(isRetryableUploadError(new Error("upload worker exited with SIGKILL"))).toBe(true);
  });

  test("routes head and connection failures through reconnect strategy", () => {
    expect(isReconnectRequiredUploadError(new Error("ChainHead disjointed"))).toBe(true);
    expect(isReconnectRequiredUploadError(new Error("WebSocket connection reset by peer"))).toBe(
      true,
    );
    expect(isReconnectRequiredUploadError(new Error("store-timeout"))).toBe(false);
  });

  test("does not retry non-transient failures", () => {
    expect(isRetryableUploadError(new Error("Payment required"))).toBe(false);
    expect(isRetryableUploadError(new Error("Account is not authorized"))).toBe(false);
  });

  test("retries retryable failures until success", async () => {
    const attempts: number[] = [];
    const retryDelays: number[] = [];
    const retryLog: Array<{ retry: number; nextAttempt: number; totalAttempts: number }> = [];

    const result = await runWithUploadRetries({
      maxRetries: 3,
      retryBaseDelaysMs: [10, 20, 30],
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      onRetry: ({ retry, nextAttempt, totalAttempts }) => {
        retryLog.push({ retry, nextAttempt, totalAttempts });
      },
      execute: async (attempt) => {
        attempts.push(attempt);
        if (attempt < 2) {
          throw new Error("ws connection reset");
        }
        return "cid-123";
      },
    });

    expect(result).toBe("cid-123");
    expect(attempts).toEqual([0, 1, 2]);
    expect(retryDelays).toEqual([10, 20]);
    expect(retryLog).toEqual([
      { retry: 1, nextAttempt: 2, totalAttempts: 4 },
      { retry: 2, nextAttempt: 3, totalAttempts: 4 },
    ]);
  });

  test("stops immediately for non-retryable failures", async () => {
    await expect(
      runWithUploadRetries({
        maxRetries: 3,
        sleep: async () => undefined,
        execute: async () => {
          throw new Error("Payment required");
        },
      }),
    ).rejects.toThrow("Payment required");
  });

  test("stops after exhausting the retry budget", async () => {
    let attempts = 0;

    await expect(
      runWithUploadRetries({
        maxRetries: 2,
        retryBaseDelaysMs: [1],
        sleep: async () => undefined,
        execute: async () => {
          attempts += 1;
          throw new Error("rpc timeout");
        },
      }),
    ).rejects.toThrow("rpc timeout");

    expect(attempts).toBe(3);
  });
});

describe("single-file Bulletin store finality policy", () => {
  test("resolves on inclusion by default", async () => {
    const fakeClient = createFakeSingleFileStoreClient([
      { type: "signed" },
      { type: "broadcasted" },
      {
        type: "txBestBlocksState",
        found: true,
        ok: true,
        block: { hash: "0xincluded" },
        events: createStoredEvent("7"),
      },
      {
        type: "finalized",
        ok: true,
        block: { hash: "0xfinalized" },
        events: createStoredEvent("9"),
      },
    ]);

    const result = await storeSingleFileToBulletin({
      rpc: "wss://bulletin.invalid",
      signer: {} as any,
      contentBytes: new Uint8Array([1, 2, 3]),
      client: fakeClient.client,
    });

    expect(result.blockHash).toBe("0xincluded");
    expect(result.storedIndex).toBe("7");
    expect(fakeClient.deliveredEventTypes).toEqual(["signed", "broadcasted", "txBestBlocksState"]);
    expect(fakeClient.getUnsubscribeCalls()).toBe(1);
    expect(fakeClient.getDestroyCalls()).toBe(0);
  });

  test("still supports explicit finalization waits", async () => {
    const fakeClient = createFakeSingleFileStoreClient([
      { type: "signed" },
      { type: "broadcasted" },
      {
        type: "txBestBlocksState",
        found: true,
        ok: true,
        block: { hash: "0xincluded" },
        events: createStoredEvent("7"),
      },
      {
        type: "finalized",
        ok: true,
        block: { hash: "0xfinalized" },
        events: createStoredEvent("9"),
      },
    ]);

    const result = await storeSingleFileToBulletin({
      rpc: "wss://bulletin.invalid",
      signer: {} as any,
      contentBytes: new Uint8Array([1, 2, 3]),
      client: fakeClient.client,
      waitForFinalization: true,
    });

    expect(result.blockHash).toBe("0xfinalized");
    expect(result.storedIndex).toBe("9");
    expect(fakeClient.deliveredEventTypes).toEqual([
      "signed",
      "broadcasted",
      "txBestBlocksState",
      "finalized",
    ]);
    expect(fakeClient.getUnsubscribeCalls()).toBe(1);
    expect(fakeClient.getDestroyCalls()).toBe(0);
  });
});
