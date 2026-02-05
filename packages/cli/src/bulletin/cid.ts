import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { base32 } from "multiformats/bases/base32";
import { base58btc } from "multiformats/bases/base58";

export const CODEC = {
  RAW: 0x55,
  DAG_PB: 0x70,
} as const;

export const HASH = {
  SHA2_256: 0x12,
  BLAKE2B_256: 0xb220,
  KECCAK_256: 0x1b,
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
  const decoder = cidString.startsWith("Qm") ? base58btc : base32;
  return CID.parse(cidString, decoder);
}

export function encodeIpfsContenthash(cidString: string): string {
  const cid = parseCid(cidString);
  const contenthashBytes = new Uint8Array(cid.bytes.length + 2);
  contenthashBytes[0] = 0xe3;
  contenthashBytes[1] = 0x01;
  contenthashBytes.set(cid.bytes, 2);
  return Buffer.from(contenthashBytes).toString("hex");
}

export function decodeIpfsContenthash(contenthashHex: string): string | null {
  const hexString = contenthashHex.startsWith("0x") ? contenthashHex.slice(2) : contenthashHex;
  const bytes = Buffer.from(hexString, "hex");

  if (bytes.length < 4 || bytes[0] !== 0xe3) {
    return null;
  }

  const cidBytes = bytes.slice(2);
  const cid = CID.decode(cidBytes);
  return cid.toString();
}
