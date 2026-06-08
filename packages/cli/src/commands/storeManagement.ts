import chalk from "chalk";
import ora from "ora";
import {
  getAddress,
  zeroAddress,
  keccak256,
  toHex,
  stringToHex,
  hexToString,
  type Address,
  type Hex,
} from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import {
  CONTRACTS,
  STORE_FACTORY_ABI,
  USER_STORE_ABI,
  LABEL_STORE_ABI,
  DOTNS_POP_CONTROLLER_ABI,
} from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import type {
  StoreInfo,
  StoreValueResult,
  StoreDeleteResult,
  StoreEntry,
  ClaimUserStoreResult,
  CacheCidToStoreOptions,
} from "../types/types";

// UserStore / LabelStore expose paginated enumeration; read in fixed-size pages.
const STORE_PAGE_SIZE = 100n;

function normalizeKeyToBytes32(raw: string): `0x${string}` {
  if (raw.startsWith("0x") && raw.length === 66) {
    return raw as `0x${string}`;
  }
  return keccak256(toHex(raw));
}

/** UserStore values are raw bytes; the CLI stores and reads them as UTF-8 strings. */
function encodeValue(value: string): Hex {
  return stringToHex(value);
}

function decodeValue(raw: Hex): string {
  return raw && raw !== "0x" ? hexToString(raw) : "";
}

async function resolveUserStoreAddress(
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
      "getUserStore",
      [evmAddress],
    ),
  );

  if (storeAddress === zeroAddress) {
    throw new Error(
      "No User Store claimed for this account. Run `dotns store claim` to create one before writing values.",
    );
  }

  return storeAddress;
}

async function resolveLabelStoreAddress(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<Address | null> {
  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getLabelStore",
      [evmAddress],
    ),
  );

  return storeAddress === zeroAddress ? null : storeAddress;
}

export async function claimUserStore(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
): Promise<ClaimUserStoreResult> {
  const existing = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      substrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getUserStore",
      [evmAddress],
    ),
  );

  if (existing !== zeroAddress) {
    console.log("\n▶ User Store Claim");
    console.log(chalk.gray("  owner:  ") + chalk.white(evmAddress));
    console.log(chalk.gray("  store:  ") + chalk.white(existing));
    console.log(chalk.gray("  status: ") + chalk.white("already claimed"));
    return { storeAddress: existing, tx: null, alreadyClaimed: true };
  }

  const spinner = ora("Claiming User Store").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.STORE_FACTORY,
    0n,
    STORE_FACTORY_ABI,
    "claimUserStore",
    [],
    substrateAddress,
    signer,
    spinner,
    "Claim user store",
  );

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      substrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getUserStore",
      [evmAddress],
    ),
  );

  console.log("\n▶ User Store Claim");
  console.log(chalk.gray("  tx:    ") + chalk.blue(tx));
  console.log(chalk.gray("  owner: ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));

  return { storeAddress, tx, alreadyClaimed: false };
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
      "getUserStore",
      [evmAddress],
    ),
  );

  const exists = storeAddress !== zeroAddress;
  spinner.succeed("Store lookup complete");

  console.log("\n▶ Store Info");
  console.log(chalk.gray("  factory: ") + chalk.white(CONTRACTS.STORE_FACTORY));
  console.log(chalk.gray("  owner:   ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store:   ") + chalk.white(exists ? storeAddress : "(not claimed)"));
  console.log(chalk.gray("  exists:  ") + chalk.white(String(exists)));

  return { owner: evmAddress, storeAddress: exists ? storeAddress : null, exists };
}

async function readAllUserStoreKeys(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  storeAddress: Address,
): Promise<Hex[]> {
  const count = await performContractCall<bigint>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    USER_STORE_ABI,
    "getKeyCount",
    [],
  );

  const keys: Hex[] = [];
  for (let offset = 0n; offset < count; offset += STORE_PAGE_SIZE) {
    const page = await performContractCall<readonly Hex[]>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      USER_STORE_ABI,
      "getKeys",
      [offset, STORE_PAGE_SIZE],
    );
    keys.push(...page);
  }

  return keys;
}

async function readUserStoreValue(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  storeAddress: Address,
  key: Hex,
): Promise<string> {
  const raw = await performContractCall<Hex>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    USER_STORE_ABI,
    "getValue",
    [key],
  );

  return decodeValue(raw);
}

