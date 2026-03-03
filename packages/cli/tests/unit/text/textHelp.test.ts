import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("text --help lists subcommands and auth options", async () => {
  const result = await runDotnsCli(["text", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Manage domain text records");
  expect(result.combinedOutput).toContain("view");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
  expect(result.combinedOutput).toContain("--account");
});

test("text view --help shows name and key arguments", async () => {
  const result = await runDotnsCli(["text", "view", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("View a domain text record");
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("<key>");
  expect(result.combinedOutput).toContain("--rpc");
});

test("text set --help shows name, key, and value arguments", async () => {
  const result = await runDotnsCli(["text", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Set a domain text record");
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("<key>");
  expect(result.combinedOutput).toContain("[value]");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});
