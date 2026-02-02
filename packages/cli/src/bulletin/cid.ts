import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { Buffer } from "buffer";

export const CID_CONFIG = {
  version: 1,
  codecRaw: 0x55,
  codecDagPb: 0x70,
  hashCodeBlake2b256: 0xb220,
  hashCodeSha2_256: 0x12,
  hashLength: 32,
} as const;

export type HashingEnum =
  | { type: "Blake2b256"; value: undefined }
  | { type: "Sha2_256"; value: undefined }
  | { type: "Keccak256"; value: undefined };

export function toHashingEnum(mhCode: number): HashingEnum {
  switch (mhCode) {
    case CID_CONFIG.hashCodeBlake2b256:
      return { type: "Blake2b256", value: undefined };
    case CID_CONFIG.hashCodeSha2_256:
      return { type: "Sha2_256", value: undefined };
    case 0x1b:
      return { type: "Keccak256", value: undefined };
    default:
      throw new Error(`Unhandled multihash code: ${mhCode}`);
  }
}

export async function createCidFromData(params: {
  data: Uint8Array;
  codec: number;
  hashCode: number;
}): Promise<string> {
  const { CID } = await import("multiformats/cid");
  const { create: createMultihash } = await import("multiformats/hashes/digest");

  const { data, codec, hashCode } = params;

  let hash: Uint8Array;
  if (hashCode === CID_CONFIG.hashCodeBlake2b256) {
    hash = blake2b(data, { dkLen: CID_CONFIG.hashLength });
  } else if (hashCode === CID_CONFIG.hashCodeSha2_256) {
    hash = sha256(data);
  } else {
    throw new Error(`Unsupported hash code: 0x${hashCode.toString(16)}`);
  }

  const digest = createMultihash(hashCode, hash);
  return CID.createV1(codec, digest).toString();
}

export async function encodeIpfsContenthash(cidString: string): Promise<string> {
  const { CID } = await import("multiformats/cid");
  const cid = CID.parse(cidString);

  const contenthash = new Uint8Array(cid.bytes.length + 2);
  contenthash[0] = 0xe3;
  contenthash[1] = 0x01;
  contenthash.set(cid.bytes, 2);

  return `0x${Buffer.from(contenthash).toString("hex")}`;
}
