import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("pop set --help shows --json option", async () => {
  const result = await runDotnsCli(["pop", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});

test("pop info --help shows --json option", async () => {
  const result = await runDotnsCli(["pop", "info", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});
