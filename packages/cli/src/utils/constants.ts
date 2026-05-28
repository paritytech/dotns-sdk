import type { Abi, Address, Hex } from "viem";
import DotnsRegistrarController from "../../abis/DotnsRegistrarController.json" assert { type: "json" };
import DotnsRegistry from "../../abis/DotnsRegistry.json" assert { type: "json" };
import DotnsRegistrar from "../../abis/DotnsRegistrar.json" assert { type: "json" };
import DotnsReverseResolver from "../../abis/DotnsReverseResolver.json" assert { type: "json" };
import DotnsContentResolver from "../../abis/DotnsContentResolver.json" assert { type: "json" };
import DotnsResolver from "../../abis/DotnsResolver.json" assert { type: "json" };
import DotnsNameEscrow from "../../abis/DotnsNameEscrow.json" assert { type: "json" };
import PopRules from "../../abis/PopRules.json" assert { type: "json" };
import StoreFactory from "../../abis/StoreFactory.json" assert { type: "json" };
import Store from "../../abis/Store.json" assert { type: "json" };

export const PREVIEW_BASE_URL = "http://dotns.paseo.li/#/preview";
export const PASEO_ASSET_HUB_URL = "wss://paseo-asset-hub-next-rpc.polkadot.io";
export const PASEO_IPFS_GATEWAY_URL = "https://paseo-bulletin-next-ipfs.polkadot.io/ipfs";
export const PERSONHOOD_PRECOMPILE_ADDRESS =
  "0x000000000000000000000000000000000a010000" as Address;
export const PERSONHOOD_CONTEXT =
  "0x646f746e73000000000000000000000000000000000000000000000000000000" as Hex;
export const DEFAULT_BULLETIN_RPC = "wss://paseo-bulletin-rpc.polkadot.io";
export const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_SINGLE_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_RETRIES = 5;
export const MAX_UPLOAD_MAX_RETRIES = 20;
export const UPLOAD_RETRY_BASE_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
export const DEFAULT_AUTHORIZATION_TRANSACTIONS = 1000000;
export const DEFAULT_AUTHORIZATION_BYTES = BigInt(1073741824);
export const DEFAULT_VERIFICATION_GATEWAY = PASEO_IPFS_GATEWAY_URL;
export const DOT_NODE: Hex = "0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce";

export const DEFAULT_NATIVE_TOKEN_DECIMALS = 10;
export const EVM_TOKEN_DECIMALS = 18;

export const DEFAULT_MNEMONIC =
  "bottom drive obey lake curtain smoke basket hold race lonely fit walk";

export const DEFAULT_SUDO_KEY_URI = "//Alice";

export const BULLETIN_BLOCK_TIME_MS = 6000;

export const OPERATION_TIMEOUT_MILLISECONDS = 300_000;

export const DEFAULT_COMMITMENT_BUFFER_SECONDS = 6;
export const COMMITMENT_POLL_TIMEOUT_MS = 30_000;
export const COMMITMENT_POLL_INTERVAL_MS = 2_000;

export function getCommitmentBufferSeconds(): number {
  const parsed = Number(process.env.DOTNS_COMMITMENT_BUFFER ?? DEFAULT_COMMITMENT_BUFFER_SECONDS);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_COMMITMENT_BUFFER_SECONDS;
  return parsed;
}

