import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("account --help lists subcommands including is-mapped, is-whitelisted, whitelist", async () => {
  const result = await runDotnsCli(["account", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Account management");
  expect(result.combinedOutput).toContain("address");
  expect(result.combinedOutput).toContain("info");
  expect(result.combinedOutput).toContain("map");
  expect(result.combinedOutput).toContain("is-mapped");
  expect(result.combinedOutput).toContain("is-whitelisted");
  expect(result.combinedOutput).toContain("whitelist");
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

test("account is-whitelisted --help shows address argument and --json", async () => {
  const result = await runDotnsCli(["account", "is-whitelisted", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Check if an address is whitelisted");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--env");
  expect(result.combinedOutput).toContain("paseo-v2");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("account whitelist --help shows address argument, --remove, and --json", async () => {
  const result = await runDotnsCli(["account", "whitelist", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Whitelist an address on the DotNS Controller");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("-r, --remove");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--env");
  expect(result.combinedOutput).toContain("--network");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("account is alias works for is-mapped", async () => {
  const result = await runDotnsCli(["account", "is", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Check if a Substrate or EVM address is mapped");
});

test("account iw alias works for is-whitelisted", async () => {
  const result = await runDotnsCli(["account", "iw", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Check if an address is whitelisted");
});
