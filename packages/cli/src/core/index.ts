// Public SDK surface: the typed, named DotNS operations, driven by a caller-supplied
// PolkadotSigner through a DotnsContext. No raw-contract access, ABIs, calldata
// helpers, or mutable global state are exported — those stay internal to the CLI.

export {
  createDotnsContext,
  MissingSignerError,
  UnmappedOriginError,
  DomainUnavailableError,
} from "./context";
export type { DotnsContext, OperationStatus, CreateDotnsContextOptions } from "./context";

export {
  classifyDomainName,
  ensureDomainNotRegistered,
  generateCommitment,
  submitCommitment,
  waitForMinimumCommitmentAge,
  readDomainOwner,
  readCommitmentStatus,
  getUserProofOfPersonhoodStatus,
  getPriceAndValidateEligibility,
  quoteCrossPayerFriction,
  finalizeRegularRegistration,
  finalizeGovernanceRegistration,
  registerSubnode,
  verifyDomainOwnership,
  getWhitelistStatus,
  getPendingClaimLabels,
  ensureLabelStoreReady,
  registerName,
} from "../commands/register";
export type {
  GenerateCommitmentOptions,
  GeneratedCommitment,
  WaitForCommitmentOptions,
  CommitmentStatus,
  RegistrationResult,
  SubnameResult,
  LabelStoreSyncResult,
  RegisterNameOptions,
} from "../commands/register";

export { resolveTransferRecipient, transferName } from "../cli/transfer";
export type { TransferResult, TransferNameOptions } from "../cli/transfer";

export {
  getEscrowPosition,
  listEscrowPositions,
  getPendingWithdrawal,
  listRefunds,
  releaseName,
  withdrawName,
  claimWithdrawal,
  claimRefund,
  claimRefundsBatch,
  isRefundableDeposit,
  totalEscrowAmount,
  cooldownRemainingSeconds,
  formatCooldown,
  formatPositionStatus,
} from "../commands/escrow";
export type { EscrowPositionView, RefundEntryView, RefundsListResult } from "../commands/escrow";

export { getContentHash, setContentHash } from "../commands/contentHash";
export type { ContentViewResult, ContentSetResult } from "../commands/contentHash";

export { getTextRecord, setTextRecord } from "../commands/textRecord";
export type { TextViewResult, TextSetResult } from "../commands/textRecord";

export {
  claimUserStore,
  getStoreInfo,
  listStoreValues,
  listStoreNames,
  listStoreCids,
  getStoreValue,
  setStoreValue,
  deleteStoreValue,
  claimLabels,
} from "../commands/storeManagement";

export {
  performDomainLookup,
  listMyRegisteredNames,
  performOwnerOfLookup,
} from "../commands/lookup";
export type { RegisteredNamesResult } from "../commands/lookup";

export {
  setNameDelegate,
  revokeNameDelegate,
  getNameDelegate,
  setRecordDelegate,
  getRecordDelegate,
} from "../commands/delegate";
export type { DelegateResult, RecordDelegateResult } from "../commands/delegate";

export { setPrimaryName, getPrimaryName } from "../commands/reverseRecord";
export type { PrimaryNameResult } from "../commands/reverseRecord";

export { checkAccountMapped } from "../commands/accountChecks";

export { DOTNS_ENVIRONMENTS } from "../utils/constants";
export type { DotnsEnvironmentId, DotnsContractAddresses } from "../utils/constants";
export { ReviveClientWrapper } from "../client/polkadotClient";
export type { PolkadotApiClient } from "../client/polkadotClient";
export { ProofOfPersonhoodStatus } from "../types/types";
export type { TransactionStatus, DomainLookupResult } from "../types/types";
