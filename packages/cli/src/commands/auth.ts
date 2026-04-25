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
    return { source: envMnemonic, isKeyUri: false, resolvedFrom: "env", account };
  }

  const envKeyUri = process.env[ENV.KEY_URI];
  if (envKeyUri && envKeyUri.length > 0) {
    return { source: envKeyUri, isKeyUri: true, resolvedFrom: "env", account };
  }

  return undefined;
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

export async function resolveAuthSource(opts: AuthSource): Promise<ResolvedAuthSource> {
  const accountName = normalizeAccountName(opts.account);

  if (opts.mnemonic) {
    return { source: opts.mnemonic, isKeyUri: false, resolvedFrom: "cli", account: accountName };
  }
  if (opts.keyUri) {
    return { source: opts.keyUri, isKeyUri: true, resolvedFrom: "cli", account: accountName };
  }

  const fromEnv = resolveAuthSourceFromEnv(accountName);
  if (fromEnv) return fromEnv;

  const keystoreDirectoryPath = resolveKeystorePath(opts.keystorePath);

  if (await pathExists(keystoreDirectoryPath)) {
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
      };
    }
    if (auth?.mnemonic?.length) {
      return {
        source: auth.mnemonic,
        isKeyUri: false,
        resolvedFrom: "keystore",
        account: actualAccountName,
      };
    }

    throw new Error(`No valid auth found in account: ${actualAccountName}`);
  }

  return {
    source: DEFAULT_MNEMONIC,
    isKeyUri: false,
    resolvedFrom: "default",
    account: accountName,
  };
}
