import type { Address, Hex } from "viem";
import type { StoredAuth } from "../cli/keystore/types";
import type { Ora } from "ora";

export enum ProofOfPersonhoodStatus {
  /** No verification - base level access only */
  NoStatus = 0,
  /** Lite verification - access to suffixed names */
  ProofOfPersonhoodLite = 1,
  /** Full verification - access to all public names */
  ProofOfPersonhoodFull = 2,
  /** Reserved for governance - controlled names */
  Reserved = 3,
}

export type DomainRegistration = {
  /** Domain label without the .dot suffix (e.g., "example" for "example.dot") */
  label: string;
  /** Ethereum address (H160) that will own the domain */
  owner: Address;
  /** 32-byte cryptographic secret for commitment scheme */
  secret: Hex;
  /** Whether this registration includes reverse record setup */
  reserved: boolean;
};

export type TransactionStatus = "signing" | "broadcasting" | "included" | "finalized" | "failed";

export type SubstrateWeight = {
  /** Reference time in picoseconds */
  referenceTime: bigint;
  /** Proof size in bytes */
  proofSize: bigint;
};

export type ReviveCallResult = {
  /** Weight consumed during execution */
  gasConsumed: SubstrateWeight;
  /** Minimum weight required for successful execution */
  gasRequired: SubstrateWeight;
  /** Storage deposit charged or refunded */
  storageDeposit: {
    /** Deposit amount in native substrate units (12 decimals for PAS) */
    value: bigint;
  };
  /** Execution outcome */
  result: {
    /** True if execution succeeded without revert */
    isOk: boolean;
    /** True if execution reverted or failed */
    isErr: boolean;
    /** Return data or revert reason */
    value: {
      /** ABI-encoded return data */
      data: `0x${string}`;
      /** EVM status flags (bit 0 = reverted) */
      flags: bigint;
    };
  };
};

export type RegistrationCommandOptions = {
  /** Domain label to register (without .dot) */
  name?: string;
  /** Proof of Personhood status requirement */
  status: "none" | "lite" | "full";
  /** Enable reverse record registration */
  reverse: boolean;
  /** Use governance registration path */
  governance: boolean;
  /** Transfer domain after registration */
  transferAfterRegistration: boolean;
  /** Transfer destination (EVM address, SS58, or domain label) */
  transferTo?: string;
  /** BIP39 mnemonic phrase for account derivation */
  mnemonic?: string;
  /** Substrate key URI (e.g., //Alice for dev accounts) */
  keyUri?: string;
  /** Owner of the new name, can be a substrate address, evm address, or label, undefined means the account making the call */
  owner?: string | Address;
};

export type LookupCommandOptions = {
  /** Domain label to query (without .dot) */
  name: string;
  /** BIP39 mnemonic phrase for account derivation */
  mnemonic?: string;
  /** Substrate key URI (e.g., //Alice for dev accounts) */
  keyUri?: string;
};

export type ContentHashCommandOptions = {
  /** Domain label (without .dot) */
  name: string;
  /** IPFS CID to set (for set operation) */
  contentId?: string;
  /** BIP39 mnemonic phrase for account derivation */
  mnemonic?: string;
  /** Substrate key URI (e.g., //Alice for dev accounts) */
  keyUri?: string;
};

export type OwnershipLookupOptions = Partial<RegistrationCommandOptions> & {
  /** The label we are attempting to lookup */
  name: string;
};

export type DomainOwnership = {
  /** Whether the domain is currently registered */
  isRegistered: boolean;
  /** EVM address of the domain owner (H160 format) */
  ownerEvmAddress: Address | null;
  /** Substrate SS58 address of the domain owner */
  ownerSubstrateAddress: string | null;
};

export type AuthType = "mnemonic" | "key-uri" | "unknown";

export type AuthOptionValues = {
  /** WebSocket RPC endpoint URL */
  rpc?: string;
  /** Path to keystore directory */
  keystorePath?: string;
  /** Minimum balance in PAS required for operations */
  minBalance?: string;
  /** Account name to use from keystore */
  account?: string;
  /** Password to decrypt keystore */
  password?: string;
  /** BIP39 mnemonic phrase for account derivation */
  mnemonic?: string;
  /** Substrate key URI (e.g., //Alice) */
  keyUri?: string;
};

