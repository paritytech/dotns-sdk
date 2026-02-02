import { expect, test } from "bun:test";
import { runDotnsCli } from "../_helpers/cli-helpers";

test("root help lists bulletin command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("bulletin");
});

test("bulletin help shows commands and description", async () => {
  const result = await runDotnsCli(["bulletin", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Bulletin storage utilities");
  expect(result.combinedOutput).toContain("upload");
  expect(result.combinedOutput).toContain("authorize");
  expect(result.combinedOutput).toContain("Upload a file or directory to Bulletin");
  expect(result.combinedOutput).toContain("Authorize an account to use TransactionStorage");
});

test("bulletin upload help shows all options", async () => {
  const result = await runDotnsCli(["bulletin", "upload", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Upload a file or directory to Bulletin");
  expect(result.combinedOutput).toContain("<path>");
  expect(result.combinedOutput).toContain("--bulletin-rpc");
  expect(result.combinedOutput).toContain("--chunk-size");
  expect(result.combinedOutput).toContain("--force-chunked");
  expect(result.combinedOutput).toContain("--print-contenthash");

  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("bulletin upload help shows default values", async () => {
  const result = await runDotnsCli(["bulletin", "upload", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("wss://bulletin.dotspark.app");
});

test("bulletin authorize help shows all options", async () => {
  const result = await runDotnsCli(["bulletin", "authorize", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Authorize an account to use TransactionStorage");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--bulletin-rpc");
  expect(result.combinedOutput).toContain("--transactions");
  expect(result.combinedOutput).toContain("--bytes");

  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("bulletin authorize help shows default values", async () => {
  const result = await runDotnsCli(["bulletin", "authorize", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("wss://bulletin.dotspark.app");
  expect(result.combinedOutput).toContain("1000000");
});

test("bulletin help command shows bulletin help", async () => {
  const result = await runDotnsCli(["bulletin", "help"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Bulletin storage utilities");
});

test("bulletin help upload shows upload help", async () => {
  const result = await runDotnsCli(["bulletin", "help", "upload"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Upload a file or directory to Bulletin");
});

test("bulletin help authorize shows authorize help", async () => {
  const result = await runDotnsCli(["bulletin", "help", "authorize"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Authorize an account to use TransactionStorage");
});