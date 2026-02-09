import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../_helpers/cliHelpers";

test("content --help lists subcommands and auth options", async () => {
  const result = await runDotnsCli(["content", "--help"]);
  console.log("result: ", result);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Manage domain content hashes");
  expect(result.combinedOutput).toContain("view");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
  expect(result.combinedOutput).toContain("--account");
});

test("content view --help shows name argument and options", async () => {
  const result = await runDotnsCli(["content", "view", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("View domain content hash");
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("--rpc");
});

test("content set --help shows name and cid arguments", async () => {
  const result = await runDotnsCli(["content", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Set domain content hash");
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("<cid>");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});
