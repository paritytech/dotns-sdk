import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("account --help lists subcommands including is-mapped and grant", async () => {
  const result = await runDotnsCli(["account", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Account management");
  expect(result.combinedOutput).toContain("address");
  expect(result.combinedOutput).toContain("info");
  expect(result.combinedOutput).toContain("map");
  expect(result.combinedOutput).toContain("is-mapped");
  expect(result.combinedOutput).toContain("grant");
});

test("account is-mapped --help shows address argument and --json", async () => {
  const result = await runDotnsCli(["account", "is-mapped", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Check if a Substrate or EVM address is mapped");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--env");
  expect(result.combinedOutput).toContain("paseo-v2");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("account grant --help shows label argument and --json", async () => {
  const result = await runDotnsCli(["account", "grant", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("grant");
  expect(result.combinedOutput).toContain("<label>");
  expect(result.combinedOutput).toContain("--json");
});
