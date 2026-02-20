import chalk from "chalk";
import ora from "ora";
import { getAddress, zeroAddress, keccak256, toHex, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, STORE_FACTORY_ABI, STORE_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import type { StoreInfo, StoreValueResult, StoreAuthStatus } from "../types/types";

export function normalizeKeyToBytes32(raw: string): `0x${string}` {
  if (raw.startsWith("0x") && raw.length === 66) {
    return raw as `0x${string}`;
  }
  return keccak256(toHex(raw));
}

async function resolveStoreAddress(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<Address> {
  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [evmAddress],
    ),
  );

  if (storeAddress === zeroAddress) {
    throw new Error("No Store deployed for this account. Register a domain first to create one.");
  }

  return storeAddress;
}

export async function getStoreInfo(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<StoreInfo> {
  const spinner = ora("Looking up Store").start();

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [evmAddress],
    ),
  );

  const exists = storeAddress !== zeroAddress;
  spinner.succeed("Store lookup complete");

  console.log("\n▶ Store Info");
  console.log(chalk.gray("  factory: ") + chalk.white(CONTRACTS.STORE_FACTORY));
  console.log(chalk.gray("  owner:   ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store:   ") + chalk.white(exists ? storeAddress : "(not deployed)"));
  console.log(chalk.gray("  exists:  ") + chalk.white(String(exists)));

  return { owner: evmAddress, storeAddress: exists ? storeAddress : null, exists };
}

export async function listStoreValues(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Reading Store values").start();

  const values = await performContractCall<readonly string[]>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValues",
    [],
  );

  spinner.succeed(`Found ${values.length} value(s)`);

  console.log("\n▶ Store Values");
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));

  if (values.length === 0) {
    console.log(chalk.gray("  (empty)"));
  } else {
    values.forEach((value, index) => {
      console.log(chalk.gray(`  ${index + 1}. `) + chalk.cyan(value));
    });
  }

  return [...values];
}

export async function getStoreValue(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
  rawKey: string,
): Promise<StoreValueResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Reading Store value").start();

  const value = await performContractCall<string>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValue",
    [key],
  );

  const exists = value.length > 0;
  spinner.succeed("Value read");

  console.log("\n▶ Store Value");
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));
  console.log(chalk.gray("  key:   ") + chalk.white(key));
  console.log(chalk.gray("  value: ") + chalk.white(exists ? value : "(empty)"));

  return { key, value, exists };
}

export async function setStoreValue(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  rawKey: string,
  value: string,
): Promise<StoreValueResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Writing to Store").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "setValue",
    [key, value],
    substrateAddress,
    signer,
    spinner,
    "Store write",
  );

  console.log(chalk.gray("  tx:    ") + chalk.blue(tx));
  console.log(chalk.gray("  key:   ") + chalk.white(key));
  console.log(chalk.gray("  value: ") + chalk.white(value));

  return { key, value, exists: true };
}

export async function deleteStoreValue(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  rawKey: string,
): Promise<{ key: `0x${string}`; deleted: boolean }> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Deleting Store value").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "deleteValue",
    [key],
    substrateAddress,
    signer,
    spinner,
    "Store delete",
  );

  console.log(chalk.gray("  tx:  ") + chalk.blue(tx));
  console.log(chalk.gray("  key: ") + chalk.white(key));

  return { key, deleted: true };
}

export async function checkStoreAuth(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
  targetAddress: Address,
): Promise<StoreAuthStatus> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Checking authorization status").start();

  const isAuthorized = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      STORE_ABI,
      "isAuthorized",
      [targetAddress],
    ),
  );

  const isDotnsController = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      STORE_ABI,
      "isDotnsController",
      [targetAddress],
    ),
  );

  spinner.succeed("Authorization check complete");

  console.log("\n▶ Authorization Status");
  console.log(chalk.gray("  store:      ") + chalk.white(storeAddress));
  console.log(chalk.gray("  target:     ") + chalk.white(targetAddress));
  console.log(chalk.gray("  authorized: ") + chalk.white(String(isAuthorized)));
  console.log(chalk.gray("  controller: ") + chalk.white(String(isDotnsController)));

  return { address: targetAddress, isAuthorized, isDotnsController };
}

export async function authorizeStoreWriter(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Authorizing ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "authorizeStore",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Authorize writer",
  );

  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function unauthorizeStoreWriter(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Revoking ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "unauthorizeStore",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Revoke writer",
  );

  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function authorizeDotnsController(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Authorizing controller ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "authorizeDotnsController",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Authorize controller",
  );

  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function unauthorizeDotnsController(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Revoking controller ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "unauthorizeDotnsController",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Revoke controller",
  );

  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}
