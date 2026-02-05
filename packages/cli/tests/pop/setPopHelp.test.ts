import { expect, test } from "bun:test";
import { runDotnsCli } from "../_helpers/cli-helpers";

test("root help lists pop command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("pop");
});

test("pop help shows commands and description", async () => {
  const result = await runDotnsCli(["pop", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("ProofOfPersonhood status management");
  expect(result.combinedOutput).toContain("set [options] <status>");
  expect(result.combinedOutput).toContain("Set ProofOfPersonhood status (none, lite, or full)");
  expect(result.combinedOutput).toContain("info [options]");
  expect(result.combinedOutput).toContain("Display ProofOfPersonhood status");
});

test("pop help shows auth options", async () => {
  const result = await runDotnsCli(["pop", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("--rpc <wsUrl>");
  expect(result.combinedOutput).toContain("--keystore-path <path>");
  expect(result.combinedOutput).toContain("--account <name>");
  expect(result.combinedOutput).toContain("--password <pw>");
  expect(result.combinedOutput).toContain("--mnemonic <phrase>");
  expect(result.combinedOutput).toContain("--key-uri <uri>");
});

test("pop set help shows status parameter", async () => {
  const result = await runDotnsCli(["pop", "set", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Usage: dotns pop set");
  expect(result.combinedOutput).toContain("Set ProofOfPersonhood status (none, lite, or full)");
  expect(result.combinedOutput).toContain("<status>");
  expect(result.combinedOutput).toContain("none, lite, or full");
});

test("pop set help shows auth options", async () => {
  const result = await runDotnsCli(["pop", "set", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("--rpc <wsUrl>");
  expect(result.combinedOutput).toContain("--keystore-path <path>");
  expect(result.combinedOutput).toContain("--account <name>");
  expect(result.combinedOutput).toContain("--password <pw>");
  expect(result.combinedOutput).toContain("--mnemonic <phrase>");
  expect(result.combinedOutput).toContain("--key-uri <uri>");
});

test("pop info help shows description", async () => {
  const result = await runDotnsCli(["pop", "info", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Usage: dotns pop info");
  expect(result.combinedOutput).toContain("Display ProofOfPersonhood status");
});

test("pop info help shows auth options", async () => {
  const result = await runDotnsCli(["pop", "info", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("--rpc <wsUrl>");
  expect(result.combinedOutput).toContain("--keystore-path <path>");
  expect(result.combinedOutput).toContain("--account <name>");
  expect(result.combinedOutput).toContain("--password <pw>");
  expect(result.combinedOutput).toContain("--mnemonic <phrase>");
  expect(result.combinedOutput).toContain("--key-uri <uri>");
});

test("pop set parses rpc option at pop level", async () => {
  const result = await runDotnsCli(["pop", "--rpc", "wss://custom.com", "set", "lite", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses rpc option at set level", async () => {
  const result = await runDotnsCli(["pop", "set", "lite", "--rpc", "wss://custom.com", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses keystore-path option", async () => {
  const result = await runDotnsCli([
    "pop",
    "--keystore-path",
    "/custom/path",
    "set",
    "lite",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses account option at pop level", async () => {
  const result = await runDotnsCli(["pop", "--account", "test", "set", "lite", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses account option at set level", async () => {
  const result = await runDotnsCli(["pop", "set", "lite", "--account", "test", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses password option", async () => {
  const result = await runDotnsCli(["pop", "set", "lite", "--password", "test123", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses mnemonic option", async () => {
  const result = await runDotnsCli([
    "pop",
    "set",
    "lite",
    "--mnemonic",
    "bottom drive obey lake curtain smoke basket hold race lonely fit walk",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses key-uri option", async () => {
  const result = await runDotnsCli(["pop", "set", "lite", "--key-uri", "//Alice", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("pop info parses auth options at pop level", async () => {
  const result = await runDotnsCli([
    "pop",
    "--account",
    "test",
    "--password",
    "pass",
    "info",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("pop info parses auth options at info level", async () => {
  const result = await runDotnsCli([
    "pop",
    "info",
    "--account",
    "test",
    "--password",
    "pass",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("pop set parses mixed options across levels", async () => {
  const result = await runDotnsCli([
    "pop",
    "--password",
    "test",
    "set",
    "lite",
    "--account",
    "acc",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("pop help command shows pop help", async () => {
  const result = await runDotnsCli(["pop", "help"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("ProofOfPersonhood status management");
});

test("pop help set shows set help", async () => {
  const result = await runDotnsCli(["pop", "help", "set"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Usage: dotns pop set");
});

test("pop help info shows info help", async () => {
  const result = await runDotnsCli(["pop", "help", "info"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("Usage: dotns pop info");
});
