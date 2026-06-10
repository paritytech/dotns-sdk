// Copyright 2026 Parity Technologies (UK) Ltd.
// SPDX-License-Identifier: Apache-2.0
//
// UserStore logic ABI, vendored from dotns out/UserStore.sol/UserStore.json.
//
// Per-user UserStores are BeaconProxy instances claimed by the owner via
// StoreFactory.claimUserStore(); their LOGIC ABI is NOT published to the CDM
// registry (only StoreFactory + the beacon are). We resolve the per-user address
// via store-factory.getUserStore(user) at runtime and apply this ABI to it.
// Only the key/value surface the app uses is vendored; re-vendor if IUserStore
// changes, or drop once CDM publishes the logic ABI.
import type { AbiEntry } from "@parity/product-sdk-contracts";

export const userStoreAbi = [
  {
    type: "function",
    name: "setValue",
    inputs: [
      { name: "key", type: "bytes32" },
      { name: "value", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getValue",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getKeys",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getKeyCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] satisfies AbiEntry[];
