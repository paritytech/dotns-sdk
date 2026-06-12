import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("primary --help lists set, status and auth options", async () => {
  const result = await runDotnsCli(["primary", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("primary (reverse) name");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("status");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("primary set --help shows name argument and --json", async () => {
  const result = await runDotnsCli(["primary", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("Set one of your names as the primary");
  expect(result.combinedOutput).toContain("--json");
});

test("primary status --help shows optional address argument and --json", async () => {
  const result = await runDotnsCli(["primary", "status", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("[address]");
  expect(result.combinedOutput).toContain("Show the primary name");
  expect(result.combinedOutput).toContain("--json");
});
