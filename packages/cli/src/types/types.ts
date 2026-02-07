import type { Address, Hex } from "viem";
import type { StoredAuth } from "../cli/keystore/types";
import type { Ora } from "ora";
import type { PolkadotSigner, TypedApi } from "polkadot-api";
import type { ReviveClientWrapper, PolkadotApiClient } from "../client/polkadotClient";
import type { Bulletin } from "@polkadot-api/descriptors";

export enum ProofOfPersonhoodStatus {
  NoStatus = 0,
  ProofOfPersonhoodLite = 1,
  ProofOfPersonhoodFull = 2,
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
  /** Parent domain label for subname registration (without .dot) */
  parent?: string;
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
  /** The label without the .dot */
  label?: string;

  /** The label with the .dot */
  domain?: string;

  /** Whether the domain is currently registered */
  registered: boolean;

  /** EVM address of the domain owner (H160 format) */
  ownerEvm: string;

  /** Substrate SS58 address of the domain owner */
  ownerSubstrate: string;
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
  /** Upload directory blocks in parallel (faster but requires nonce management) */
  parallel?: boolean;
  /** Number of parallel uploads when --parallel is enabled (default: 5) */
  concurrency?: string;
  /** Print IPFS contenthash in addition to CID */
  printContenthash?: boolean;
  /** Number of transactions to authorize */
  transactions?: string;
  /** Number of bytes to authorize */
  bytes?: string;
  /**  Output as json */
  json: boolean;
  /** Whether to store the current upload to the local history db */
  history: boolean;
  /**The default sudo key uri */
  sudoKeyUri: string;
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

export type BulletinStoreResult = {
  /** Content identifier (CID) for the stored data */
  cid: string;
  /** Storage index assigned by TransactionStorage pallet */
  storedIndex?: string;
  /** Hash of the block containing the finalized store transaction */
  blockHash?: string;
};

export type ChunkedStoreResult = {
  /** Root CID of the DAG-PB merkle tree linking all chunks */
  rootCid: string;
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

export type AuthorizeAccountOptions = {
  /** Bulletin WebSocket RPC endpoint URL */
  rpc: string;
  /** Signer with sudo privileges for authorization */
  sudoSigner: PolkadotSigner;
  /** SS58 address of the account to authorize */
  targetAddress: string;
  /** Maximum number of store transactions allowed */
  transactions?: number;
  /** Maximum bytes allowed to store */
  bytes?: bigint;
};

export type AuthorizeAccountResult = {
  /** Transaction hash of the authorization extrinsic */
  txHash: string;
  /** Hash of the block containing the finalized transaction */
  blockHash: string;
};

export type ValidatePathResult = {
  /** File contents as bytes (empty for directories) */
  bytes: Uint8Array;
  /** Whether the path points to a directory */
  isDirectory: boolean;
  /** Absolute path after resolution */
  resolvedPath: string;
};

export type StoreDirectoryResult = {
  /** CID of the content stored on Bulletin */
  storageCid: string;
  /** Original IPFS CID of the merkleized directory structure */
  ipfsCid: string;
};

export type StoreDirectoryOptions = {
  /** SS58 address for nonce management in parallel mode */
  accountAddress?: string;
  /** Enable parallel block uploads with nonce pre-assignment */
  parallel?: boolean;
  /** Maximum concurrent upload operations */
  concurrency?: number;
  /** Gateway URL for content resolution verification */
  verificationGateway?: string;
};

export type UploadRecord = {
  /** Content identifier for the uploaded data */
  cid: string;
  /** Original IPFS CID for directory uploads */
  ipfsCid?: string;
  /** Local filesystem path that was uploaded */
  path: string;
  /** Whether upload was a single file or directory */
  type: "file" | "directory";
  /** Size of uploaded content in bytes */
  size: number;
  /** ISO timestamp when upload completed */
  timestamp: string;
};

export type SingleStorageParams = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Data bytes to be stored */
  data: Uint8Array;
};

export type StoreChunkedParams = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Array of data chunks to be stored */
  chunks: Uint8Array[];
};

