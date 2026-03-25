import type { Address, Hex } from "viem";
import type { StoredAuth } from "../cli/keystore/types";
import type { Ora } from "ora";
import type { PolkadotClient, PolkadotSigner, TypedApi } from "polkadot-api";
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
  /** Extra seconds to wait after minCommitmentAge before attempting registration */
  commitmentBuffer?: number;
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

export type BulletinReporterMode = "auto" | "interactive" | "stream" | "quiet";

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
  /** Chunk size for large uploads in bytes (default: 2 MB, clamped to 256 KB–2 MB) */
  chunkSize?: string;
  /** Number of retry attempts after the initial upload attempt */
  maxRetries?: string;
  /** Force chunked upload mode (DAG-PB) */
  forceChunked?: boolean;
  /** Adaptive scheduler maximum window (default: 4, max: 4) */
  concurrency?: string;
  /** Print IPFS contenthash in addition to CID */
  printContenthash?: boolean;
  /** Resume a previously interrupted upload */
  resume?: boolean;
  /** Enable upload profiling and write a JSON report */
  profileUpload?: boolean;
  /** Explicit path for upload profiling JSON output */
  profileOutput?: string;
  /** Number of transactions to authorize */
  transactions?: string;
  /** Number of bytes to authorize */
  bytes?: string;
  /**  Output as json */
  json: boolean;
  /** Whether to store the current upload to the local history db */
  history: boolean;
  /** Human-readable progress reporter mode */
  reporter?: BulletinReporterMode;
  /** Write the CID to the user's on-chain Store after upload */
  cache?: boolean;
  /** Merkleize directory in-memory and upload as a single CAR file */
  asCar?: boolean;
};

export type BulletinProgressPhase =
  | "validate"
  | "authorize"
  | "upload"
  | "verify"
  | "merkleize"
  | "export"
  | "cache";

export type BulletinProgressState = "start" | "update" | "success" | "warning" | "failure";

export type BulletinProgressEvent = {
  /** High-level operation currently in progress */
  phase: BulletinProgressPhase;
  /** Lifecycle state for the phase */
  state: BulletinProgressState;
  /** Human-readable message */
  message: string;
};

export type BulletinRetryEvent = {
  /** Retry domain label */
  label: string;
  /** Zero-based retry index */
  retry: number;
  /** Total attempts including the initial attempt */
  totalAttempts: number;
  /** Delay before the next attempt in milliseconds */
  delayMs: number;
  /** Retryable failure summary */
  errorMessage: string;
};

export type BulletinPhaseHandler = (event: BulletinProgressEvent) => void;

export type BulletinRetryHandler = (event: BulletinRetryEvent) => void;

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
  /** Signer with Authorizer privileges */
  signer: PolkadotSigner;
  /** SS58 address of the account to authorize */
  targetAddress: string;
  /** Maximum number of store transactions allowed */
  transactions?: number;
  /** Maximum bytes allowed to store */
  bytes?: bigint;
  /** Bypass the existing authorization check and re-submit the extrinsic */
  force?: boolean;
  /** Optional human-readable progress callback */
  onPhase?: BulletinPhaseHandler;
};

export type AuthorizationStatus = {
  /** Whether an authorization entry exists in chain storage */
  authorized: boolean;
  /** Remaining transaction allowance */
  transactions?: number;
  /** Remaining byte allowance */
  bytes?: bigint;
  /** Block number at which the authorization expires */
  expiration?: number;
  /** Current chain block number at time of query */
  currentBlock?: number;
  /** Whether the current block has passed the expiration block */
  expired?: boolean;
};

export type AuthorizeAccountResult = {
  /** Transaction hash of the authorization extrinsic */
  txHash: string;
  /** Hash of the block containing the finalized transaction */
  blockHash: string;
};

