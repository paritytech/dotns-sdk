import { namehash, zeroAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read, write } from "../core/context";
import { DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { normaliseLabel } from "../utils/validation";
import { decodeIpfsContenthash, encodeIpfsContenthash } from "../bulletin/cid";
import { getResolverNodeInfo, requireResolverAuthorization } from "./resolverAuth";

function decodeContenthashToCid(contenthash: Hex): string | null {
  if (contenthash === "0x" || contenthash === "0x0" || contenthash.length < 6) {
    return null;
  }
  return decodeIpfsContenthash(contenthash);
}

function encodeCidToContenthash(cidString: string): Hex {
  return `0x${encodeIpfsContenthash(cidString)}` as Hex;
}

export type ContentViewResult = {
  domain: string;
  contenthash: string | null;
  cid: string | null;
};

export type ContentSetResult = {
  domain: string;
  cid: string;
  contenthash: string;
  txHash: string;
};

export async function getContentHash(ctx: DotnsContext, name: string): Promise<ContentViewResult> {
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
    return { domain, contenthash: null, cid: null };
  }

  const contentHashBytes = await read<Hex>(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "contenthash",
    [namehashNode],
  );
  const cid = decodeContenthashToCid(contentHashBytes);

  return {
    domain,
    contenthash: cid === null ? null : contentHashBytes,
    cid,
  };
}

export async function setContentHash(
  ctx: DotnsContext,
  name: string,
  cid: string,
): Promise<ContentSetResult> {
  const label = normaliseLabel(name);
  const domain = `${label}.dot`;
  const namehashNode = namehash(domain);

  const { exists, owner, caller } = await getResolverNodeInfo(ctx, namehashNode);
  if (!exists) {
    throw new Error(`Domain ${domain} is not registered`);
  }
  await requireResolverAuthorization(ctx, owner, caller);

  const contenthash = encodeCidToContenthash(cid);
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setContenthash",
    [namehashNode, contenthash],
    "Setting content hash",
  );

  return { domain, cid, contenthash, txHash };
}
