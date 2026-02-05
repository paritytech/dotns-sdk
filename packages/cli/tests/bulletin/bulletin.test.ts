import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import path from "node:path";
import { promises as fs } from "node:fs";

import { runDotnsCli, type CliRunResult } from "../_helpers/cli-helpers";
import {
  cleanupTestFileTemporaryDirectory,
  cleanupTestTemporaryDirectory,
  createKeystorePathsForTest,
} from "../_helpers/test-paths";

const createdTestTemporaryDirectoryPaths: string[] = [];
let testFileTemporaryRootDirectoryPath: string | undefined;
let sharedKeystoreDirectoryPath: string | undefined;

const KEYSTORE_PASSWORD = "test-password";
const ALICE_ACCOUNT = "alice";

function createPathsForTest(testName: string) {
  const paths = createKeystorePathsForTest(testName);
  createdTestTemporaryDirectoryPaths.push(paths.testTemporaryDirectoryPath);

  if (!testFileTemporaryRootDirectoryPath) {
    testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;
  }

  return paths;
}

beforeAll(async () => {
  const paths = createKeystorePathsForTest("shared_keystore");
  sharedKeystoreDirectoryPath = paths.keystoreDirectoryPath;
  testFileTemporaryRootDirectoryPath = paths.testFileTemporaryRootDirectoryPath;

  const result = await runDotnsCli([
    "--keystore-path",
    sharedKeystoreDirectoryPath,
    "--password",
    KEYSTORE_PASSWORD,
    "auth",
    "set",
    "--account",
    ALICE_ACCOUNT,
    "--key-uri",
    "//Alice",
  ]);

  expect(result.exitCode).toBe(0);
});

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
    sharedKeystoreDirectoryPath = undefined;
  }
});

const BULLETIN_TEST_TIMEOUT_MS = 3 * 60_000;

function spongePath(): string {
  return path.resolve(__dirname, "../_files/sponge.png");
}

async function createTestDirectory(testName: string): Promise<string> {
  const dirPath = path.join(testFileTemporaryRootDirectoryPath!, testName);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, "index.html"), "<html><body>Hello</body></html>");
  await fs.writeFile(path.join(dirPath, "style.css"), "body { color: red; }");
  return dirPath;
}

function expectSuccessfulUpload(result: CliRunResult) {
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Bulletin Upload");
  expect(result.combinedOutput).toContain("cid:");
  expect(result.combinedOutput).toContain("✓ Upload Complete");
}

function expectSuccessfulAuthorize(result: CliRunResult) {
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Bulletin Authorize");
}

function extractLastCid(result: CliRunResult): string {
  const matches = [...result.combinedOutput.matchAll(/cid:\s+([a-z0-9]+)\s*/gi)];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1]?.[1] ?? "";
}

function extractContenthash(result: CliRunResult): string {
  const matches = [...result.combinedOutput.matchAll(/contenthash:\s+(0x[0-9a-f]+)\s*/gi)];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1]?.[1] ?? "";
}

function runBulletinUpload(args: string[], account: string = ALICE_ACCOUNT) {
  return runDotnsCli([
    "--keystore-path",
    sharedKeystoreDirectoryPath!,
    "--password",
    KEYSTORE_PASSWORD,
    "--account",
    account,
    "bulletin",
    "upload",
    ...args,
  ]);
}

function runBulletinAuthorize(args: string[], account: string = ALICE_ACCOUNT) {
  return runDotnsCli([
    "--keystore-path",
    sharedKeystoreDirectoryPath!,
    "--password",
    KEYSTORE_PASSWORD,
    "--account",
    account,
    "bulletin",
    "authorize",
    ...args,
  ]);
}

function runBulletinHistory(args: string[] = []) {
  return runDotnsCli(["bulletin", "history", ...args]);
}

