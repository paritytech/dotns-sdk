import { expect, test } from "bun:test";
import {
  HARNESS_HELP_SUCCESS_EXIT_CODE,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
} from "../../_helpers/cliHelpers";

test("register domain --help shows --json option", async () => {
  const result = await runDotnsCli(["register", "domain", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});

test("register subname --help shows --json option", async () => {
  const result = await runDotnsCli(["register", "subname", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});

test("register domain --json emits JSON error when --transfer without --to", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--name",
    "testlabel",
    "--transfer",
    "--key-uri",
    "//Alice",
    "--json",
  ]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const errorOutput = result.standardError.trim();
  const parsed = JSON.parse(errorOutput);
  expect(parsed.error).toContain("Missing transfer destination");
});