export async function listStoreValues(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<StoreEntry[]> {
  const storeAddress = await resolveUserStoreAddress(
    clientWrapper,
    originSubstrateAddress,
    evmAddress,
  );
  const spinner = ora("Reading Store values").start();

  const keys = await readAllUserStoreKeys(clientWrapper, originSubstrateAddress, storeAddress);

  const entries: StoreEntry[] = [];
  for (const key of keys) {
    const value = await readUserStoreValue(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      key,
    );
    entries.push({ key, value });
  }

  spinner.succeed(`Found ${entries.length} value(s)`);

  console.log("\n▶ Store Values");
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));

  if (entries.length === 0) {
    console.log(chalk.gray("  (empty)"));
  } else {
    entries.forEach((entry, index) => {
      console.log(chalk.gray(`  ${index + 1}. `) + chalk.cyan(`${entry.key} = ${entry.value}`));
    });
  }

  return entries;
}

export async function listStoreNames(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const labelStoreAddress = await resolveLabelStoreAddress(
    clientWrapper,
    originSubstrateAddress,
    evmAddress,
  );

  const spinner = ora("Reading Label Store names").start();

  if (labelStoreAddress === null) {
    spinner.succeed("Found 0 name(s)");
    return [];
  }

  const count = await performContractCall<bigint>(
    clientWrapper,
    originSubstrateAddress,
    labelStoreAddress,
    LABEL_STORE_ABI,
    "getLabelCount",
    [],
  );

  const names: string[] = [];
  for (let offset = 0n; offset < count; offset += STORE_PAGE_SIZE) {
    const page = await performContractCall<readonly string[]>(
      clientWrapper,
      originSubstrateAddress,
      labelStoreAddress,
      LABEL_STORE_ABI,
      "getLabels",
      [offset, STORE_PAGE_SIZE],
    );
    names.push(...page);
  }

  spinner.succeed(`Found ${names.length} name(s)`);
  return names;
}

export async function listStoreCids(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const storeAddress = await resolveUserStoreAddress(
    clientWrapper,
    originSubstrateAddress,
    evmAddress,
  );
  const spinner = ora("Reading Store CIDs").start();

  const keys = await readAllUserStoreKeys(clientWrapper, originSubstrateAddress, storeAddress);

  const cids: string[] = [];
  for (const key of keys) {
    const value = await readUserStoreValue(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      key,
    );
    if (value) cids.push(value);
  }

  spinner.succeed(`Found ${cids.length} CID(s)`);
  return cids;
}

export async function getStoreValue(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
  rawKey: string,
): Promise<StoreValueResult> {
  const storeAddress = await resolveUserStoreAddress(
    clientWrapper,
    originSubstrateAddress,
    evmAddress,
  );
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Reading Store value").start();

  const value = await readUserStoreValue(clientWrapper, originSubstrateAddress, storeAddress, key);

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
  const storeAddress = await resolveUserStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Writing to Store").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    USER_STORE_ABI,
    "setValue",
    [key, encodeValue(value)],
    substrateAddress,
    signer,
    spinner,
    "Store write",
  );

  console.log("\n▶ Store Set");
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
): Promise<StoreDeleteResult> {
  const storeAddress = await resolveUserStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Deleting Store value").start();

  // UserStore has no deleteValue; clearing a key means writing empty bytes.
  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    USER_STORE_ABI,
    "setValue",
    [key, "0x"],
    substrateAddress,
    signer,
    spinner,
    "Store delete",
  );

  console.log("\n▶ Store Delete");
  console.log(chalk.gray("  tx:  ") + chalk.blue(tx));
  console.log(chalk.gray("  key: ") + chalk.white(key));

  return { key, deleted: true };
}

export async function cacheCidToStore(options: CacheCidToStoreOptions): Promise<void> {
  const storeKey = `dotns.bulletin.${options.cid}`;
  await setStoreValue(
    options.clientWrapper,
    options.substrateAddress,
    options.signer,
    options.evmAddress,
    storeKey,
    options.cid,
  );
}

export async function claimLabels(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
): Promise<{ storeAddress: Address; tx: string }> {
  const before = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      substrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getLabelStore",
      [evmAddress],
    ),
  );

  const spinner = ora(
    before === zeroAddress
      ? "Deploying Label Store and settling deferred names"
      : "Settling deferred names into existing Label Store",
  ).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_POP_CONTROLLER,
    0n,
    DOTNS_POP_CONTROLLER_ABI,
    "claimLabelStore",
    [],
    substrateAddress,
    signer,
    spinner,
    "Claim labels",
  );

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      substrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getLabelStore",
      [evmAddress],
    ),
  );

  console.log("\n▶ Label Store Claim");
  console.log(chalk.gray("  tx:    ") + chalk.blue(tx));
  console.log(chalk.gray("  owner: ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));

  return { storeAddress, tx };
}
