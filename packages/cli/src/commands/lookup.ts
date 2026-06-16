import { namehash, getAddress, type Address, zeroAddress, checksumAddress } from "viem";
import { type DotnsContext, read, ownEvmAddress } from "../core/context";
import {
  DOTNS_REGISTRY_ABI,
  DOTNS_RESOLVER_ABI,
  POP_RULES_ABI,
  STORE_FACTORY_ABI,
  LABEL_STORE_ABI,
  DOTNS_REGISTRAR_ABI,
  DOTNS_POP_RESOLVER_ABI,
} from "../utils/constants";
import { stripTrailingDigits } from "../utils/validation";
import { computeDomainTokenId } from "../utils/contractInteractions";
import { formatNativeBalance, formatErrorMessage } from "../utils/formatting";
import type { DomainLookupResult, BaseNameReservation, DomainOwnership } from "../types/types";

export type RegisteredNamesResult = {
  owner: Address;
  store: Address | null;
  names: string[];
};

export async function performDomainLookup(
  ctx: DotnsContext,
  label: string,
): Promise<DomainLookupResult> {
  const domain = `${label}.dot`;
  const node = namehash(domain);

  const result: DomainLookupResult = {
    domain,
    node,
    exists: false,
    owner: zeroAddress,
    resolver: zeroAddress,
    store: null,
    resolvedAddress: null,
    ownerBalance: null,
    baseNameReservation: null,
    chatKey: null,
  };

  result.exists = Boolean(
    await read<boolean>(ctx, ctx.contracts.DOTNS_REGISTRY, DOTNS_REGISTRY_ABI, "recordExists", [
      node,
    ]),
  );

  result.owner = getAddress(
    await read<Address>(ctx, ctx.contracts.DOTNS_REGISTRY, DOTNS_REGISTRY_ABI, "owner", [node]),
  );

  result.resolver = getAddress(
    await read<Address>(ctx, ctx.contracts.DOTNS_REGISTRY, DOTNS_REGISTRY_ABI, "resolver", [node]),
  );

  const baseName = stripTrailingDigits(label);

  if (!result.exists || result.owner === zeroAddress) {
    if (baseName !== label) {
      result.baseNameReservation = await lookupBaseNameReservation(ctx, baseName);
    }
    return result;
  }

  const storeAddress = getAddress(
    await read<Address>(ctx, ctx.contracts.STORE_FACTORY, STORE_FACTORY_ABI, "getLabelStore", [
      result.owner,
    ]),
  );
  result.store = storeAddress === zeroAddress ? null : storeAddress;

  if (checksumAddress(result.resolver) === checksumAddress(ctx.contracts.DOTNS_RESOLVER)) {
    try {
      const resolvedAddress = getAddress(
        await read<Address>(ctx, result.resolver, DOTNS_RESOLVER_ABI, "addressOf", [node]),
      );
      result.resolvedAddress = resolvedAddress === zeroAddress ? null : resolvedAddress;
    } catch {
      result.resolvedAddress = null;
    }
  }

  result.ownerBalance = await lookupOwnerBalance(ctx, result.owner);

  try {
    const chatKey = await read<string>(
      ctx,
      ctx.contracts.DOTNS_POP_RESOLVER,
      DOTNS_POP_RESOLVER_ABI,
      "chatKey",
      [node],
    );
    result.chatKey = chatKey && chatKey !== "0x" ? chatKey : null;
  } catch {
    result.chatKey = null;
  }

  if (baseName !== label) {
    result.baseNameReservation = await lookupBaseNameReservation(ctx, baseName);
  }

  return result;
}

async function lookupOwnerBalance(
  ctx: DotnsContext,
  owner: Address,
): Promise<DomainLookupResult["ownerBalance"]> {
  try {
    const substrate = await ctx.clientWrapper.getSubstrateAddress(owner);
    const accountInfo = await ctx.clientWrapper.client.query.System.Account.getValue(substrate);
    const free = accountInfo.data.free as bigint;
    return { substrate, free: formatNativeBalance(free, ctx.nativeTokenDecimals) };
  } catch {
    return null;
  }
}

async function lookupBaseNameReservation(
  ctx: DotnsContext,
  baseName: string,
): Promise<BaseNameReservation> {
  try {
    const [isReserved, reservationOwner, expirationTimestamp] = await read<
      readonly [boolean, Address, bigint]
    >(ctx, ctx.contracts.DOTNS_RULES, POP_RULES_ABI, "isBaseNameReserved", [baseName]);

    return {
      baseName,
      isReserved,
      reservedBy: getAddress(reservationOwner),
      expires:
        expirationTimestamp > 0n
          ? new Date(Number(expirationTimestamp) * 1000).toISOString()
          : null,
    };
  } catch {
    return { expires: null, baseName, isReserved: false, reservedBy: zeroAddress };
  }
}

export async function listMyRegisteredNames(ctx: DotnsContext): Promise<RegisteredNamesResult> {
  const owner = await ownEvmAddress(ctx);

  const storeAddress = await read<Address>(
    ctx,
    ctx.contracts.STORE_FACTORY,
    STORE_FACTORY_ABI,
    "getLabelStore",
    [owner],
  );

  if (storeAddress === zeroAddress) {
    return { owner, store: null, names: [] };
  }

  const LABEL_PAGE_SIZE = 100n;
  const labelCount = await read<bigint>(ctx, storeAddress, LABEL_STORE_ABI, "getLabelCount", []);

  const names: string[] = [];
  for (let offset = 0n; offset < labelCount; offset += LABEL_PAGE_SIZE) {
    const page = await read<readonly string[]>(ctx, storeAddress, LABEL_STORE_ABI, "getLabels", [
      offset,
      LABEL_PAGE_SIZE,
    ]);
    names.push(...page);
  }

  return { owner, store: storeAddress, names };
}

export async function performOwnerOfLookup(
  ctx: DotnsContext,
  name: string,
): Promise<DomainOwnership> {
  if (!name || name.trim().length === 0) {
    throw new Error("--owner-of requires a <label>");
  }

  const label = name.trim();
  const tokenId = computeDomainTokenId(label);

  let actualOwner: Address;
  let isRegistered: boolean;

  try {
    actualOwner = await read<Address>(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR,
      DOTNS_REGISTRAR_ABI,
      "ownerOf",
      [tokenId],
    );
    isRegistered = actualOwner !== zeroAddress;
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("Contract reverted") || errorMessage.includes("does not exist")) {
      actualOwner = zeroAddress;
      isRegistered = false;
    } else {
      throw error;
    }
  }

  const ownerSubstrate = isRegistered
    ? await ctx.clientWrapper.getSubstrateAddress(actualOwner)
    : "(none)";

  return {
    label,
    domain: `${label}.dot`,
    registered: isRegistered,
    ownerEvm: isRegistered ? actualOwner : zeroAddress,
    ownerSubstrate,
  };
}
