import type { Abi, Address, Hex } from "viem";
import DotnsRegistrarController from "../../abis/DotnsRegistrarController.json" assert { type: "json" };
import DotnsRegistry from "../../abis/DotnsRegistry.json" assert { type: "json" };
import DotnsRegistrar from "../../abis/DotnsRegistrar.json" assert { type: "json" };
import DotnsContentResolver from "../../abis/DotnsContentResolver.json" assert { type: "json" };
import DotnsResolver from "../../abis/DotnsResolver.json" assert { type: "json" };
import DotnsNameEscrow from "../../abis/DotnsNameEscrow.json" assert { type: "json" };
import PopRules from "../../abis/PopRules.json" assert { type: "json" };
import StoreFactory from "../../abis/StoreFactory.json" assert { type: "json" };
import LabelStore from "../../abis/LabelStore.json" assert { type: "json" };
import UserStore from "../../abis/UserStore.json" assert { type: "json" };
import DotnsPopController from "../../abis/DotnsPopController.json" assert { type: "json" };

export const PREVIEW_BASE_URL = "http://dotns.paseo.li/#/preview";

// dot.li serves a name as a gateway subdomain: strip the .dot TLD and append the
// gateway domain (mainnet dot.li, Paseo testnet paseo.li).
export const DOTLI_GATEWAYS = ["dot.li", "paseo.li"] as const;

/** Both dot.li viewing URLs for a name, e.g. ["https://alice.dot.li", "https://alice.paseo.li"]. */
export function dotliViewUrls(name: string): string[] {
  const stem = name.toLowerCase().replace(/\.dot$/, "");
  return DOTLI_GATEWAYS.map((gateway) => `https://${stem}.${gateway}`);
}
export const PASEO_ASSET_HUB_URL = "wss://paseo-asset-hub-next-rpc.polkadot.io";
export const PREVIEWNET_ASSET_HUB_URL = "wss://previewnet.substrate.dev/asset-hub";
export const PASEO_IPFS_GATEWAY_URL = "https://paseo-bulletin-next-ipfs.polkadot.io/ipfs";
export const PERSONHOOD_PRECOMPILE_ADDRESS =
  "0x000000000000000000000000000000000a010000" as Address;
export const PERSONHOOD_CONTEXT =
  "0x646f746e73000000000000000000000000000000000000000000000000000000" as Hex;
export const DEFAULT_BULLETIN_RPC = "wss://paseo-bulletin-next-rpc.polkadot.io";
export const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
// Chain MaxTransactionSize; larger single uploads must be chunked.
export const MAX_SINGLE_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
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

export const MIN_KEYSTORE_PASSWORD_LENGTH = 6;

// The Bulletin Authorizer that grants storage quota. //Eve is seeded into
// AllowedAuthorizers on the bulletin testnet and dev runtimes (the same key the
// Bulletin console faucet signs with). //Alice is sudo and a storage account,
// not an authorizer, so a plain signed authorize from Alice is rejected as
// BadOrigin.
export const DEFAULT_BULLETIN_AUTHORIZER_KEY_URI = "//Eve";

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

export const DOTNS_REGISTRAR_CONTROLLER_ABI = DotnsRegistrarController as Abi;
export const DOTNS_REGISTRY_ABI = DotnsRegistry as Abi;
export const DOTNS_REGISTRAR_ABI = DotnsRegistrar as Abi;
export const DOTNS_CONTENT_RESOLVER_ABI = DotnsContentResolver as Abi;
export const DOTNS_RESOLVER_ABI = DotnsResolver as Abi;
export const DOTNS_NAME_ESCROW_ABI = DotnsNameEscrow as Abi;
export const POP_RULES_ABI = PopRules as Abi;
export const STORE_FACTORY_ABI = StoreFactory as Abi;
export const LABEL_STORE_ABI = LabelStore.abi as Abi;
export const USER_STORE_ABI = UserStore.abi as Abi;
export const DOTNS_POP_CONTROLLER_ABI = DotnsPopController.abi as Abi;
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

export const RPC_ENDPOINTS = [PASEO_ASSET_HUB_URL, PREVIEWNET_ASSET_HUB_URL] as const;

/**
 * Default libp2p peer addresses used to bootstrap a Helia client against the
 * Paseo V2 bulletin (next) network. Other environments declare their own peer
 * lists in `DOTNS_ENVIRONMENTS`.
 */
export const PASEO_BULLETIN_PEERS: readonly string[] = [
  "/dns4/paseo-bulletin-next-collator-node-0.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWDGdPBWpytPdNAXDT2KJWwmPXkxvxyQLGc7pRdFWeZnyB",
  "/dns4/paseo-bulletin-next-collator-node-1.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWC45NgktSLMPQafAhi8TMAtiiatnmNc3Qv6wA74u7YBVc",
  "/dns4/paseo-bulletin-next-rpc-node-0.polkadot.io/tcp/443/wss/p2p/12D3KooWS4ptBbHGritdb1T7JPxKT2EN7FXvqq9rUp12jUvjnqQ1",
  "/dns4/paseo-bulletin-next-rpc-node-1.polkadot.io/tcp/443/wss/p2p/12D3KooWKMc4jJsU7fdEsis4AsM8Assk5jFqhEUEa2ZSiWJGKpfv",
];

