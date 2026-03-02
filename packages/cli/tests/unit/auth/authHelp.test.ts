import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("root help lists auth command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("auth");
  expect(result.combinedOutput).toContain("Manage encrypted keystore");
});

test("auth help shows options and subcommands", async () => {
  const result = await runDotnsCli(["auth", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Manage encrypted keystore");
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PASSWORD");

  expect(result.combinedOutput).toContain("Commands:");
  expect(result.combinedOutput).toContain("set");
  expect(result.combinedOutput).toContain("list");
  expect(result.combinedOutput).toContain("use");
  expect(result.combinedOutput).toContain("remove");
  expect(result.combinedOutput).toContain("clear");
});

test("auth set help shows all options", async () => {
  const result = await runDotnsCli(["auth", "set", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain(
    "Encrypt and store a mnemonic or key-uri into a per-account keystore file",
  );
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--mnemonic");
  expect(result.combinedOutput).toContain("--key-uri");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PASSWORD");
  expect(result.combinedOutput).toContain("DOTNS_MNEMONIC");
  expect(result.combinedOutput).toContain("DOTNS_KEY_URI");
});

test("auth list help shows options", async () => {
  const result = await runDotnsCli(["auth", "list", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("List stored account names");
  expect(result.combinedOutput).toContain("does not reveal secrets");
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PASSWORD");
});

test("auth use help shows options", async () => {
  const result = await runDotnsCli(["auth", "use", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Set the default keystore account");
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
  expect(result.combinedOutput).toContain("<account>");
});

test("auth remove help shows options", async () => {
  const result = await runDotnsCli(["auth", "remove", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Remove a stored account from the keystore");
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
  expect(result.combinedOutput).toContain("<account>");
});

test("auth clear help shows options", async () => {
  const result = await runDotnsCli(["auth", "clear", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Delete all local keystore accounts");
  expect(result.combinedOutput).toContain("--keystore-path");
  expect(result.combinedOutput).toContain("DOTNS_KEYSTORE_PATH");
});

test("auth parses keystore-path option", async () => {
  const result = await runDotnsCli(["auth", "--keystore-path", "/tmp/keystore", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("auth parses password option", async () => {
  const result = await runDotnsCli(["auth", "--password", "test-password", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("auth set parses account option", async () => {
  const result = await runDotnsCli(["auth", "set", "--account", "alice", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("auth set parses mnemonic option", async () => {
  const result = await runDotnsCli([
    "auth",
    "set",
    "--mnemonic",
    "bottom drive obey lake curtain smoke basket hold race lonely fit walk",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("auth set parses key-uri option", async () => {
  const result = await runDotnsCli(["auth", "set", "--key-uri", "//Alice", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("auth help command shows help", async () => {
  const result = await runDotnsCli(["auth", "help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Manage encrypted keystore");
});

test("auth help set shows set command help", async () => {
  const result = await runDotnsCli(["auth", "help", "set"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Encrypt and store a mnemonic or key-uri");
});

test("auth help list shows list command help", async () => {
  const result = await runDotnsCli(["auth", "help", "list"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("List stored account names");
});

test("auth help use shows use command help", async () => {
  const result = await runDotnsCli(["auth", "help", "use"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Set the default keystore account");
});

test("auth help remove shows remove command help", async () => {
  const result = await runDotnsCli(["auth", "help", "remove"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Remove a stored account from the keystore");
});

test("auth help clear shows clear command help", async () => {
  const result = await runDotnsCli(["auth", "help", "clear"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Delete all local keystore accounts");
});
