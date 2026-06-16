import { namehash, zeroAddress, type Address } from "viem";
import { type DotnsContext, read, write } from "../core/context";
import { DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { normaliseLabel } from "../utils/validation";
import { getResolverNodeInfo, requireResolverAuthorization } from "./resolverAuth";

export type TextViewResult = {
  domain: string;
  key: string;
  exists: boolean;
  owner: string | null;
  value: string | null;
};

export type TextSetResult = {
  domain: string;
  key: string;
  value: string;
  txHash: string;
};

export async function getTextRecord(
  ctx: DotnsContext,
  name: string,
  key: string,
): Promise<TextViewResult> {
  const label = normaliseLabel(name);
  const domain = `${label}.dot`;
  const namehashNode = namehash(domain);

  const recordExists = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "recordExists",
    [namehashNode],
  );
  const owner = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "owner",
    [namehashNode],
  );

  if (!recordExists || owner === zeroAddress) {
    return { domain, key, exists: false, owner: null, value: null };
  }

  const value = await read<string>(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "text",
    [namehashNode, key],
  );

  return {
    domain,
    key,
    exists: true,
    owner,
    value: value === "" ? null : value,
  };
}

export async function setTextRecord(
  ctx: DotnsContext,
  name: string,
  key: string,
  value: string,
): Promise<TextSetResult> {
  const label = normaliseLabel(name);
  const domain = `${label}.dot`;
  const namehashNode = namehash(domain);

  const { exists, owner, caller } = await getResolverNodeInfo(ctx, namehashNode);
  if (!exists) {
    throw new Error(`Domain ${domain} is not registered`);
  }
  await requireResolverAuthorization(ctx, owner, caller);

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setText",
    [namehashNode, key, value],
    "Setting text record",
  );

  return { domain, key, value, txHash };
}
