import { zeroAddress } from "viem";
import type { Deployment, NetworkConfig } from "@/type";

/**
 * Network Configuration
 *
 * Supported blockchain networks and their deployment addresses
 */

export const SUPPORTED_NETWORKS: Record<number, NetworkConfig & Partial<Deployment>> = {
  420420417: {
    chainId: 420420417,
    chainName: "Paseo Assethub Testnet",
    nativeCurrency: {
      name: "Paseo",
      symbol: "PAS",
      decimals: 18,
    },
    rpcUrls: ["wss://asset-hub-paseo-rpc.n.dwellir.com"],
    blockExplorerUrls: ["https://assethub-paseo.subscan.io/"],
    dotnsRegistry: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
    dotnsRegistrarController: "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651",
    dotnsResolver: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
    dotnsReverseResolver: "0x95D57363B491CF743970c640fe419541386ac8BF",
    storeFactory: "0x030296782F4d3046B080BcB017f01837561D9702",
    dotnsRegistrar: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD",
    multiCall: "0x3E169cb6690E3A592153E0dd0495e8e6e868d0b8",
    popOracle: "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3",
    dotnsContentResolver: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7",
    ethRPCURL: "https://services.polkadothub-rpc.com/testnet",
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
 * Get the first deployed network from SUPPORTED_NETWORKS
 *
 * @returns The first network with a deployed dotnsRegistry, or undefined
 */
export function getFirstDeployedNetwork(): (NetworkConfig & Partial<Deployment>) | undefined {
  return Object.values(SUPPORTED_NETWORKS).find((network) => network.dotnsRegistry !== zeroAddress);
}
