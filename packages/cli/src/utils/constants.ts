import type { Abi, Address, Hex } from "viem";
import DotnsRegistrarController from "../../abis/DotnsRegistrarController.json" with { type: "json" };
import DotnsRegistry from "../../abis/DotnsRegistry.json" with { type: "json" };
import DotnsRegistrar from "../../abis/DotnsRegistrar.json" with { type: "json" };
import DotnsContentResolver from "../../abis/DotnsContentResolver.json" with { type: "json" };
import DotnsResolver from "../../abis/DotnsResolver.json" with { type: "json" };
import DotnsReverseResolver from "../../abis/DotnsReverseResolver.json" with { type: "json" };
import DotnsPopResolver from "../../abis/DotnsPopResolver.json" with { type: "json" };
import DotnsNameEscrow from "../../abis/DotnsNameEscrow.json" with { type: "json" };
import PopRules from "../../abis/PopRules.json" with { type: "json" };
import StoreFactory from "../../abis/StoreFactory.json" with { type: "json" };
import LabelStore from "../../abis/LabelStore.json" with { type: "json" };
import UserStore from "../../abis/UserStore.json" with { type: "json" };
import DotnsPopController from "../../abis/DotnsPopController.json" with { type: "json" };
import DotnsNameWhitelist from "../../abis/DotnsNameWhitelist.json" with { type: "json" };

export const PERSONHOOD_PRECOMPILE_ADDRESS =
  "0x000000000000000000000000000000000a010000" as Address;
export const PERSONHOOD_CONTEXT =
  "0x646f746e73000000000000000000000000000000000000000000000000000000" as Hex;
// bytes32("costModel"): the protocol-registry key the controller resolves the
// cost-model registry under (DotnsConstants.COST_MODEL). Read its currentVersion()
// to stamp a registration's pricingVersion.
export const COST_MODEL_REGISTRY_KEY =
  "0x636f73744d6f64656c0000000000000000000000000000000000000000000000" as Hex;
export const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
// Chain MaxTransactionSize; larger single uploads must be chunked.
export const MAX_SINGLE_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_UPLOAD_MAX_RETRIES = 5;
export const MAX_UPLOAD_MAX_RETRIES = 20;
export const UPLOAD_RETRY_BASE_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
export const DEFAULT_AUTHORIZATION_TRANSACTIONS = 1000000;
export const DEFAULT_AUTHORIZATION_BYTES = BigInt(1073741824);

export const DEFAULT_NATIVE_TOKEN_DECIMALS = 10;
export const DEFAULT_NATIVE_TOKEN_SYMBOL = "DOT";
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
export const DOTNS_REVERSE_RESOLVER_ABI = DotnsReverseResolver as Abi;
export const DOTNS_POP_RESOLVER_ABI = DotnsPopResolver as Abi;
export const DOTNS_NAME_ESCROW_ABI = DotnsNameEscrow as Abi;
export const POP_RULES_ABI = PopRules as Abi;
export const STORE_FACTORY_ABI = StoreFactory as Abi;
export const LABEL_STORE_ABI = LabelStore as Abi;
export const USER_STORE_ABI = UserStore as Abi;
export const DOTNS_POP_CONTROLLER_ABI = DotnsPopController as Abi;
export const DOTNS_NAME_WHITELIST_ABI = DotnsNameWhitelist as Abi;
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

// The dotNS protocol releases this SDK is built against, oldest first. A network
// declares the release it runs through `DotnsProtocolRegistry.protocolVersion()`,
// and the CLI refuses a network that does not declare one of these. The release notes read the compatibility line
// from here, so the list and the notes cannot disagree.
export const SUPPORTED_PROTOCOL_VERSIONS = ["0.8.0", "1.0.0", "1.1.0"] as const;