export type ValidatePathResult = {
  /** File contents as bytes (empty for directories and deferred reads) */
  bytes: Uint8Array;
  /** Whether the path points to a directory */
  isDirectory: boolean;
  /** Absolute path after resolution */
  resolvedPath: string;
  /** File size in bytes (set when reading is deferred) */
  fileSize?: number;
  /** File mtime in milliseconds (set for files) */
  fileMtimeMs?: number;
  /** True when file reading was deferred due to large size */
  deferredRead?: boolean;
};

export type StoreDirectoryResult = {
  /** CID of the content stored on Bulletin */
  storageCid: string;
  /** Original IPFS CID of the merkleized directory structure */
  ipfsCid: string;
};

export type UploadRetryOptions = {
  /** Number of retry attempts after the initial upload attempt */
  maxRetries?: number;
  /** Callback emitted when a retryable upload error occurs */
  onRetry?: BulletinRetryHandler;
};

export type UploadSingleBlockOptions = UploadRetryOptions & {
  /** Optional human-readable progress callback */
  onPhase?: BulletinPhaseHandler;
};

export type UploadChunkedBlocksOptions = UploadRetryOptions & {
  /** Completed chunk metadata keyed by zero-based chunk index (resume support) */
  completedBlocks?: Map<number, UploadManifestCompletedBlock>;
  /** Maximum concurrent upload operations */
  concurrency?: number;
  /** Optional human-readable progress callback */
  onPhase?: BulletinPhaseHandler;
  /** Callback with adaptive scheduler state snapshots */
  onSchedulerState?: (state: UploadSchedulerState) => void;
  /** Callback emitted after each upload wave */
  onWave?: (wave: UploadWaveSummary) => void;
};

export type StoreDirectoryOptions = UploadRetryOptions & {
  accountAddress?: string;
  concurrency?: number;
  chunkSizeBytes?: number;
  onPhase?: BulletinPhaseHandler;
  verificationGateway?: string;
  waitForFinalization?: boolean;
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
  /** Optional shared client — caller owns lifecycle when provided */
  client?: PolkadotClient;
  /** Optional timeout budget for a single store call */
  storeTimeoutMs?: number;
  /** If false, resolve on best-block inclusion instead of finalization. Default: true */
  waitForFinalization?: boolean;
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
  /** Optional shared client — caller owns lifecycle when provided */
  client?: PolkadotClient;
  /** If false, resolve on best-block inclusion instead of finalization. Default: false */
  waitForFinalization?: boolean;
};

export type StoreChunkedFileParameters = {
  /** Bulletin RPC endpoint URL */
  rpc: string;
  /** Signer for authorizing the storage transaction */
  signer: PolkadotSigner;
  /** Path to the file to stream from disk */
  filePath: string;
  /** Chunk size in bytes */
  chunkSize: number;
  /** Total file size for progress reporting */
  fileSize: number;
  /** SS58 address for nonce management in parallel wave uploads */
  accountAddress: string;
  /** Number of chunks to upload in parallel per wave */
  concurrency?: number;
  /** Callback for progress updates with chunk position */
  onProgress?: (currentChunk: number, totalChunks: number, status: string) => void;
  /** Callback with adaptive scheduler state snapshots */
  onSchedulerState?: (state: UploadSchedulerState) => void;
  /** Callback emitted after each upload wave */
  onWave?: (wave: UploadWaveSummary) => void;
  /** Optional shared client — caller owns lifecycle when provided */
  client?: PolkadotClient;
  /** Completed chunk metadata keyed by zero-based chunk index (resume support) */
  completedBlocks?: Map<number, UploadManifestCompletedBlock>;
  /** If false, resolve on best-block inclusion instead of finalization. Default: true */
  waitForFinalization?: boolean;
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
  /** Optional shared client — caller owns lifecycle when provided */
  client?: PolkadotClient;
  /** Optional timeout budget for a single store call */
  storeTimeoutMs?: number;
  /** If false, resolve on best-block inclusion instead of finalization. Default: true */
  waitForFinalization?: boolean;
};

