import { afterAll, afterEach, expect, test } from "bun:test";
import path from "node:path";
import { promises as fs } from "node:fs";

import {
  createDefaultAccountKeystore,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  TEST_ACCOUNT,
  TEST_PASSWORD,
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
  return path.resolve(__dirname, "../_files/sponge.png");
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

async function runBulletinAuthorize(args: string[]) {
  const { keystorePassword, keystoreDirectoryPath } = await ensureDefaultKeystore();

  return runDotnsCli(
    ["--password", keystorePassword, "bulletin", "authorize", "--account", TEST_ACCOUNT, ...args],
    { DOTNS_KEYSTORE_PATH: keystoreDirectoryPath },
  );
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
  "bulletin upload file json output",
  async () => {
    createPathsForTest("bulletin_upload_file_json");

    const result = await runBulletinUpload([spongePath(), "--json", "--no-history"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = parseJsonUploadResult(result);
    expect(parsed.cid).toMatch(/^bafy|^bafk/);
    expect(parsed.contenthash).toMatch(/^[0-9a-f]+$/i);
    expect(parsed.preview).toContain("dotns.paseo.li");
    expect(parsed.type).toBe("file");
    expect(parsed.size).toBeGreaterThan(0);
    expect(parsed.path).toContain("sponge.png");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload file json suppresses interactive output",
  async () => {
    createPathsForTest("bulletin_upload_file_json_silent");

    const result = await runBulletinUpload([spongePath(), "--json", "--no-history"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(result.combinedOutput).not.toContain("▶ Bulletin Upload");
    expect(result.combinedOutput).not.toContain("✓ Upload Complete");
    expect(result.combinedOutput).not.toContain("Storing");
    expect(result.combinedOutput).not.toContain("Validating");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload directory json output",
  async () => {
    createPathsForTest("bulletin_upload_directory_json");
    const dirPath = await createTestDirectory("test_site_json");

    const result = await runBulletinUpload([dirPath, "--json", "--no-history"]);

    expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

    const parsed = parseJsonUploadResult(result);
    expect(parsed.cid).toMatch(/^bafy|^bafk/);
    expect(parsed.contenthash).toMatch(/^[0-9a-f]+$/i);
    expect(parsed.type).toBe("directory");
  },
  { timeout: BULLETIN_TEST_TIMEOUT_MS },
);

test(
  "bulletin upload directory json parallel",
  async () => {
    createPathsForTest("bulletin_upload_directory_json_parallel");
    const dirPath = await createTestDirectory("test_site_json_parallel");

    const result = await runBulletinUpload([
      dirPath,
      "--json",
      "--parallel",
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
