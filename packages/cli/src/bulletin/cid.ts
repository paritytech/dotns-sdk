import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { encode, decode, getCodec } from "@ensdomains/content-hash";

export const CODEC = {
  RAW: 0x55,
  DAG_PB: 0x70,
} as const;

export const HASH = {
  SHA2_256: 0x12,
  BLAKE2B_256: 0xb220,
} as const;

export const HASH_LENGTH = 32;

export function computeHash(data: Uint8Array, hashCode: number): Uint8Array {
  switch (hashCode) {
    case HASH.SHA2_256:
      return sha256(data);
    case HASH.BLAKE2B_256:
      return blake2b(data, { dkLen: HASH_LENGTH });
    default:
      throw new Error(`Unsupported hash code: 0x${hashCode.toString(16)}`);
  }
}

export function createRawCid(data: Uint8Array, hashCode: number = HASH.SHA2_256): CID {
  const hash = computeHash(data, hashCode);
  const multihash = createMultihashDigest(hashCode, hash);
  return CID.createV1(CODEC.RAW, multihash);
}

export function createDagPbCid(data: Uint8Array, hashCode: number = HASH.SHA2_256): CID {
  const hash = computeHash(data, hashCode);
  const multihash = createMultihashDigest(hashCode, hash);
  return CID.createV1(CODEC.DAG_PB, multihash);
}

export function parseCid(cidString: string): CID {
  return CID.parse(cidString);
}

export function encodeIpfsContenthash(cidString: string): string {
  return encode("ipfs", cidString);
}

export function decodeIpfsContenthash(contenthashHex: string): string | null {
  const hex = contenthashHex.startsWith("0x") ? contenthashHex.slice(2) : contenthashHex;

  try {
    const codec = getCodec(hex);
    if (codec !== "ipfs") return null;
    return decode(hex);
  } catch {
    return null;
  }
}