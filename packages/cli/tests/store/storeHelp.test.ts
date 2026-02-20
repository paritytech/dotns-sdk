import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../_helpers/cliHelpers";

test("store --help lists subcommands", async () => {
  const result = await runDotnsCli(["store", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Manage your on-chain Store");
  expect(result.combinedOutput).toContain("info");
  expect(result.combinedOutput).toContain("list");
  expect(result.combinedOutput).toContain("get");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("delete");
  expect(result.combinedOutput).toContain("check");
  expect(result.combinedOutput).toContain("authorize ");
  expect(result.combinedOutput).toContain("unauthorize ");
  expect(result.combinedOutput).toContain("authorize-controller");
  expect(result.combinedOutput).toContain("unauthorize-controller");
});

test("store info --help shows auth options", async () => {
  const result = await runDotnsCli(["store", "info", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Show Store address");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--rpc");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("store list --help shows options", async () => {
  const result = await runDotnsCli(["store", "list", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("List all values");
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("--rpc");
});

test("store get --help shows key argument", async () => {
  const result = await runDotnsCli(["store", "get", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Get a value by key");
  expect(result.combinedOutput).toContain("<key>");
  expect(result.combinedOutput).toContain("--json");
});

test("store set --help shows key and value arguments with auth", async () => {
  const result = await runDotnsCli(["store", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Set a key-value pair");
  expect(result.combinedOutput).toContain("<key>");
  expect(result.combinedOutput).toContain("<value>");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("store delete --help shows key argument with auth", async () => {
  const result = await runDotnsCli(["store", "delete", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Delete a value");
  expect(result.combinedOutput).toContain("<key>");
  expect(result.combinedOutput).toContain("--mnemonic");
});

test("store check --help shows address argument", async () => {
  const result = await runDotnsCli(["store", "check", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Check whether an address");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--json");
});

test("store authorize --help shows address argument with auth", async () => {
  const result = await runDotnsCli(["store", "authorize", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Authorize an address");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
});

test("store unauthorize --help shows address argument", async () => {
  const result = await runDotnsCli(["store", "unauthorize", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Revoke write access");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--mnemonic");
});

test("store authorize-controller --help shows address argument", async () => {
  const result = await runDotnsCli(["store", "authorize-controller", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("DotNS controller");
  expect(result.combinedOutput).toContain("<address>");
  expect(result.combinedOutput).toContain("--mnemonic");
});

test("store unauthorize-controller --help shows address argument", async () => {
  const result = await runDotnsCli(["store", "unauthorize-controller", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Revoke DotNS controller");
  expect(result.combinedOutput).toContain("<address>");
});
