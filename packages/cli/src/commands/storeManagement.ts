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
import { type DotnsContext, createDotnsContext, read, write } from "../core/context";
import {
  STORE_FACTORY_ABI,
  USER_STORE_ABI,
  LABEL_STORE_ABI,
  DOTNS_POP_CONTROLLER_ABI,
} from "../utils/constants";
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

function normalizeKeyToBytes32(raw: string): Hex {
  if (raw.startsWith("0x") && raw.length === 66) {
    return raw as Hex;
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

async function readUserStore(ctx: DotnsContext, ownerEvm: Address): Promise<Address | null> {
  const storeAddress = getAddress(
    await read<Address>(ctx, ctx.contracts.STORE_FACTORY, STORE_FACTORY_ABI, "getUserStore", [
      ownerEvm,
    ]),
  );
  return storeAddress === zeroAddress ? null : storeAddress;
}

async function readLabelStore(ctx: DotnsContext, ownerEvm: Address): Promise<Address | null> {
  const storeAddress = getAddress(
    await read<Address>(ctx, ctx.contracts.STORE_FACTORY, STORE_FACTORY_ABI, "getLabelStore", [
      ownerEvm,
    ]),
  );
  return storeAddress === zeroAddress ? null : storeAddress;
}

async function requireUserStore(ctx: DotnsContext, ownerEvm: Address): Promise<Address> {
  const storeAddress = await readUserStore(ctx, ownerEvm);
  if (!storeAddress) {
    throw new Error(
      "No User Store claimed for this account. Run `dotns store claim` to create one before writing values.",
    );
  }
  return storeAddress;
}

async function readAllUserStoreKeys(ctx: DotnsContext, storeAddress: Address): Promise<Hex[]> {
  const count = await read<bigint>(ctx, storeAddress, USER_STORE_ABI, "getKeyCount", []);

  const keys: Hex[] = [];
  for (let offset = 0n; offset < count; offset += STORE_PAGE_SIZE) {
    const page = await read<readonly Hex[]>(ctx, storeAddress, USER_STORE_ABI, "getKeys", [
      offset,
      STORE_PAGE_SIZE,
    ]);
    keys.push(...page);
  }

  return keys;
}

async function readUserStoreValue(
  ctx: DotnsContext,
  storeAddress: Address,
  key: Hex,
): Promise<string> {
  const raw = await read<Hex>(ctx, storeAddress, USER_STORE_ABI, "getValue", [key]);
  return decodeValue(raw);
}

export async function claimUserStore(
  ctx: DotnsContext,
  ownerEvm: Address,
): Promise<ClaimUserStoreResult> {
  const existing = await readUserStore(ctx, ownerEvm);
  if (existing) {
    return { storeAddress: existing, tx: null, alreadyClaimed: true };
  }

  const tx = await write(
    ctx,
    ctx.contracts.STORE_FACTORY,
    0n,
    STORE_FACTORY_ABI,
    "claimUserStore",
    [],
    "Claim user store",
  );

  const storeAddress = await requireUserStore(ctx, ownerEvm);
  return { storeAddress, tx, alreadyClaimed: false };
}

export async function getStoreInfo(ctx: DotnsContext, ownerEvm: Address): Promise<StoreInfo> {
  const storeAddress = await readUserStore(ctx, ownerEvm);
  return { owner: ownerEvm, storeAddress, exists: storeAddress !== null };
}

export async function listStoreValues(ctx: DotnsContext, ownerEvm: Address): Promise<StoreEntry[]> {
  const storeAddress = await requireUserStore(ctx, ownerEvm);
  const keys = await readAllUserStoreKeys(ctx, storeAddress);

  const entries: StoreEntry[] = [];
  for (const key of keys) {
    entries.push({ key, value: await readUserStoreValue(ctx, storeAddress, key) });
  }
  return entries;
}

export async function listStoreNames(ctx: DotnsContext, ownerEvm: Address): Promise<string[]> {
  const labelStoreAddress = await readLabelStore(ctx, ownerEvm);
  if (!labelStoreAddress) return [];

  const count = await read<bigint>(ctx, labelStoreAddress, LABEL_STORE_ABI, "getLabelCount", []);

  const names: string[] = [];
  for (let offset = 0n; offset < count; offset += STORE_PAGE_SIZE) {
    const page = await read<readonly string[]>(
      ctx,
      labelStoreAddress,
      LABEL_STORE_ABI,
      "getLabels",
      [offset, STORE_PAGE_SIZE],
    );
    names.push(...page);
  }
  return names;
}

export async function listStoreCids(ctx: DotnsContext, ownerEvm: Address): Promise<string[]> {
  const storeAddress = await requireUserStore(ctx, ownerEvm);
  const keys = await readAllUserStoreKeys(ctx, storeAddress);

  const cids: string[] = [];
  for (const key of keys) {
    const value = await readUserStoreValue(ctx, storeAddress, key);
    if (value) cids.push(value);
  }
  return cids;
}

export async function getStoreValue(
  ctx: DotnsContext,
  ownerEvm: Address,
  rawKey: string,
): Promise<StoreValueResult> {
  const storeAddress = await requireUserStore(ctx, ownerEvm);
  const key = normalizeKeyToBytes32(rawKey);
  const value = await readUserStoreValue(ctx, storeAddress, key);
  return { key, value, exists: value.length > 0 };
}

export async function setStoreValue(
  ctx: DotnsContext,
  ownerEvm: Address,
  rawKey: string,
  value: string,
): Promise<StoreValueResult> {
  const storeAddress = await requireUserStore(ctx, ownerEvm);
  const key = normalizeKeyToBytes32(rawKey);
  await write(
    ctx,
    storeAddress,
    0n,
    USER_STORE_ABI,
    "setValue",
    [key, encodeValue(value)],
    "Store write",
  );
  return { key, value, exists: true };
}

export async function deleteStoreValue(
  ctx: DotnsContext,
  ownerEvm: Address,
  rawKey: string,
): Promise<StoreDeleteResult> {
  const storeAddress = await requireUserStore(ctx, ownerEvm);
  const key = normalizeKeyToBytes32(rawKey);
  // UserStore has no deleteValue; clearing a key means writing empty bytes.
  await write(ctx, storeAddress, 0n, USER_STORE_ABI, "setValue", [key, "0x"], "Store delete");
  return { key, deleted: true };
}

export async function cacheCidToStore(options: CacheCidToStoreOptions): Promise<void> {
  const ctx = createDotnsContext({
    clientWrapper: options.clientWrapper,
    origin: options.substrateAddress,
    signer: options.signer,
  });
  await setStoreValue(ctx, options.evmAddress, `dotns.bulletin.${options.cid}`, options.cid);
}

export async function claimLabels(
  ctx: DotnsContext,
  ownerEvm: Address,
): Promise<{ storeAddress: Address | null; tx: string }> {
  const tx = await write(
    ctx,
    ctx.contracts.DOTNS_POP_CONTROLLER,
    0n,
    DOTNS_POP_CONTROLLER_ABI,
    "claimLabelStore",
    [],
    "Claim labels",
  );
  const storeAddress = await readLabelStore(ctx, ownerEvm);
  return { storeAddress, tx };
}
