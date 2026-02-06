import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../_helpers/cliHelpers";

test("lookup --help lists subcommands and auth options", async () => {
  const result = await runDotnsCli(["lookup", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Lookup domain information");
  expect(result.combinedOutput).toContain("name");
  expect(result.combinedOutput).toContain("owner-of");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
  expect(result.combinedOutput).toContain("--name");
});

test("lookup name --help shows label argument and options", async () => {
  const result = await runDotnsCli(["lookup", "name", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Lookup comprehensive domain information");
  expect(result.combinedOutput).toContain("[label]");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--rpc");
});

test("lookup owner-of --help shows label argument and options", async () => {
  const result = await runDotnsCli(["lookup", "owner-of", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Show whether a name is registered");
  expect(result.combinedOutput).toContain("<label>");
  expect(result.combinedOutput).toContain("--rpc");
});
