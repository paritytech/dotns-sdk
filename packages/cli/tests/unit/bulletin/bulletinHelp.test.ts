import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("root help lists bulletin command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("bulletin");
});

test("bulletin help shows commands and description", async () => {
  const result = await runDotnsCli(["bulletin", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Bulletin storage utilities");
  expect(result.combinedOutput).toContain("upload");
  expect(result.combinedOutput).toContain("authorize");
  expect(result.combinedOutput).toContain("history");
  expect(result.combinedOutput).toContain("history:remove");
  expect(result.combinedOutput).toContain("history:clear");
});

test("bulletin upload help shows all options", async () => {
  const result = await runDotnsCli(["bulletin", "upload", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Upload a file or directory to Bulletin");
  expect(result.combinedOutput).toContain("<path>");
  expect(result.combinedOutput).toContain("--bulletin-rpc");
  expect(result.combinedOutput).toContain("--chunk-size");
  expect(result.combinedOutput).toContain("--force-chunked");
  expect(result.combinedOutput).toContain("--parallel");
  expect(result.combinedOutput).toContain("--concurrency");
  expect(result.combinedOutput).toContain("--print-contenthash");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--no-history");

  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("bulletin upload help shows default values", async () => {
  const result = await runDotnsCli(["bulletin", "upload", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("wss://bulletin.dotspark.app");
});

test("bulletin authorize help shows all options", async () => {
  const result = await runDotnsCli(["bulletin", "authorize", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Authorize an account for Bulletin TransactionStorage");
  expect(result.combinedOutput).toContain("[address]");
  expect(result.combinedOutput).toContain("--bulletin-rpc");
  expect(result.combinedOutput).toContain("--transactions");
  expect(result.combinedOutput).toContain("--bytes");
  expect(result.combinedOutput).toContain("--sudo-key-uri");
  expect(result.combinedOutput).toContain("--json");

  // Auth options are available for resolving the target address
  // from keystore when no positional address is given
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("bulletin authorize help shows default values", async () => {
  const result = await runDotnsCli(["bulletin", "authorize", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("wss://bulletin.dotspark.app");
  expect(result.combinedOutput).toContain("1000000");
  expect(result.combinedOutput).toContain("//Alice");
});

test("bulletin history help shows options", async () => {
  const result = await runDotnsCli(["bulletin", "history", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("List all uploaded CIDs");
  expect(result.combinedOutput).toContain("--json");
});

test("bulletin history:remove help shows usage", async () => {
  const result = await runDotnsCli(["bulletin", "history:remove", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Remove an upload from history by CID");
  expect(result.combinedOutput).toContain("<cid>");
});

test("bulletin history:clear help shows description", async () => {
  const result = await runDotnsCli(["bulletin", "history:clear", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Clear all upload history");
});

test("bulletin help command shows bulletin help", async () => {
  const result = await runDotnsCli(["bulletin", "help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Bulletin storage utilities");
});

test("bulletin help upload shows upload help", async () => {
  const result = await runDotnsCli(["bulletin", "help", "upload"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Upload a file or directory to Bulletin");
});

test("bulletin help authorize shows authorize help", async () => {
  const result = await runDotnsCli(["bulletin", "help", "authorize"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Authorize an account for Bulletin TransactionStorage");
});

test("bulletin list alias works", async () => {
  const result = await runDotnsCli(["bulletin", "list", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("List all uploaded CIDs");
});