export type MerkleizedDirectory = {
  /** Root CID of the merkleized directory (DAG-PB) */
  rootCid: string;
  /** CAR file bytes representing the merkleized directory */
  carFileBytes: Uint8Array;
};

export type MerkleizeResult = {
  /** CID of the merkleized content */
  cid: string;
};

export type VerificationResult = {
  /** Content identifier that was verified */
  cid: string;
  /** Whether the CID was successfully resolved */
  resolvable: boolean;
  /** Gateway URL used for verification */
  gateway: string;
  /** HTTP status code from the gateway response */
  statusCode?: number;
  /** Error message if resolution failed */
  errorMessage?: string;
};

export type BlockVerificationResult = {
  /** Total number of CIDs verified */
  totalBlocks: number;
  /** List of CIDs that were successfully resolved */
  resolvableBlocks: string[];
  /** List of CIDs that could not be resolved */
  missingBlocks: string[];
  /** Gateway URL used for verification */
  gateway: string;
};

export type HashingEnumVariant =
  | { type: "Sha2_256"; value: undefined }
  | { type: "Blake2b256"; value: undefined }
  | { type: "Keccak256"; value: undefined };

export type StoreContentParameters = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Raw bytes of content to store */
  contentBytes: Uint8Array;
  /** Pre-computed CID for the content */
  contentCid: string;
  /** Codec identifier for CID computation */
  codecValue: number;
  /** Hash algorithm code for CID computation */
  hashCodeValue: number;
  /** Optional nonce for transaction ordering */
  nonce?: number;
  /** Callback for progress updates */
  onProgress?: (status: string) => void;
};

export type StoreSingleFileParameters = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Raw bytes of file content to store */
  contentBytes: Uint8Array;
  /** Callback for progress updates */
  onProgress?: (status: string) => void;
};

export type StoreChunkedFileParameters = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Array of content chunks to store */
  contentChunks: Uint8Array[];
  /** Callback for progress updates with chunk position */
  onProgress?: (currentChunk: number, totalChunks: number, status: string) => void;
};

export type StoreBlockParameters = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Raw bytes of block content to store */
  contentBytes: Uint8Array;
  /** Pre-computed CID for the block */
  contentCid: string;
  /** Codec identifier for CID computation */
  codecValue: number;
  /** Hash algorithm code for CID computation */
  hashCodeValue: number;
  /** Optional nonce for transaction ordering */
  nonce?: number;
};

export type StoreParameters = {
  /** Bulletin RPC endpoint URL */
  rpcEndpoint: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Raw bytes of content to store */
  contentBytes: Uint8Array;
  /** Pre-computed CID for the content */
  contentCid: string;
  /** Codec identifier for CID computation */
  codecValue: number;
  /** Hash algorithm code for CID computation */
  hashCodeValue: number;
  /** Optional nonce for transaction ordering */
  transactionNonce?: number;
  /** Callback for progress updates */
  onProgress?: (status: string) => void;
};

export type AuthSource = {
  /** BIP-39 mnemonic phrase used to derive the signing key */
  mnemonic?: string;
  /** Substrate secret URI (SURI) used to derive/load a signing key (e.g. "//Alice") */
  keyUri?: string;
  /** Filesystem path to the encrypted keystore file or directory */
  keystorePath?: string;
  /** Keystore account selector (e.g. profile name or address) to load/unlock */
  account?: string;
  /** Password used to unlock/decrypt the keystore or SURI, when required */
  password?: string;
};

export type LookupActionOptions = CommandOptions &
  AuthSource & {
    /** Domain label to lookup (commander option passthrough) */
    name?: string;
    /** Internal: resolved label provided positionally */
    __positionalLabel?: string;
    /**  Output as json */
    json: boolean;
  };

export type ReadOnlyContextAccount = {
  /** Substrate SS58 address used for lookups */
  address: string;
};