export const DOTNS_REGISTRAR_CONTROLLER_ABI = DotnsRegistrarController.abi as Abi;
export const DOTNS_REGISTRY_ABI = DotnsRegistry.abi as Abi;
export const DOTNS_REGISTRAR_ABI = DotnsRegistrar.abi as Abi;
export const DOTNS_REVERSE_RESOLVER_ABI = DotnsReverseResolver.abi as Abi;
export const DOTNS_CONTENT_RESOLVER_ABI = DotnsContentResolver.abi as Abi;
export const DOTNS_RESOLVER_ABI = DotnsResolver.abi as Abi;
export const DOTNS_NAME_ESCROW_ABI = DotnsNameEscrow.abi as Abi;
export const POP_RULES_ABI = PopRules.abi as Abi;
export const STORE_FACTORY_ABI = StoreFactory.abi as Abi;
export const STORE_ABI = Store.abi as Abi;
export const PERSONHOOD_ABI = [
  {
    type: "function",
    name: "personhoodStatus",
    inputs: [
      { name: "account", type: "address" },
      { name: "context", type: "bytes32" },
    ],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "contextAlias", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "personhoodInfoByProof",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "expectedStatus", type: "uint8" },
          { name: "proof", type: "bytes" },
          { name: "expectedAlias", type: "bytes32" },
          { name: "ringIndex", type: "uint32" },
          { name: "context", type: "bytes32" },
          { name: "revision", type: "uint32" },
          { name: "message", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "ok", type: "bool" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

export const RPC_ENDPOINTS = [PASEO_ASSET_HUB_URL] as const;

export const DOTNS_ENVIRONMENT_IDS = ["paseo-v2"] as const;
export type DotnsEnvironmentId = (typeof DOTNS_ENVIRONMENT_IDS)[number];

export type DotnsContractAddresses = {
  /** DotNS domain registrar - handles ownership NFTs */
  DOTNS_REGISTRAR: Address;

  /** Registration controller - manages commit-reveal registration */
  DOTNS_REGISTRAR_CONTROLLER: Address;

  /** stores domain records */
  DOTNS_REGISTRY: Address;

  /** Forward resolution resolver */
  DOTNS_RESOLVER: Address;

  /** Content hash resolver - stores IPFS CIDs */
  DOTNS_CONTENT_RESOLVER: Address;

  /** User store factory - deploys per-user storage contracts */
  STORE_FACTORY: Address;

  /** Proof of Personhood RULES - verifies eligibility and pricing */
  DOTNS_RULES: Address;

  /** Name escrow - holds NoStatus deposits and the refund-on-leave ledger */
  DOTNS_NAME_ESCROW: Address;

  /** Multicall3 - batch read contract calls */
  MULTICALL3: Address;
};

export type DotnsEnvironmentConfig = {
  id: DotnsEnvironmentId;
  label: string;
  aliases: readonly string[];
  rpc: string;
  blockExplorerUrl: string;
  contracts: DotnsContractAddresses;
};

const SHARED_MULTICALL3 = "0xFc430CcCdb9335C1907fc72e93eb1f48e847319C" as Address;

export const DOTNS_ENVIRONMENTS: Record<DotnsEnvironmentId, DotnsEnvironmentConfig> = {
  "paseo-v2": {
    id: "paseo-v2",
    label: "Paseo V2",
    aliases: ["paseo-v2", "paseo_v2", "v2", "paseo", "next", "next-v2"],
    rpc: RPC_ENDPOINTS[0],
    blockExplorerUrl: "https://blockscout-testnet.polkadot.io",
    contracts: {
      DOTNS_REGISTRAR: "0xf7Ad3F44F316C73E4a2b46b1ed48d376bCc9E639" as Address,
      DOTNS_REGISTRAR_CONTROLLER: "0x674b705268DAE369F0a7BE9cbaCDb928b8BA38C2" as Address,
      DOTNS_REGISTRY: "0xa1b2b939E82b2ecE55Bd8a0E283818BfC1CA6CDc" as Address,
      DOTNS_RESOLVER: "0xA8988eA083174ea94Ed1D686f0F073a10f65598D" as Address,
      DOTNS_CONTENT_RESOLVER: "0x8A26480b0B5Df3d4D9b95adc24a5Ecb33A5b8F64" as Address,
      STORE_FACTORY: "0x692047C1477a017F287488E1c85F96Ca28C23fD8" as Address,
      DOTNS_RULES: "0x4909bFb3f4Fd86244abD6430fDfA0Ce5C91aD0c4" as Address,
      DOTNS_NAME_ESCROW: "0x2Cb9899d91Ee575E8917958723F5E941b1BcC6A1" as Address,
      MULTICALL3: SHARED_MULTICALL3,
    },
  },
};

export const DEFAULT_DOTNS_ENVIRONMENT: DotnsEnvironmentId = "paseo-v2";

let activeDotnsEnvironment: DotnsEnvironmentId = DEFAULT_DOTNS_ENVIRONMENT;

function normaliseEnvironmentToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function resolveDotnsEnvironmentId(value?: string): DotnsEnvironmentId {
  const raw = value?.trim();
  if (!raw) return DEFAULT_DOTNS_ENVIRONMENT;

  const token = normaliseEnvironmentToken(raw);
  for (const [id, config] of Object.entries(DOTNS_ENVIRONMENTS) as [
    DotnsEnvironmentId,
    DotnsEnvironmentConfig,
  ][]) {
    if (id === token || config.aliases.includes(token)) return id;
  }

  throw new Error(
    `Unknown DotNS environment "${value}". Use one of: ${DOTNS_ENVIRONMENT_IDS.join(", ")}`,
  );
}

export function setActiveDotnsEnvironment(value?: string): DotnsEnvironmentConfig {
  activeDotnsEnvironment = resolveDotnsEnvironmentId(value);
  return DOTNS_ENVIRONMENTS[activeDotnsEnvironment];
}

export function getActiveDotnsEnvironment(): DotnsEnvironmentConfig {
  return DOTNS_ENVIRONMENTS[activeDotnsEnvironment];
}

export function getDotnsEnvironment(value?: string): DotnsEnvironmentConfig {
  return DOTNS_ENVIRONMENTS[resolveDotnsEnvironmentId(value)];
}

export const CONTRACTS = new Proxy({} as DotnsContractAddresses, {
  get(_target, property: string | symbol) {
    if (typeof property === "symbol") return undefined;
    return getActiveDotnsEnvironment().contracts[property as keyof DotnsContractAddresses];
  },
  ownKeys() {
    return Reflect.ownKeys(getActiveDotnsEnvironment().contracts);
  },
  getOwnPropertyDescriptor(_target, property: string | symbol) {
    if (typeof property === "symbol") return undefined;
    return {
      enumerable: true,
      configurable: true,
      value: getActiveDotnsEnvironment().contracts[property as keyof DotnsContractAddresses],
    };
  },
}) as DotnsContractAddresses;
