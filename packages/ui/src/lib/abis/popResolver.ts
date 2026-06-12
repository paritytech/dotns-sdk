// DotnsPopResolver ABI, vendored from dotns out/DotnsPopResolver.sol/DotnsPopResolver.json.
//
// The PoP resolver holds per-node chat keys (a 65-byte ECDH public key set at
// PoP-Full registration). It is not published to the CDM meta-registry, so the
// UI resolves it by explicit address, mirroring the name escrow wiring.
// Re-vendor if IDotnsPopResolver changes.
import type { AbiEntry } from "@parity/product-sdk-contracts";
import type { Address } from "viem";

export const POP_RESOLVER_ADDRESS = "0xC9D511Eb80fD8B745DC5Be59aCF5d700271bC01e" as Address;

export const popResolverAbi = [
  {
    type: "function",
    name: "chatKey",
    inputs: [{ name: "node", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
] as unknown as AbiEntry[];