export type ReadOnlyContext = {
  /** Typed chain client wrapper used for queries */
  clientWrapper: ReviveClientWrapper;
  /** Minimal account object containing only an address for lookups */
  account: ReadOnlyContextAccount;
  /** RPC endpoint used to connect to the chain */
  rpc: string;
  /** EVM address corresponding to the Substrate address, when resolvable */
  evmAddress: string;
};

export type ResolvedReadOnlyAuth = {
  /** Secret source used to derive the signing key (mnemonic or SURI) */
  source: string;
  /** True when source is a key URI (SURI), false when it is a mnemonic */
  isKeyUri: boolean;
  /** Human-readable origin of the resolved auth source */
  resolvedFrom: "cli" | "env" | "keystore" | "default";
  /** Account selector associated with the resolved auth source */
  account: string;
};

export type LoadedAccount = {
  /** Substrate SS58 address */
  address: string;
  /** Public key bytes */
  publicKey: Uint8Array;
  /** Signing function */
  sign: (input: Uint8Array) => Uint8Array;
};

type BaseChainContext = {
  /** WebSocket RPC endpoint URL */
  rpc: string;
  /** Minimum balance in PAS required for operations */
  minBalancePas: string;
  /** Path to keystore directory */
  keystorePath: string;
  /** Resolved authentication source */
  auth: ResolvedAuthSource;
  /** Loaded account with signing capabilities */
  account: LoadedAccount;
  /** Substrate SS58 address */
  substrateAddress: string;
  /** Polkadot signer for transaction signing */
  signer: PolkadotSigner;
};

export type AssetHubContext = BaseChainContext & {
  /** Discriminant indicating Asset Hub context */
  useBulletin: false;
  /** Typed Polkadot API client */
  client: PolkadotApiClient;
  /** Revive client wrapper for EVM contract calls */
  clientWrapper: ReviveClientWrapper;
  /** EVM address (H160) mapped from Substrate address */
  evmAddress: Address;
};

export type BulletinContext = BaseChainContext & {
  /** Discriminant indicating Bulletin context */
  useBulletin: true;
  /** Typed Polkadot API client */
  client: PolkadotApiClient | TypedApi<Bulletin>;
  /** Null - Bulletin has no Revive runtime */
  clientWrapper: null;
  /** Null - Bulletin has no EVM address mapping */
  evmAddress: null;
};

export type SubnodeRecord = {
  /** Parent node hash (keccak256 of parent full name) */
  parentNode: Hex;

  /** Label of the subnode to register (single label, no dots) */
  subLabel: string;

  /** Human-readable name of the parent node */
  parentLabel: string;

  /** Address that will own the new subnode */
  owner: Address;
};

export type BaseNameReservation = {
  /** Base name with trailing digits stripped (e.g. "mysite" from "mysite42"). */
  baseName: string;
  /** Whether the base name is currently reserved via the PopRules oracle. */
  isReserved: boolean;
  /** EVM address of the reservation holder, or zero address if unreserved. */
  reservedBy: string;
  /** ISO 8601 expiration timestamp, or null if the reservation has no expiry. */
  expires: string | null;
};

export type DomainLookupResult = {
  /** Fully qualified domain name including the .dot suffix. */
  domain: string;
  /** EIP-137 namehash of the fully qualified domain name. */
  node: string;
  /** Whether a record exists in the DotNS registry for this node. */
  exists: boolean;
  /** Registry owner of the domain, or zero address if unregistered. */
  owner: Address;
  /** Resolver contract set for this domain in the registry. */
  resolver: Address;
  /** Owner's deployed Store contract, or null if no store exists. */
  store: Address | null;
  /** Address the domain resolves to via the DotnsResolver, or null if unset or using a non-standard resolver. */
  resolvedAddress: Address | null;
  /** On-chain balance of the domain owner's substrate account. */
  ownerBalance: {
    /** SS58-encoded substrate address derived from the owner's EVM address. */
    substrate: string;
    /** Human-readable free balance in native token units. */
    free: string;
  } | null;
  /** PopRules reservation status for the base name, or null if the label has no trailing digits. */
  baseNameReservation: BaseNameReservation | null;
};

export type ChainContext = AssetHubContext | BulletinContext;
