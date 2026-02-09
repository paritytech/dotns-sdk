import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../_helpers/cliHelpers";

test("lookup --help lists subcommands and auth options", async () => {
  const result = await runDotnsCli(["lookup", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Lookup domain information");
  expect(result.combinedOutput).toContain("name");
  expect(result.combinedOutput).toContain("owner-of");
  expect(result.combinedOutput).toContain("transfer");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--json");
});

test("lookup name --help shows label argument and options", async () => {
  const result = await runDotnsCli(["lookup", "name", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Lookup comprehensive domain information");
  expect(result.combinedOutput).toContain("[label]");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--rpc");
});

test("lookup owner-of --help shows label argument and options", async () => {
  const result = await runDotnsCli(["lookup", "owner-of", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Show whether a name is registered");
  expect(result.combinedOutput).toContain("<label>");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--rpc");
});

test("lookup transfer --help shows label argument and destination option", async () => {
  const result = await runDotnsCli(["lookup", "transfer", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Transfer domain ownership");
  expect(result.combinedOutput).toContain("[label]");
  expect(result.combinedOutput).toContain("-d, --destination");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("lookup transfer parses destination at transfer level", async () => {
  const result = await runDotnsCli([
    "lookup",
    "transfer",
    "test",
    "-d",
    "0x0000000000000000000000000000000000000001",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("lookup transfer parses auth options at lookup level", async () => {
  const result = await runDotnsCli([
    "lookup",
    "--key-uri",
    "//Alice",
    "transfer",
    "test",
    "-d",
    "0x0000000000000000000000000000000000000001",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});
