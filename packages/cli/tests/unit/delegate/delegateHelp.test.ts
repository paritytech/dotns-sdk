import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("delegate --help lists set, revoke, status, records and auth options", async () => {
  const result = await runDotnsCli(["delegate", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("manage and transfer one of your names");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("revoke");
  expect(result.combinedOutput).toContain("status");
  expect(result.combinedOutput).toContain("records");
  expect(result.combinedOutput).toContain("records-status");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("delegate records --help shows operator argument and --revoke", async () => {
  const result = await runDotnsCli(["delegate", "records", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<operator>");
  expect(result.combinedOutput).toContain("edit records on all");
  expect(result.combinedOutput).toContain("--revoke");
  expect(result.combinedOutput).toContain("--json");
});

test("delegate records-status --help shows operator argument and --json", async () => {
  const result = await runDotnsCli(["delegate", "records-status", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<operator>");
  expect(result.combinedOutput).toContain("edit records on all");
  expect(result.combinedOutput).toContain("--json");
});

test("delegate set --help shows name and delegate arguments", async () => {
  const result = await runDotnsCli(["delegate", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("<delegate>");
  expect(result.combinedOutput).toContain("--json");
});

test("delegate revoke --help shows name argument", async () => {
  const result = await runDotnsCli(["delegate", "revoke", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("Revoke any delegate");
  expect(result.combinedOutput).toContain("--json");
});

test("delegate status --help shows name argument and --json", async () => {
  const result = await runDotnsCli(["delegate", "status", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("Show the current delegate");
  expect(result.combinedOutput).toContain("--json");
});
