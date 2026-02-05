import type { Abi, Address, Hex } from "viem";
import DotnsRegistrarController from "../../abis/DotnsRegistrarController.json" assert { type: "json" };
import DotnsRegistry from "../../abis/DotnsRegistry.json" assert { type: "json" };
import DotnsRegistrar from "../../abis/DotnsRegistrar.json" assert { type: "json" };
import DotnsReverseResolver from "../../abis/DotnsReverseResolver.json" assert { type: "json" };
import DotnsContentResolver from "../../abis/DotnsContentResolver.json" assert { type: "json" };
import DotnsResolver from "../../abis/DotnsResolver.json" assert { type: "json" };
import PopRules from "../../abis/PopRules.json" assert { type: "json" };
import StoreFactory from "../../abis/StoreFactory.json" assert { type: "json" };
import Store from "../../abis/Store.json" assert { type: "json" };

export const PREVIEW_BASE_URL = "http://dotns.paseo.li/#/preview";
export const DEFAULT_BULLETIN_RPC = "wss://bulletin.dotspark.app";
export const DEFAULT_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_SINGLE_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;

export const DOT_NODE: Hex = "0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce";

export const DECIMALS = 12n;

export const NATIVE_TO_ETH_RATIO = 1_000_000n;

export const DEFAULT_MNEMONIC =
  "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

export const OPERATION_TIMEOUT_MILLISECONDS = 300_000;

export const DOTNS_REGISTRAR_CONTROLLER_ABI = DotnsRegistrarController.abi as Abi;
export const DOTNS_REGISTRY_ABI = DotnsRegistry.abi as Abi;
export const DOTNS_REGISTRAR_ABI = DotnsRegistrar.abi as Abi;
export const DOTNS_REVERSE_RESOLVER_ABI = DotnsReverseResolver.abi as Abi;
export const DOTNS_CONTENT_RESOLVER_ABI = DotnsContentResolver.abi as Abi;
export const DOTNS_RESOLVER_ABI = DotnsResolver.abi as Abi;
export const POP_RULES_ABI = PopRules.abi as Abi;
export const STORE_FACTORY_ABI = StoreFactory.abi as Abi;
export const STORE_ABI = Store.abi as Abi;

export const RPC_ENDPOINTS = [
  //"wss://sys.ibp.network/asset-hub-paseo",
  "wss://asset-hub-paseo-rpc.n.dwellir.com",
] as const;

export const CONTRACTS = {
  /** DotNS domain registrar - handles ownership NFTs */
  DOTNS_REGISTRAR: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD" as Address,

  /** Registration controller - manages commit-reveal registration */
  DOTNS_REGISTRAR_CONTROLLER: "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651" as Address,

  /** stores domain records */
  DOTNS_REGISTRY: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f" as Address,

  /** Forward resolution resolver */
  DOTNS_RESOLVER: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514" as Address,

  /** Content hash resolver - stores IPFS CIDs */
  DOTNS_CONTENT_RESOLVER: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7" as Address,

  /** User store factory - deploys per-user storage contracts */
  STORE_FACTORY: "0x030296782F4d3046B080BcB017f01837561D9702" as Address,

  /** Proof of Personhood RULES - verifies eligibility and pricing */
  DOTNS_RULES: "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3" as Address,
} as const satisfies Record<string, Address>;
