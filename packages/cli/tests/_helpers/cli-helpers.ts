import { Command, CommanderError } from "commander";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { expect } from "bun:test";
import fs from "node:fs/promises";

import { attachAuthCommands } from "../../src/cli/commands/auth";
import { attachRegisterCommand } from "../../src/cli/commands/register-command";
import { pathExists, readKeystoreFile } from "../../src/cli/keystore/file";
import { decryptKeystorePayload } from "../../src/cli/keystore/crypto";
import { attachLookupCommands } from "../../src/cli/commands/lookup";
import { attachBulletinCommands } from "../../src/cli/commands/bulletin";
import { attachPopCommands } from "../../src/cli/commands/pop";
import { attachContentCommands } from "../../src/cli/commands/content";

export type Output = { exitCode: number; combinedOutput: string };
export type CliRunResult = {
  exitCode: number;
  standardOutput: string;
  standardError: string;
  combinedOutput: string;
};

class ProcessExitError extends Error {
  public readonly exitCode: number;

  constructor(exitCode: number) {
    super(`process.exit(${exitCode})`);
    this.exitCode = exitCode;
  }
}

export type TestKeystorePaths = {
  temporaryDirectoryPath: string;
  keystoreDirectoryPath: string;
};

export function createTestKeystorePaths(testFileUrl: string, testName: string): TestKeystorePaths {
  const testFilePath = new URL(testFileUrl).pathname;

  const repositoryRootGuess = process.cwd();
  const testTemporaryRoot = path.join(repositoryRootGuess, "tests", ".tmp");

  const safeTestFileName = path.basename(testFilePath).replaceAll(/[^\w.-]/g, "_");
  const safeTestName = testName.replaceAll(/[^\w.-]/g, "_");

  const temporaryDirectoryPath = path.join(testTemporaryRoot, safeTestFileName, safeTestName);

  mkdirSync(temporaryDirectoryPath, { recursive: true });

  const keystoreDirectoryPath = path.join(temporaryDirectoryPath, "keystore");

  return { temporaryDirectoryPath, keystoreDirectoryPath };
}

export function cleanupTestTemporaryDirectory(temporaryDirectoryPath: string): void {
  rmSync(temporaryDirectoryPath, { recursive: true, force: true });
}

export function createDotnsTestProgram(): Command {
  const rootCommand = new Command();
  rootCommand.name("dotns");
  rootCommand.exitOverride();

  rootCommand.option("--keystore-path <path>").option("--password <pw>");
  attachBulletinCommands(rootCommand);
  attachPopCommands(rootCommand);
  attachAuthCommands(rootCommand);
  attachRegisterCommand(rootCommand);
  attachLookupCommands(rootCommand);
  attachContentCommands(rootCommand);
  return rootCommand;
}

export async function runDotnsCli(
  argumentsList: string[],
  environment?: Record<string, string | undefined>,
): Promise<CliRunResult> {
  const program = createDotnsTestProgram();
  const originalProcessExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  const standardOutputChunks: string[] = [];
  const standardErrorChunks: string[] = [];

  const outputConfiguration = {
    writeOut: (text: string) => {
      standardOutputChunks.push(text);
    },
    writeErr: (text: string) => {
      standardErrorChunks.push(text);
    },
  };

  {
    const stack: Command[] = [program];
    while (stack.length > 0) {
      const current = stack.pop()!;
      current.configureOutput(outputConfiguration);
      for (const child of current.commands) stack.push(child);
    }
  }

  const previousEnvironmentValues: Record<string, string | undefined> = {};
  if (environment) {
    for (const [key, value] of Object.entries(environment)) {
      previousEnvironmentValues[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  (process as any).exit = (exitCode?: number) => {
    throw new ProcessExitError(Number(exitCode ?? 0));
  };

  console.log = (...values: any[]) => {
    standardOutputChunks.push(values.map((value) => String(value)).join(" ") + "\n");
  };

  console.error = (...values: any[]) => {
    if (values.length === 1 && String(values[0]).includes("process.exit(0)")) return;
    standardErrorChunks.push(values.map((value) => String(value)).join(" ") + "\n");
  };

  let exitCode = 0;

  try {
    await program.parseAsync(argumentsList, { from: "user" });
  } catch (error: any) {
    if (error instanceof ProcessExitError) {
      exitCode = error.exitCode;
    } else if (error instanceof CommanderError) {
      if (error.cause instanceof ProcessExitError) {
        exitCode = error.cause.exitCode;
      } else {
        exitCode = error.exitCode ?? 1;
      }
    } else {
      exitCode = 1;
      standardErrorChunks.push(String(error?.message ?? error) + "\n");
    }
  } finally {
    (process as any).exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    if (environment) {
      for (const [key, value] of Object.entries(previousEnvironmentValues)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const standardOutput = standardOutputChunks.join("");
  const standardError = standardErrorChunks.join("");
  const combinedOutput = standardOutput + standardError;

  return { exitCode, standardOutput, standardError, combinedOutput };
}

export async function readKeystoreDirectory(
  keystoreDirectoryPath: string,
  password: string,
): Promise<{ defaultAccount?: string; accounts: Record<string, any> }> {
  const accounts: Record<string, any> = {};

  if (!(await pathExists(keystoreDirectoryPath))) {
    return { accounts };
  }

  const defaultPointerPath = path.join(keystoreDirectoryPath, ".default");
  let defaultAccount: string | undefined;

  try {
    const defaultContent = await fs.readFile(defaultPointerPath, "utf8");
    defaultAccount = defaultContent.trim();
  } catch {
    defaultAccount = undefined;
  }

  const entries = await fs.readdir(keystoreDirectoryPath, { withFileTypes: true });
  const accountFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  for (const accountFile of accountFiles) {
    const accountFilePath = path.join(keystoreDirectoryPath, accountFile.name);

    try {
      const encrypted = await readKeystoreFile(accountFilePath);
      const decrypted: any = decryptKeystorePayload(encrypted, password);

      // Use the account name from the payload, not the filename
      // The filename may have sanitized characters (e.g., @ -> _)
      const accountName = decrypted.account || path.basename(accountFile.name, ".json");
      accounts[accountName] = decrypted.auth;
    } catch {
      continue;
    }
  }

  return { defaultAccount, accounts };
}

export async function createDefaultAccountKeystore(
  keystoreDirectoryPath: string,
  keystorePassword: string,
  accountName: string = "default",
): Promise<{ testMnemonic: string }> {
  const testMnemonic = "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

  const createResult = await runDotnsCli([
    "--keystore-path",
    keystoreDirectoryPath,
    "--password",
    keystorePassword,
    "auth",
    "set",
    "--account",
    accountName,
    "--mnemonic",
    testMnemonic,
  ]);

  expect(createResult.exitCode).toBe(1);

  return { testMnemonic };
}

export function generateGovernanceLabel(maxLen = 5): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const len = Math.max(1, Math.min(5, maxLen));
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
