import { isAddress, getAddress, type Address } from "viem";
import { type DotnsContext, read } from "../core/context";
import type { IsMappedResult, NameGrantResult, ResolvedAddress } from "../types/types";
import { DOTNS_NAME_WHITELIST_ABI, DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { isValidSubstrateAddress } from "../utils/validation";
import { normaliseName } from "../core/naming";

async function resolveToEvmAddress(ctx: DotnsContext, address: string): Promise<ResolvedAddress> {
  if (isAddress(address)) {
    return { evmAddress: getAddress(address), originalAddress: address };
  }
  if (!isValidSubstrateAddress(address)) {
    throw new Error(`Invalid address: not a valid EVM or Substrate address`);
  }
  const evmAddress = await ctx.clientWrapper.getEvmAddress(address);
  return { evmAddress, originalAddress: address };
}

export async function checkAccountMapped(
  ctx: DotnsContext,
  targetAddress: string,
): Promise<IsMappedResult> {
  const { evmAddress, originalAddress } = await resolveToEvmAddress(ctx, targetAddress);
  const isMapped = await ctx.clientWrapper.checkIfAccountMapped(originalAddress);
  return { address: originalAddress, evmAddress, isMapped };
}

// `bytes32("nameWhitelist")`: the ProtocolRegistry key the controller itself
// uses to locate the name whitelist (`DotnsConstants.NAME_WHITELIST`).
const NAME_WHITELIST_KEY = "0x6e616d6557686974656c69737400000000000000000000000000000000000000";

const PROTOCOL_REGISTRY_GET_ABI = [
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const;

/// Grant states of `DotnsNameWhitelist.statusOf`.
export const NAME_GRANT_STATUS = ["Open", "Reserved", "Granted"] as const;

// Resolves the name whitelist the way the controller does: from the protocol
// registry, so the CLI never holds a second copy of the address.
export async function resolveNameWhitelist(ctx: DotnsContext): Promise<Address> {
  const registry = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
  const whitelist = await read<Address>(ctx, registry, PROTOCOL_REGISTRY_GET_ABI, "get", [
    NAME_WHITELIST_KEY,
  ]);
  if (whitelist === "0x0000000000000000000000000000000000000000") {
    throw new Error("No name whitelist is configured on this network's protocol registry.");
  }
  return whitelist;
}

// Grant record of `label` on the name whitelist: status, the beneficiary a
// grant names, and whether the claim window is open.
export async function getNameGrant(ctx: DotnsContext, name: string): Promise<NameGrantResult> {
  const label = await normaliseName(ctx, name);
  const whitelist = await resolveNameWhitelist(ctx);
  const [statusIndex, grantee, windowOpen] = await Promise.all([
    read<number>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "statusOf", [label]),
    read<Address>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "granteeOf", [label]),
    read<boolean>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "isWindowOpen", []),
  ]);
  return {
    label,
    status: NAME_GRANT_STATUS[Number(statusIndex)] ?? `unknown(${statusIndex})`,
    grantee,
    windowOpen,
  };
}

// Whether `registerReserved` would accept `label` for `owner` without Root:
// the controller requires `isGrantedTo(label, owner)` on the name whitelist.
export async function isNameGrantedTo(
  ctx: DotnsContext,
  name: string,
  owner: string,
): Promise<boolean> {
  const label = await normaliseName(ctx, name);
  const { evmAddress } = await resolveToEvmAddress(ctx, owner);
  const whitelist = await resolveNameWhitelist(ctx);
  return read<boolean>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "isGrantedTo", [
    label,
    evmAddress,
  ]);
}
