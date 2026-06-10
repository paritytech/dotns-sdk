import type { NetworkConfig } from "@/type";

// After the v2 ContractManager migration, contract addresses live in cdm.json.
// This file only carries chain-level metadata used by the UI for display
// (chainName, native currency, block explorer URL) and runtime configuration
// (RPC URL for non-contract chain reads).

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  420420417: {
    chainId: 420420417,
    chainName: "Paseo Assethub Testnet",
    nativeCurrency: {
      name: "Paseo",
      symbol: "PAS",
      decimals: 18,
    },
    blockExplorerUrls: ["https://assethub-paseo.subscan.io/"],
  },
};

/// We using the ALICE as a zero address placeholder for Substrate-based addresses
export const ZERO_SUBSTRATE_ADDRESS = "5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV";

export const DEFAULT_NETWORK_ID = 420420417;
export const TOKEN_UNIT = "PAS";
export const BLOCK_EXPLORER = "https://passet-hub.subscan.io/";

export const GAS_LIMIT = 10000000n;
export const MAX_WEIGHT = {
  refTime: BigInt("18446744073709551615"),
  proofSize: BigInt("18446744073709551615"),
};

/**
 * Get the first network in SUPPORTED_NETWORKS. Kept as a helper for callers
 * that need a default. Historically named "deployed" when contract addresses
 * lived here. Returns the only configured network today.
 */
export function getFirstDeployedNetwork(): NetworkConfig | undefined {
  const networks = Object.values(SUPPORTED_NETWORKS);
  return networks[0];
}
