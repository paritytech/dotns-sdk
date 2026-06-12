// DotnsPopController ABI, vendored from dotns abis/DotnsPopController.json.
//
// The PoP controller holds the pending-claim queue (names parked at registration
// awaiting settlement into the user's LabelStore) and the claimLabelStore settle
// call. It is not published to the CDM meta-registry, so the UI resolves it by
// explicit address, mirroring how the name escrow and personhood precompile are
// wired. Re-vendor if IDotnsPopController changes.
import type { AbiEntry } from "@parity/product-sdk-contracts";
import type { Address } from "viem";

export const POP_CONTROLLER_ADDRESS = "0x1c858C31497a7715C0D56A11208feB6b74FaB2aB" as Address;

export const popControllerAbi = [
  {
    type: "function",
    name: "pendingClaims",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "claims_",
        type: "tuple[]",
        internalType: "struct IDotnsPopController.PendingClaim[]",
        components: [
          { name: "label", type: "string", internalType: "string" },
          { name: "mintedAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimLabelStore",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as unknown as AbiEntry[];
