import { isAddress, getAddress } from "viem";
import { type DotnsContext, read, write } from "../core/context";
import type {
  IsMappedResult,
  IsWhitelistedResult,
  WhitelistResult,
  ResolvedAddress,
} from "../types/types";
import { DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { isValidSubstrateAddress } from "../utils/validation";

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

export async function getWhitelistStatus(
  ctx: DotnsContext,
  targetAddress: string,
): Promise<IsWhitelistedResult> {
  const { evmAddress, originalAddress } = await resolveToEvmAddress(ctx, targetAddress);
  const isWhitelisted = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "isWhiteListed",
    [evmAddress],
  );
  return { address: originalAddress, evmAddress, isWhitelisted };
}

export async function whitelistAddress(
  ctx: DotnsContext,
  targetAddress: string,
  enable: boolean = true,
): Promise<WhitelistResult> {
  const { evmAddress, originalAddress } = await resolveToEvmAddress(ctx, targetAddress);

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    0n,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "whiteListAddress",
    [evmAddress, enable],
    enable ? "Whitelist" : "Un-whitelist",
  );

  const whitelisted = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "isWhiteListed",
    [evmAddress],
  );

  return { address: originalAddress, evmAddress, whitelisted, txHash };
}
