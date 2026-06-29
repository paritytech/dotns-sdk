// Public SDK surface for Bulletin storage: upload directories or single files,
// manage TransactionStorage authorisation, and derive the ENS contenthash for an
// uploaded CID. The wave-scheduling, retry and formatting internals stay private
// to the CLI and are not re-exported here.

export {
  storeDirectory,
  authorizeAccount,
  checkAuthorization,
  refreshAccountAuthorization,
  ensureAccountAuthorized,
  generateContenthash,
} from "../commands/bulletin";

export {
  createBulletinClient,
  storeSingleFileToBulletin,
  storeChunkedFileToBulletin,
} from "../bulletin/store";

export type {
  StoreDirectoryOptions,
  StoreDirectoryResult,
  AuthorizeAccountOptions,
  AuthorizeAccountResult,
  AuthorizationStatus,
  RefreshAccountAuthorizationOptions,
  AuthorizationState,
  StoreSingleFileParameters,
  StoreChunkedFileParameters,
  BulletinStoreResult,
  ChunkedStoreResult,
} from "../types/types";
