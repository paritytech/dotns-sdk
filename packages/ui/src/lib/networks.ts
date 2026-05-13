import { getAddress, zeroAddress } from "viem";
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
    rpcUrls: ["wss://paseo-asset-hub-next-rpc.polkadot.io"],
    blockExplorerUrls: ["https://assethub-paseo.subscan.io/"],
    dotnsRegistry: "0x8877344A885682523B4613779C95688ed7037BfD",
    dotnsRegistrarController: "0x320b72c6e70D5a631d835FfD95915B288b26E6Be",
    dotnsResolver: "0x0cCdfea1a5E62DE116BF6cA79D397798d49e351E",
    dotnsReverseResolver: "0x025D5c4b10bD9723DeA2F4518aeD5B761DE08CDc",
    storeFactory: "0x0DE5De70d61cc6b44B45d6595afDe8dB9b55bc31",
    dotnsRegistrar: "0x885b8085bA92A31c4ef52076f77379E647ECC399",
    multiCall: getAddress("0x807A65D3F3020011Fe0A61723d51362556C14ffd"),
    popOracle: "0x2002C1c15b88632Ad01c7770f6EbE1Ca05c8472E",
    dotnsContentResolver: "0x2c9FF5D9136DBE5814C7B4FDbeDC15273a776663",
    ethRPCURL: "https://paseo-asset-hub-next-rpc.polkadot.io",
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
