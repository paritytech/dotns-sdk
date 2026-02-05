import { expect, test } from "bun:test";
import { runDotnsCli } from "../_helpers/cli-helpers";

test("root help lists register command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).toContain("register");
});

test("register help shows options and default status", async () => {
  const result = await runDotnsCli(["register", "--help"]);
  expect(result.exitCode).toBe(0);

  expect(result.combinedOutput).toContain("Register a new DotNS domain");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--status");
  expect(result.combinedOutput).toContain('default: "none"');
  expect(result.combinedOutput).toContain("--reverse");
  expect(result.combinedOutput).toContain("--governance");
  expect(result.combinedOutput).toContain("--owner");
  expect(result.combinedOutput).toContain("--transfer");
  expect(result.combinedOutput).toContain("--to");
  expect(result.combinedOutput).toContain("--account");
  expect(result.combinedOutput).toContain("--password");
  expect(result.combinedOutput).toContain("--keystore-path");
});

test("register parses status none", async () => {
  const result = await runDotnsCli(["register", "--status", "none", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses status lite", async () => {
  const result = await runDotnsCli(["register", "--status", "lite", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses status full", async () => {
  const result = await runDotnsCli(["register", "--status", "full", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses reverse flag", async () => {
  const result = await runDotnsCli(["register", "--reverse", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses governance flag", async () => {
  const result = await runDotnsCli(["register", "--governance", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses owner option", async () => {
  const result = await runDotnsCli([
    "register",
    "--owner",
    "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("register parses transfer with destination", async () => {
  const result = await runDotnsCli([
    "register",
    "--transfer",
    "--to",
    "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("register parses account option", async () => {
  const result = await runDotnsCli(["register", "--account", "alice", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses keystore-path option", async () => {
  const result = await runDotnsCli(["register", "--keystore-path", "/tmp/keystore", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses password option", async () => {
  const result = await runDotnsCli(["register", "--password", "test-password", "--help"]);
  expect(result.exitCode).toBe(0);
});

test("register parses mnemonic option", async () => {
  const result = await runDotnsCli([
    "register",
    "--mnemonic",
    "bottom drive obey lake curtain smoke basket hold race lonely fit walk",
    "--help",
  ]);
  expect(result.exitCode).toBe(0);
});

test("register parses key-uri option", async () => {
  const result = await runDotnsCli(["register", "--key-uri", "//Alice", "--help"]);
  expect(result.exitCode).toBe(0);
});