export type AccountKeystorePayload = {
  /** Schema version for future compatibility */
  version: 1;
  /** Account name (original, not sanitized for filename) */
  account: string;
  /** Stored authentication credentials */
  auth: StoredAuth;
  /** ISO timestamp of last update */
  updatedAtIso: string;
};

export type CommandOptions = {
  /** Path to keystore directory */
  keystorePath?: string;
  /** Password to decrypt keystore */
  password?: string;
  /** Account name to use */
  account?: string;
  /** BIP39 mnemonic phrase */
  mnemonic?: string;
  /** Substrate key URI */
  keyUri?: string;
};

export type AccountInfo = {
  /** Account name (original, not sanitized) */
  name: string;
  /** Full path to the account's encrypted file */
  filePath: string;
  /** Whether this account is set as the default */
  isDefault: boolean;
  /** Type of authentication stored (if decrypted) */
  authType?: AuthType;
};

export type KeystoreDirectoryInfo = {
  /** Full path to the keystore directory */
  directoryPath: string;
  /** Whether the directory exists on disk */
  exists: boolean;
  /** Name of the default account (if set) */
  defaultAccount?: string;
  /** List of account filenames (e.g., ["default.json", "alice.json"]) */
  accountFiles: string[];
};

export type ResolveSource = "cli" | "env" | "keystore" | "default";

export type ResolvedAuthSource = {
  /** The mnemonic phrase or key URI to use */
  source: string;
  /** Whether source is a key URI (true) or mnemonic (false) */
  isKeyUri: boolean;
  /** Where the auth source was found */
  resolvedFrom: ResolveSource;
  /** The account name that was used */
  account: string;
};

export type CommitmentResults = {
  /** Commitment hash for the registration */
  commitment: Hex;
  /** Domain registration parameters */
  registration: DomainRegistration;
};

export type BulletinUploadOptions = {
  /** Bulletin WebSocket RPC endpoint */
  bulletinRpc?: string;
  /** Chunk size for large uploads in bytes */
  chunkSize?: string;
  /** Force chunked upload mode (DAG-PB) */
  forceChunked?: boolean;
  /** Print IPFS contenthash in addition to CID */
  printContenthash?: boolean;
  /** Number of transactions to authorize */
  transactions?: string;
  /** Number of bytes to authorize */
  bytes?: string;
};

export type BulletinStoreParams = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer mnemonic phrase */
  signerMnemonic?: string;
  /** Signer derivation path */
  signerDerivePath?: string;
  /** Bytes to store */
  bytes: Uint8Array;
  /** CID codec identifier */
  codec: number;
  /** Hash algorithm code */
  hashCode: number;
  /** Spinner instance for progress updates */
  spinner?: Ora;
  /** Operation name for status messages */
  operationName?: string;
  /** Whether to emit transaction status updates */
  emitStatus?: boolean;
  /** Whether to print operation summary */
  printSummary?: boolean;
};

export type SudoStoreResults = {
  /** Content identifier for stored data */
  cid: string;
  /** Bulletin storage index if available */
  storedIndex?: string;
};

export type BalanceStatus = {
  /** Whether balance meets minimum requirement */
  ok: boolean;
  /** Current account balance in native units */
  current: bigint;
  /** Required minimum balance in native units */
  required: bigint;
};

export type AccountInfoOptions = {
  /** WebSocket RPC endpoint URL */
  rpc?: string;
};

export type NameClassificationLike = readonly [ProofOfPersonhoodStatus | number | bigint, string];

export type ReservationInfoLike = readonly [boolean, Address, bigint];

export type NameClassification = {
  /** Proof-of-personhood status required to register the label */
  requiredStatus: ProofOfPersonhoodStatus;
  /** Human-readable explanation from PopRules */
  message: string;
};

export type PricingAndEligibility = {
  /** Price in wei (PAS smallest unit) returned by PopRules.price */
  priceWei: bigint;
  /** Price in wei (PAS smallest unit) returned by PopRules.price */
  price: bigint;
  /** Proof-of-personhood status required to register the label */
  requiredStatus: ProofOfPersonhoodStatus;
  /** Current user proof-of-personhood status from PopRules.userPopStatus */
  status: ProofOfPersonhoodStatus;
  /** Current user proof-of-personhood status from PopRules.userPopStatus */
  userStatus: ProofOfPersonhoodStatus;
  /** Human-readable explanation from PopRules */
  message: string;
};
