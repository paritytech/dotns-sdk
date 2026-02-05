import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { ENV, resolveKeystorePath } from "../env";
import { readLine, readSecret, promptNewPassword, getPasswordForDecrypt } from "../io";
import { normalizeAccountName } from "../keystore/payload";
import {
  pathExists,
  readKeystoreFile,
  writeKeystoreFile,
  deleteKeystoreFile,
} from "../keystore/file";
import { encryptKeystorePayload, decryptKeystorePayload } from "../keystore/crypto";
import type { StoredAuth } from "../keystore/types";
import type {
  AccountKeystorePayload,
  AuthType,
  CommandOptions,
  KeystoreDirectoryInfo,
} from "../../types/types";

const DEFAULT_ACCOUNT_POINTER_FILE = ".default";
const KEYSTORE_FILE_EXTENSION = ".json";

const MNEMONIC_PROMPT = "mnemonic";
const KEY_URI_PROMPT = "key-uri";
const AUTH_TYPE_UNKNOWN: AuthType = "unknown";

function getMergedOptions(command: Command | undefined, fallback: CommandOptions): CommandOptions {
  const mergedOptions: CommandOptions = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts() as CommandOptions;
      for (const key in parentOptions) {
        const optionKey = key as keyof CommandOptions;
        if (!(optionKey in mergedOptions) && parentOptions[optionKey] !== undefined) {
          mergedOptions[optionKey] = parentOptions[optionKey];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}

function resolvePasswordForCreate(options: CommandOptions): Promise<string> | string {
  const fromCli = String(options.password ?? "").trim();
  if (fromCli) return fromCli;

  const fromEnv = String(process.env[ENV.KEYSTORE_PASSWORD] ?? "").trim();
  if (fromEnv) return fromEnv;

  return promptNewPassword();
}

function accountFilePath(keystoreDir: string, accountName: string): string {
  return path.join(keystoreDir, `${accountName}${KEYSTORE_FILE_EXTENSION}`);
}

function getKeystoreDirFromOptions(maybeKeystorePath: string | undefined): string {
  return resolveKeystorePath(maybeKeystorePath);
}

async function ensureKeystoreDirExists(keystoreDir: string): Promise<void> {
  await fs.mkdir(keystoreDir, { recursive: true });
}

async function readDefaultAccountName(keystoreDir: string): Promise<string | undefined> {
  try {
    const pointerFilePath = path.join(keystoreDir, DEFAULT_ACCOUNT_POINTER_FILE);
    const fileContent = await fs.readFile(pointerFilePath, "utf8");
    const accountName = fileContent.trim();
    return accountName.length ? accountName : undefined;
  } catch {
    return undefined;
  }
}

async function writeDefaultAccountName(keystoreDir: string, accountName: string): Promise<void> {
  const pointerFilePath = path.join(keystoreDir, DEFAULT_ACCOUNT_POINTER_FILE);
  await fs.writeFile(pointerFilePath, `${accountName}\n`, "utf8");
}

async function clearDefaultAccountName(keystoreDir: string): Promise<void> {
  const pointerFilePath = path.join(keystoreDir, DEFAULT_ACCOUNT_POINTER_FILE);
  try {
    await fs.unlink(pointerFilePath);
  } catch {}
}

async function listAccountFiles(keystoreDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(keystoreDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(KEYSTORE_FILE_EXTENSION))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function getKeystoreDirectoryInfo(keystoreDir: string): Promise<KeystoreDirectoryInfo> {
  const exists = await pathExists(keystoreDir);
  if (!exists) {
    return {
      directoryPath: keystoreDir,
      exists: false,
      accountFiles: [],
    };
  }

  const defaultAccount = await readDefaultAccountName(keystoreDir);
  const accountFiles = await listAccountFiles(keystoreDir);

  return {
    directoryPath: keystoreDir,
    exists: true,
    defaultAccount,
    accountFiles,
  };
}

async function determineAuthType(accountFilePath: string, password: string): Promise<AuthType> {
  try {
    const encrypted = await readKeystoreFile(accountFilePath);
    const decrypted = decryptKeystorePayload(encrypted, password) as AccountKeystorePayload;

    const auth = decrypted?.auth as StoredAuth | undefined;
    if (auth?.keyUri) return KEY_URI_PROMPT;
    if (auth?.mnemonic) return MNEMONIC_PROMPT;
    return AUTH_TYPE_UNKNOWN;
  } catch {
    return AUTH_TYPE_UNKNOWN;
  }
}

export function attachAuthCommands(root: Command): void {
  const authCommand = root.command("auth").description("Manage encrypted keystore");

  authCommand
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .option("--password <pw>", `Keystore password (env: ${ENV.KEYSTORE_PASSWORD})`);

  authCommand
    .command("set")
    .description("Encrypt and store a mnemonic or key-uri into a per-account keystore file")
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .option("--account <name>", "Account name to store under")
    .option("--password <pw>", `Keystore password (env: ${ENV.KEYSTORE_PASSWORD})`)
    .option("-m, --mnemonic <phrase>", `Mnemonic to store (env: ${ENV.MNEMONIC})`)
    .option("-k, --key-uri <uri>", `Key URI to store (env: ${ENV.KEY_URI})`)
    .action(async (options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const keystoreDir = getKeystoreDirFromOptions(mergedOptions.keystorePath);
        await ensureKeystoreDirExists(keystoreDir);

        const accountName = normalizeAccountName(mergedOptions.account);
        const filePath = accountFilePath(keystoreDir, accountName);

        const mnemonic = mergedOptions.mnemonic ?? process.env[ENV.MNEMONIC];
        const keyUri = mergedOptions.keyUri ?? process.env[ENV.KEY_URI];

        let storedAuth: StoredAuth;

        if (mnemonic && keyUri) throw new Error("Provide only one of mnemonic or key-uri");

        if (mnemonic) {
          storedAuth = { mnemonic };
        } else if (keyUri) {
          storedAuth = { keyUri };
        } else {
          const authType = (await readLine("Store (mnemonic/key-uri): ")).toLowerCase();
          if (authType === MNEMONIC_PROMPT) {
            const mnemonicValue = await readSecret("Mnemonic: ");
            if (!mnemonicValue) throw new Error("Empty mnemonic");
            storedAuth = { mnemonic: mnemonicValue };
          } else if (authType === KEY_URI_PROMPT || authType === "keyuri") {
            const keyUriValue = await readSecret("Key URI: ");
            if (!keyUriValue) throw new Error("Empty key-uri");
            storedAuth = { keyUri: keyUriValue };
          } else {
            throw new Error("Invalid choice (use mnemonic or key-uri)");
          }
        }

        const exists = await pathExists(filePath);

        let password: string;
        if (exists) {
          password = await getPasswordForDecrypt(mergedOptions.password);
          const existingEncrypted = await readKeystoreFile(filePath);
          decryptKeystorePayload(existingEncrypted, password);
        } else {
          password = await resolvePasswordForCreate(mergedOptions);
        }

        const payload: AccountKeystorePayload = {
          version: 1,
          account: accountName,
          auth: storedAuth,
          updatedAtIso: new Date().toISOString(),
        };

        const encrypted = encryptKeystorePayload(payload as any, password);
        await writeKeystoreFile(filePath, encrypted);
        await writeDefaultAccountName(keystoreDir, accountName);

        console.log(chalk.green("✓ Keystore updated"));
        console.log(chalk.gray("  dir:     ") + chalk.white(keystoreDir));
        console.log(chalk.gray("  file:    ") + chalk.white(filePath));
        console.log(chalk.gray("  account: ") + chalk.white(accountName));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("list")
    .description("List stored account names (does not reveal secrets)")
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .option("--password <pw>", `Keystore password (env: ${ENV.KEYSTORE_PASSWORD})`)
    .action(async (options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const keystoreDir = getKeystoreDirFromOptions(mergedOptions.keystorePath);
        const keystoreInfo = await getKeystoreDirectoryInfo(keystoreDir);

        console.log(chalk.gray("  dir:    ") + chalk.white(keystoreInfo.directoryPath));
        console.log(chalk.gray("  exists: ") + chalk.white(String(keystoreInfo.exists)));

        if (!keystoreInfo.exists) process.exit(0);

        if (keystoreInfo.defaultAccount) {
          console.log(chalk.gray("  default: ") + chalk.white(keystoreInfo.defaultAccount));
        }

        if (keystoreInfo.accountFiles.length === 0) {
          console.log(chalk.gray("  accounts: ") + chalk.white("(none)"));
          process.exit(0);
        }

        const passwordFromCli = String(mergedOptions.password ?? "").trim();
        const passwordFromEnv = String(process.env[ENV.KEYSTORE_PASSWORD] ?? "").trim();
        const hasPassword = Boolean(passwordFromCli || passwordFromEnv);

        let password: string | undefined;
        if (hasPassword) password = await getPasswordForDecrypt(mergedOptions.password);

        console.log(chalk.bold("\nAccounts\n"));
        for (const file of keystoreInfo.accountFiles) {
          const accountName = path.basename(file, KEYSTORE_FILE_EXTENSION);
          const defaultMarker =
            keystoreInfo.defaultAccount && accountName === keystoreInfo.defaultAccount
              ? chalk.green("*")
              : " ";

          if (!password) {
            console.log(
              `  ${defaultMarker} ${chalk.white(accountName)} ${chalk.gray("(encrypted)")}`,
            );
            continue;
          }

          const fullPath = path.join(keystoreDir, file);
          const authKind = await determineAuthType(fullPath, password);

          console.log(
            `  ${defaultMarker} ${chalk.white(accountName)} ${chalk.gray(`(${authKind})`)}`,
          );
        }

        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("use <account>")
    .description("Set the default keystore account")
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .action(async (account: string, options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const keystoreDir = getKeystoreDirFromOptions(mergedOptions.keystorePath);
        if (!(await pathExists(keystoreDir))) throw new Error("Keystore directory not found");

        const accountName = normalizeAccountName(account);
        const filePath = accountFilePath(keystoreDir, accountName);
        if (!(await pathExists(filePath))) throw new Error(`Account not found: ${accountName}`);

        await writeDefaultAccountName(keystoreDir, accountName);

        console.log(chalk.green("✓ Default account updated"));
        console.log(chalk.gray("  account: ") + chalk.white(accountName));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("remove <account>")
    .description("Remove a stored account from the keystore")
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .action(async (account: string, options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const keystoreDir = getKeystoreDirFromOptions(mergedOptions.keystorePath);
        if (!(await pathExists(keystoreDir))) throw new Error("Keystore directory not found");

        const accountName = normalizeAccountName(account);
        const filePath = accountFilePath(keystoreDir, accountName);
        if (!(await pathExists(filePath))) throw new Error(`Account not found: ${accountName}`);

        await deleteKeystoreFile(filePath);

        const currentDefault = await readDefaultAccountName(keystoreDir);
        if (currentDefault === accountName) {
          const remainingFiles = await listAccountFiles(keystoreDir);
          if (remainingFiles.length === 0) {
            await clearDefaultAccountName(keystoreDir);
          } else {
            const nextDefault = path.basename(remainingFiles[0]!, KEYSTORE_FILE_EXTENSION);
            await writeDefaultAccountName(keystoreDir, nextDefault);
          }
        }

        console.log(chalk.green("✓ Account removed"));
        console.log(chalk.gray("  account: ") + chalk.white(accountName));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  authCommand
    .command("clear")
    .description("Delete all local keystore accounts (directory)")
    .option("--keystore-path <path>", `Keystore directory (env: ${ENV.KEYSTORE_PATH})`)
    .action(async (options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const keystoreDir = getKeystoreDirFromOptions(mergedOptions.keystorePath);

        const keystoreInfo = await getKeystoreDirectoryInfo(keystoreDir);
        if (!keystoreInfo.exists) {
          console.log(chalk.green("✓ Keystore cleared"));
          console.log(chalk.gray("  dir: ") + chalk.white(keystoreDir));
          process.exit(0);
        }

        for (const file of keystoreInfo.accountFiles) {
          await deleteKeystoreFile(path.join(keystoreDir, file));
        }
        await clearDefaultAccountName(keystoreDir);

        console.log(chalk.green("✓ Keystore cleared"));
        console.log(chalk.gray("  dir: ") + chalk.white(keystoreDir));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });
}