export type TransactionWatchFailureEvent = {
  /** Event type emitted by transactionWatch */
  type: string;
  /** Optional dispatch error reported by the node */
  dispatchError?: { type: string; value?: unknown };
  /** Optional free-form error payload reported by the client */
  error?: unknown;
  /** Optional reason string reported by the node */
  reason?: string;
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

export type TraversedDirectoryFile = {
  /** Slash-delimited relative path within the uploaded directory */
  path: string;
  /** Absolute filesystem path to the file on disk */
  fullPath: string;
};

export type StreamedFileChunk = {
  /** Zero-based chunk index */
  index: number;
  /** Raw bytes for this chunk */
  bytes: Uint8Array;
  /** Byte length of the chunk */
  length: number;
};

export type StoredChunkReference = {
  /** Zero-based chunk index */
  index: number;
  /** Content identifier for this chunk */
  cid: string;
  /** Byte length of the chunk */
  length: number;
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

export type StoreInfo = {
  /** EVM address of the Store owner */
  owner: Address;
  /** Deployed Store contract address, null if no Store exists */
  storeAddress: Address | null;
  /** Whether a Store has been deployed for this owner */
  exists: boolean;
};

export type StoreAuthStatus = {
  /** Target address being checked */
  address: Address;
  /** Whether the address can call setValueFor on this Store */
  isAuthorized: boolean;
  /** Whether the address is a DotNS controller (locks keys on write) */
  isDotnsController: boolean;
};

export type StoreValueResult = {
  /** Bytes32 storage key (hex-encoded) */
  key: `0x${string}`;
  /** Stored string value, empty string if not set */
  value: string;
  /** Whether a non-empty value exists at this key */
  exists: boolean;
};

export type IsMappedResult = {
  /** SS58 substrate address that was checked */
  address: string;
  /** Corresponding EVM address (H160) */
  evmAddress: string;
  /** Whether the address mapping exists on-chain */
  isMapped: boolean;
};

export type IsWhitelistedResult = {
  /** SS58 substrate address that was checked */
  address: string;
  /** Corresponding EVM address (H160) */
  evmAddress: string;
  /** Whether the address is on the whitelist */
  isWhitelisted: boolean;
};

export type WhitelistResult = {
  /** SS58 substrate address that was whitelisted */
  address: string;
  /** Corresponding EVM address (H160) */
  evmAddress: string;
  /** Whether the whitelist operation succeeded */
  whitelisted: boolean;
  /** Transaction hash of the whitelist extrinsic */
  txHash: string;
};

export type UploadManifest = {
  /** Schema version for forward compatibility */
  version: 1;
  /** Stable manifest identifier derived from upload fingerprint */
  id: string;
  /** Fingerprint derived from path + size + mtime + chunk size */
  fingerprint: string;
  /** Absolute path of the file being uploaded */
  inputPath: string;
  /** Total file size in bytes */
  fileSize: number;
  /** File modification time in milliseconds since epoch */
  fileMtimeMs: number;
  /** Chunk size in bytes used for splitting */
  chunkSize: number;
  /** Total number of chunks the file was split into */
  totalBlocks: number;
  /** Metadata for chunks that have been successfully uploaded */
  completedBlocks: UploadManifestCompletedBlock[];
  /** Root CID of the DAG-PB tree, set after all chunks are stored */
  rootCid?: string;
  /** ISO timestamp when the manifest was first created */
  createdAtIso: string;
  /** ISO timestamp of the most recent manifest update */
  updatedAtIso: string;
  /** Whether the upload is a single file or directory */
  type: "file" | "directory";
};

export type UploadManifestCompletedBlock = {
  /** Zero-based chunk index */
  index: number;
  /** Content identifier for this chunk */
  cid: string;
  /** Byte length of the chunk */
  length: number;
};

export type UploadManifestIdentity = {
  /** Absolute path of the file being uploaded */
  inputPath: string;
  /** Total file size in bytes */
  fileSize: number;
  /** File modification time in milliseconds since epoch */
  fileMtimeMs: number;
  /** Chunk size in bytes used for splitting */
  chunkSize: number;
};

export type UploadManifestLoadResult = {
  /** Matching manifest for the current upload identity, or null if none found */
  manifest: UploadManifest | null;
  /** Most recent manifest for the same path, but with fingerprint mismatch */
  staleManifest: UploadManifest | null;
};

export type UploadSchedulerState = {
  /** Unix timestamp in milliseconds when this snapshot was captured */
  timestampMs: number;
  /** Current adaptive concurrency window size */
  window: number;
  /** Total bytes currently being uploaded across all in-flight chunks */
  inFlightBytes: number;
  /** Number of chunks currently being uploaded in parallel */
  inFlightChunks: number;
  /** Total number of chunks successfully uploaded so far */
  completedChunks: number;
  /** Cumulative retry count across all waves */
  retries: number;
};

export type UploadWaveSummary = {
  /** Sequential wave number (1-based) */
  wave: number;
  /** Unix timestamp in milliseconds when the wave started */
  startedAtMs: number;
  /** Unix timestamp in milliseconds when the wave ended */
  endedAtMs: number;
  /** Wall-clock duration of the wave in milliseconds */
  durationMs: number;
  /** Concurrency window size used for this wave */
  window: number;
  /** Number of chunk uploads attempted in this wave */
  attempted: number;
  /** Number of chunks successfully stored */
  succeeded: number;
  /** Number of chunks that failed to store */
  failed: number;
  /** Number of retries triggered during this wave */
  retries: number;
  /** True if the wave completed with zero retries under the duration threshold */
  wasClean: boolean;
};

export type UploadProfileSample = {
  /** Unix timestamp in milliseconds when this sample was captured */
  timestampMs: number;
  /** V8 heap used in bytes at sample time */
  heapUsed: number;
  /** Resident set size in bytes at sample time */
  rss: number;
  /** ArrayBuffer allocation in bytes at sample time */
  arrayBuffers: number;
  /** External memory (C++ objects bound to JS) in bytes */
  external: number;
  /** Total bytes currently being uploaded across in-flight chunks */
  inFlightBytes: number;
  /** Number of chunks currently being uploaded */
  inFlightChunks: number;
  /** Current adaptive concurrency window size */
  window: number;
  /** Total chunks completed at sample time */
  completed: number;
  /** Cumulative retry count at sample time */
  retries: number;
};

export type UploadProfileMeta = {
  /** Absolute path of the file that was uploaded */
  sourcePath: string;
  /** Total file size in bytes */
  sourceSizeBytes: number;
  /** Chunk size in bytes used for splitting */
  chunkSizeBytes: number;
  /** Bulletin RPC endpoint used for the upload */
  rpc: string;
  /** ISO timestamp when the upload started */
  startedAtIso: string;
  /** ISO timestamp when the upload finished */
  finishedAtIso: string;
  /** V8 heap size limit in bytes */
  heapLimitBytes: number;
  /** Concurrency window at the start of the upload */
  initialConcurrency: number;
  /** Maximum concurrency window allowed */
  maxConcurrency: number;
};

export type UploadProfileSummary = {
  /** Total upload wall-clock time in milliseconds */
  totalUploadTimeMs: number;
  /** Total upload wall-clock time in seconds */
  totalUploadTimeSeconds: number;
  /** Alias for totalUploadTimeMs (backward compat) */
  elapsedMs: number;
  /** Effective throughput in bytes per second */
  throughputBytesPerSecond: number;
  /** Peak V8 heap usage observed across all samples */
  peakHeapUsed: number;
  /** Peak resident set size observed across all samples */
  peakRss: number;
  /** Peak ArrayBuffer allocation observed across all samples */
  peakArrayBuffers: number;
  /** Peak external memory observed across all samples */
  peakExternal: number;
  /** Total number of retries across all waves */
  retryCount: number;
  /** Highest adaptive window size reached during the upload */
  maxWindowReached: number;
  /** Final root CID of the uploaded content */
  finalCid: string;
};

export type UploadProfileReport = {
  /** Upload metadata (source file, RPC, concurrency settings) */
  meta: UploadProfileMeta;
  /** Periodic memory and scheduler state snapshots */
  samples: UploadProfileSample[];
  /** Per-wave upload summaries */
  waves: UploadWaveSummary[];
  /** Aggregated upload statistics with peak values */
  summary: UploadProfileSummary;
};

export type StoreEnsureAuthResult = {
  /** EVM address of the DotNS registrar controller contract */
  controllerAddress: Address;
  /** Whether the controller is authorized as a Store writer */
  controllerAuthorized: boolean;
  /** Transaction hash of the controller authorization, if newly authorized */
  controllerTx?: string;
  /** EVM address of the DotNS registry contract */
  registryAddress: Address;
  /** Whether the registry is authorized as a Store writer */
  registryAuthorized: boolean;
  /** Transaction hash of the registry authorization, if newly authorized */
  registryTx?: string;
};

/** EVM address resolved from a Substrate or EVM input */
export type ResolvedAddress = {
  /** Checksummed EVM address */
  evmAddress: Address;
  /** Original address as provided by the caller */
  originalAddress: string;
};

/** Result of merkleizing a directory with IPFS UnixFS */
export type MerkleizeDirectoryResult = {
  /** Root CID of the DAG-PB tree */
  rootCid: import("multiformats/cid").CID;
  /** Number of blocks in the tree */
  totalBlocks: number;
  /** Total size of all blocks in bytes */
  totalBytes: number;
};

/** Authorization state for a Bulletin chain account */
export type AuthorizationState = {
  /** Block number at which authorization expires */
  expiration?: number;
  /** Current block number on the Bulletin chain */
  currentBlock?: number;
};

/** Result of verifying a CID against an IPFS gateway */
export type CidVerificationResult = {
  /** Whether the gateway returned a successful response */
  resolvable: boolean;
  /** Base URL of the gateway that was queried */
  gateway: string;
  /** HTTP status code from the gateway, if available */
  statusCode?: number;
};

/** A single call descriptor for Multicall3.aggregate3 */
export type Multicall3Call = {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
};

/** A single result from Multicall3.aggregate3 */
export type Multicall3Result = {
  success: boolean;
  returnData: Hex;
};

/** Result of deleting a key from a user's Store contract */
export type StoreDeleteResult = {
  /** The bytes32 key that was deleted */
  key: `0x${string}`;
  /** Whether the deletion was successful */
  deleted: boolean;
};

/** Result of finalizing an upload profile report */
export type UploadProfileResult = {
  /** The generated upload profile report */
  report: UploadProfileReport;
  /** File path where the report was saved */
  outputPath: string;
};

/** A block (CID + raw bytes) queued for wave-based upload */
export type WaveBlock = {
  /** CID of the block */
  cid: import("multiformats/cid").CID;
  /** Raw encoded bytes of the block */
  bytes: Uint8Array;
};

export type CacheCidToStoreOptions = {
  cid: string;
  clientWrapper: ReviveClientWrapper;
  signer: PolkadotSigner;
  substrateAddress: string;
  evmAddress: Address;
};

export type BlockMetadata = {
  cidString: string;
  codecValue: number;
  hashCodeValue: number;
  size: number;
};

export type UploadDeps = {
  rpc: string;
  signer: PolkadotSigner;
  accountAddress: string;
  concurrency: number;
  waitForFinalization: boolean;
  onBlockStored?: (meta: BlockMetadata, completedCount: number, totalSoFar: number) => void;
};

export type FlushWaveOptions = {
  isFinalWave?: boolean;
};

export type UploadProfiler = {
  onSchedulerState: (state: UploadSchedulerState) => void;
  onWave: (wave: UploadWaveSummary) => void;
  finalize: (finalCid: string, overrideOutputPath?: string) => Promise<UploadProfileResult>;
};

export type UploadProfilerOptions = {
  sourcePath: string;
  sourceSizeBytes: number;
  chunkSizeBytes: number;
  rpc: string;
  initialConcurrency: number;
  maxConcurrency: number;
  outputPath?: string;
  jsonOutput: boolean;
};
