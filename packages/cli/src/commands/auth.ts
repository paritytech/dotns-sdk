import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { getPolkadotSigner } from "polkadot-api/signer";
import type { PolkadotSigner } from "polkadot-api";
import path from "node:path";
import fs from "node:fs/promises";

import { DEFAULT_MNEMONIC } from "../utils/constants";
import { ENV, resolveKeystorePath } from "../cli/env";
import { getPasswordForDecrypt } from "../cli/io";
import { pathExists, readKeystoreFile } from "../cli/keystore/file";
import { decryptKeystorePayload } from "../cli/keystore/crypto";
import { normalizeAccountName } from "../cli/keystore/payload";
import type { ResolvedAuthSource, AccountKeystorePayload, AuthSource } from "../types/types";

export async function createAccountFromSource(source: string, isKeyUri: boolean) {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519" });
  return isKeyUri ? keyring.addFromUri(source) : keyring.addFromMnemonic(source);
}

export function createSubstrateSigner(keypair: KeyringPair): PolkadotSigner {
  return getPolkadotSigner(keypair.publicKey, "Sr25519", async (input) => keypair.sign(input));
}

async function readDefaultAccountName(keystoreDirectoryPath: string): Promise<string | undefined> {
  try {
    const defaultPointerPath = path.join(keystoreDirectoryPath, ".default");
    const fileContent = await fs.readFile(defaultPointerPath, "utf8");
    const accountName = fileContent.trim();
    return accountName.length ? accountName : undefined;
  } catch {
    return undefined;
  }
}

function toSafeAccountFilename(accountName: string): string {
  const safeFilename = accountName.trim().replaceAll(/[^\w.-]/g, "_");
  return `${safeFilename}.json`;
}

function resolveAuthSourceFromEnv(account: string): ResolvedAuthSource | undefined {
  const envMnemonic = process.env[ENV.MNEMONIC];
  if (envMnemonic && envMnemonic.length > 0) {
    return {
      source: envMnemonic,
      isKeyUri: false,
      resolvedFrom: "env",
      account,
      credential: envMnemonic,
    };
  }

  const envKeyUri = process.env[ENV.KEY_URI];
  if (envKeyUri && envKeyUri.length > 0) {
    return {
      source: envKeyUri,
      isKeyUri: true,
      resolvedFrom: "env",
      account,
      credential: envKeyUri,
    };
  }

  return undefined;
}

function isExplicitKeystorePath(keystorePath: string | undefined): boolean {
  if (keystorePath == null || keystorePath.trim().length === 0) return false;
  return resolveKeystorePath(keystorePath) !== resolveKeystorePath(undefined);
}

function hasKeystoreSelectionHint(opts: AuthSource): boolean {
  return Boolean(
    (opts.account != null && String(opts.account).trim().length > 0) ||
    isExplicitKeystorePath(opts.keystorePath) ||
    (opts.password != null && String(opts.password).trim().length > 0),
  );
}

async function resolveAuthSourceFromKeystore(
  opts: AuthSource,
  accountName: string,
  requireKeystore: boolean,
): Promise<ResolvedAuthSource | undefined> {
  const keystoreDirectoryPath = resolveKeystorePath(opts.keystorePath);

  if (!(await pathExists(keystoreDirectoryPath))) {
    if (requireKeystore) {
      throw new Error(`Keystore directory not found: ${keystoreDirectoryPath}`);
    }
    return undefined;
  }

  const password = await getPasswordForDecrypt(opts.password);

  const defaultAccount = await readDefaultAccountName(keystoreDirectoryPath);
  const selectedAccountName =
    accountName === "default" && defaultAccount ? defaultAccount : accountName;

  const accountFilePath = path.join(
    keystoreDirectoryPath,
    toSafeAccountFilename(selectedAccountName),
  );

  if (!(await pathExists(accountFilePath))) {
    throw new Error(`Account not found in keystore: ${selectedAccountName}`);
  }

  const encryptedAccount = await readKeystoreFile(accountFilePath);
  const decryptedAccount = decryptKeystorePayload(
    encryptedAccount,
    password,
  ) as AccountKeystorePayload;

  const auth = decryptedAccount.auth;
  const actualAccountName = decryptedAccount.account || selectedAccountName;

  if (auth?.keyUri?.length) {
    return {
      source: auth.keyUri,
      isKeyUri: true,
      resolvedFrom: "keystore",
      account: actualAccountName,
      credential: password,
    };
  }
  if (auth?.mnemonic?.length) {
    return {
      source: auth.mnemonic,
      isKeyUri: false,
      resolvedFrom: "keystore",
      account: actualAccountName,
      credential: password,
    };
  }

  throw new Error(`No valid auth found in account: ${actualAccountName}`);
}

export async function resolveAuthSourceReadOnly(): Promise<ResolvedAuthSource> {
  const fromEnv = resolveAuthSourceFromEnv("readonly");
  if (fromEnv) return fromEnv;

  return {
    source: DEFAULT_MNEMONIC,
    isKeyUri: false,
    resolvedFrom: "default",
    account: "readonly",
  };
}

function warnArgvSecret(flag: string): void {
  console.warn(
    `Warning: ${flag} puts a secret on the command line, where it is visible in ` +
      `process listings and shell history. Prefer DOTNS_MNEMONIC / DOTNS_KEY_URI or an ` +
      `encrypted keystore (dotns auth set).`,
  );
}

export async function resolveAuthSource(opts: AuthSource): Promise<ResolvedAuthSource> {
  const accountName = normalizeAccountName(opts.account);

  if (opts.mnemonic) {
    warnArgvSecret("--mnemonic");
    return {
      source: opts.mnemonic,
      isKeyUri: false,
      resolvedFrom: "cli",
      account: accountName,
      credential: opts.mnemonic,
    };
  }
  if (opts.keyUri) {
    warnArgvSecret("--key-uri");
    return {
      source: opts.keyUri,
      isKeyUri: true,
      resolvedFrom: "cli",
      account: accountName,
      credential: opts.keyUri,
    };
  }

  const preferKeystore = hasKeystoreSelectionHint(opts);
  if (preferKeystore) {
    return (await resolveAuthSourceFromKeystore(opts, accountName, true))!;
  }

  const fromEnv = resolveAuthSourceFromEnv(accountName);
  if (fromEnv) return fromEnv;

  const fromKeystore = await resolveAuthSourceFromKeystore(opts, accountName, false);
  if (fromKeystore) return fromKeystore;

  return {
    source: DEFAULT_MNEMONIC,
    isKeyUri: false,
    resolvedFrom: "default",
    account: accountName,
  };
}