test(
  "bulletin upload file basic",
  async () => {
    createPathsForTest("bulletin_upload_file_basic");

    const result = await runBulletinUpload([spongePath(), "--no-history"]);

    expectSuccessfulUpload(result);
    expect(extractLastCid(result).length).toBeGreaterThan(10);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload file with contenthash",
  async () => {
    createPathsForTest("bulletin_upload_contenthash");

    const result = await runBulletinUpload([spongePath(), "--print-contenthash", "--no-history"]);

    expectSuccessfulUpload(result);
    expect(extractContenthash(result)).toMatch(/^0x[0-9a-f]+$/i);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload file force-chunked",
  async () => {
    createPathsForTest("bulletin_upload_force_chunked");

    const result = await runBulletinUpload([
      spongePath(),
      "--force-chunked",
      "--chunk-size",
      "1048576",
      "--no-history",
    ]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain("chunked (dag-pb)");
    expect(result.combinedOutput).toContain("chunks:");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload file custom rpc",
  async () => {
    createPathsForTest("bulletin_upload_custom_rpc");
    const customRpc = "wss://bulletin.dotspark.app";

    const result = await runBulletinUpload([
      spongePath(),
      "--bulletin-rpc",
      customRpc,
      "--no-history",
    ]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain(customRpc);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload file all options",
  async () => {
    createPathsForTest("bulletin_upload_all_options");

    const result = await runBulletinUpload([
      spongePath(),
      "--bulletin-rpc",
      "wss://bulletin.dotspark.app",
      "--chunk-size",
      "2097152",
      "--force-chunked",
      "--print-contenthash",
      "--no-history",
    ]);

    expectSuccessfulUpload(result);
    expect(result.combinedOutput).toContain("chunked (dag-pb)");
    expect(result.combinedOutput).toContain("chunks:");
    expect(extractContenthash(result)).toMatch(/^0x[0-9a-f]+$/i);
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
  "bulletin upload directory parallel",
  async () => {
    createPathsForTest("bulletin_upload_directory_parallel");
    const dirPath = await createTestDirectory("test_site_parallel");

    const result = await runBulletinUpload([
      dirPath,
      "--parallel",
      "--concurrency",
      "3",
      "--no-history",
    ]);

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
  "bulletin authorize basic",
  async () => {
    createPathsForTest("bulletin_authorize_basic");
    const targetAddress = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";

    const result = await runBulletinAuthorize([targetAddress]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain(targetAddress);
    expect(result.combinedOutput).toContain("rpc:");
    expect(result.combinedOutput).toContain("transactions:");
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
      "500000",
      "--bytes",
      "549755813888",
    ]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain("500,000");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize already authorized account",
  async () => {
    createPathsForTest("bulletin_authorize_already_authorized");
    const aliceAddress = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

    const result = await runBulletinAuthorize([aliceAddress]);

    expect(result.exitCode).toBe(0);
    expect(result.combinedOutput).toMatch(/already authorized/i);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin authorize custom rpc",
  async () => {
    createPathsForTest("bulletin_authorize_custom_rpc");
    const targetAddress = "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy";
    const customRpc = "wss://bulletin.dotspark.app";

    const result = await runBulletinAuthorize([targetAddress, "--bulletin-rpc", customRpc]);

    expectSuccessfulAuthorize(result);
    expect(result.combinedOutput).toContain(customRpc);
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test("bulletin history empty", async () => {
  await runDotnsCli(["bulletin", "history:clear"]);

  const result = await runBulletinHistory();

  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("No uploads in history");
});

test("bulletin history json output", async () => {
  const result = await runBulletinHistory(["--json"]);

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.combinedOutput);
  expect(Array.isArray(parsed)).toBe(true);
});

test("bulletin history clear", async () => {
  const result = await runDotnsCli(["bulletin", "history:clear"]);

  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Cleared");
});

test("bulletin history remove nonexistent cid", async () => {
  const result = await runDotnsCli(["bulletin", "history:remove", "bafybeifake123"]);

  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("not found");
});
