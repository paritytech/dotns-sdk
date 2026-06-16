import { zeroAddress, type Address } from "viem";
import { type DotnsContext, read, write, ownEvmAddress } from "../core/context";
import { DOTNS_REGISTRAR_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { computeDomainTokenId } from "../utils/contractInteractions";
import { validateDomainLabel, normaliseLabel } from "../utils/validation";

export type DelegateResult = {
  name: string;
  delegate: Address;
  txHash: string;
};

export type RecordDelegateResult = {
  operator: Address;
  approved: boolean;
  txHash: string;
};

async function approveDelegate(
  ctx: DotnsContext,
  name: string,
  delegate: Address,
  action: string,
): Promise<DelegateResult> {
  const label = normaliseLabel(name);
  validateDomainLabel(label);
  const tokenId = computeDomainTokenId(label);
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "approve",
    [delegate, tokenId],
    action,
  );
  return { name: `${label}.dot`, delegate, txHash };
}

export async function setNameDelegate(
  ctx: DotnsContext,
  name: string,
  delegate: Address,
): Promise<DelegateResult> {
  return approveDelegate(ctx, name, delegate, "Delegating");
}

export async function revokeNameDelegate(ctx: DotnsContext, name: string): Promise<DelegateResult> {
  return approveDelegate(ctx, name, zeroAddress as Address, "Revoking delegate on");
}

export async function getNameDelegate(ctx: DotnsContext, name: string): Promise<Address | null> {
  const label = normaliseLabel(name);
  validateDomainLabel(label);
  const tokenId = computeDomainTokenId(label);
  const delegate = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "getApproved",
    [tokenId],
  );
  return !delegate || delegate === zeroAddress ? null : delegate;
}

export async function setRecordDelegate(
  ctx: DotnsContext,
  operator: Address,
  approved: boolean,
): Promise<RecordDelegateResult> {
  const action = approved ? "Delegating record control to" : "Revoking record control from";
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setApprovalForAll",
    [operator, approved],
    action,
  );
  return { operator, approved, txHash };
}

export async function getRecordDelegate(ctx: DotnsContext, operator: Address): Promise<boolean> {
  const owner = await ownEvmAddress(ctx);
  return read<boolean>(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "isApprovedForAll",
    [owner, operator],
  );
}