export const DOTNS_ENVIRONMENT_IDS = ["paseo-v2", "previewnet"] as const;
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

  /** Proof of Personhood controller - claims LabelStore and settles deferred labels */
  DOTNS_POP_CONTROLLER: Address;

  /** Name escrow - holds NoStatus deposits and the refund-on-leave ledger */
  DOTNS_NAME_ESCROW: Address;

  /** Multicall3 - batch read contract calls */
  MULTICALL3: Address;
};

export type DotnsEnvironmentConfig = {
  id: DotnsEnvironmentId;
  label: string;
  aliases: readonly string[];
  /**
   * Asset Hub WebSocket RPC endpoint. `null` for environments without an Asset
   * Hub (bulletin-only). Asset Hub-dependent commands throw a clear error when
   * accessed on such an environment.
   */
  rpc: string | null;
  blockExplorerUrl: string;
  /**
   * Contract address book. `null` when contracts have not been deployed to (or
   * recorded for) this environment. `CONTRACTS` accesses throw in that case.
   */
  contracts: DotnsContractAddresses | null;
  /**
   * Bulletin chain WebSocket RPC endpoint. `null` for environments without a
   * bulletin deployment. `resolveBulletinRpc` throws if nothing resolves.
   */
  bulletinRpc: string | null;
  /**
   * IPFS HTTP gateway base URL (with or without trailing `/ipfs`). `null` for
   * environments where no gateway is operated; verification calls throw rather
   * than silently swapping to the Paseo gateway.
   */
  ipfsGatewayUrl: string | null;
  /**
   * libp2p multiaddresses for the bulletin P2P swarm. Empty list means P2P
   * verification is not available for this environment.
   */
  bulletinP2pPeers: readonly string[];
};

const SHARED_MULTICALL3 = "0xFc430CcCdb9335C1907fc72e93eb1f48e847319C" as Address;

export const DOTNS_ENVIRONMENTS: Record<DotnsEnvironmentId, DotnsEnvironmentConfig> = {
  "paseo-v2": {
    id: "paseo-v2",
    label: "Paseo V2",
    aliases: ["paseo-v2", "paseo_v2", "v2", "next", "next-v2"],
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
      DOTNS_POP_CONTROLLER: "0x1c858C31497a7715C0D56A11208feB6b74FaB2aB" as Address,
      DOTNS_NAME_ESCROW: "0x2Cb9899d91Ee575E8917958723F5E941b1BcC6A1" as Address,
      MULTICALL3: SHARED_MULTICALL3,
    },
    bulletinRpc: DEFAULT_BULLETIN_RPC,
    ipfsGatewayUrl: PASEO_IPFS_GATEWAY_URL,
    bulletinP2pPeers: PASEO_BULLETIN_PEERS,
  },
  previewnet: {
    id: "previewnet",
    label: "Paseo Asset Hub Previewnet",
    aliases: ["previewnet", "preview-net", "preview", "ppn"],
    rpc: PREVIEWNET_ASSET_HUB_URL,
    blockExplorerUrl: "https://blockscout-testnet.polkadot.io",
    contracts: {
      DOTNS_REGISTRAR: "0x061273AeF34e8ab9Ca08E199d7440E2639Fc2088" as Address,
      DOTNS_REGISTRAR_CONTROLLER: "0xC0c21ca6302884572E61d69D5bf3E271Acf39B23" as Address,
      DOTNS_REGISTRY: "0x5622CA75C75726Da13ae46C69127C07c87538633" as Address,
      DOTNS_RESOLVER: "0x823f39E7a4126669be53211FFbCF27e55b3274C6" as Address,
      DOTNS_CONTENT_RESOLVER: "0xBD003d5Dd04E68aC60d529a46AEfBdEf8941868C" as Address,
      STORE_FACTORY: "0x4BEFaB5de968183524b1eBd2FAec9C68Cdc696Fd" as Address,
      DOTNS_RULES: "0xF209a15e8a10D208bb4d3e3c56D9EB73a5934C26" as Address,
      DOTNS_POP_CONTROLLER: "0xae2c63b921Bc9DC30C149A8FA462fd3efA53D1F4" as Address,
      DOTNS_NAME_ESCROW: "0xb7E39199f13aCf7e90cCf67b980aC3ef0E2C4Fbe" as Address,
      MULTICALL3: "0x758F88C7761FCD4742f9471448c2209a7e859280" as Address,
    },
    bulletinRpc: "wss://previewnet.substrate.dev/bulletin",
    ipfsGatewayUrl: "https://previewnet.substrate.dev/ipfs",
    bulletinP2pPeers: [],
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

function requireContracts(): DotnsContractAddresses {
  const environment = getActiveDotnsEnvironment();
  if (!environment.contracts) {
    throw new Error(
      `Contract addresses for environment '${environment.id}' are not configured. Use --env paseo-v2 or set DOTNS_ENV=paseo-v2.`,
    );
  }
  return environment.contracts;
}

export const CONTRACTS = new Proxy({} as DotnsContractAddresses, {
  get(_target, property: string | symbol) {
    if (typeof property === "symbol") return undefined;
    return requireContracts()[property as keyof DotnsContractAddresses];
  },
  ownKeys() {
    return Reflect.ownKeys(requireContracts());
  },
  getOwnPropertyDescriptor(_target, property: string | symbol) {
    if (typeof property === "symbol") return undefined;
    return {
      enumerable: true,
      configurable: true,
      value: requireContracts()[property as keyof DotnsContractAddresses],
    };
  },
}) as DotnsContractAddresses;
