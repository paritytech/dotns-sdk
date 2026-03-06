/**
 * Main utilities export file
 *
 * Re-exports utilities from focused modules for backward compatibility
 * Import directly from specific modules for better tree-shaking:
 * - @/lib/networks
 * - @/lib/formatting
 * - @/lib/domain
 * - @/lib/crypto
 * - @/lib/currency
 */

// Network configuration
export {
  SUPPORTED_NETWORKS,
  ZERO_SUBSTRATE_ADDRESS,
  DEFAULT_NETWORK_ID,
  TOKEN_UNIT,
  BLOCK_EXPLORER,
  GAS_LIMIT,
  MAX_WEIGHT,
  getFirstDeployedNetwork,
} from "./lib/networks";

// Formatting utilities
export {
  toFixed,
  formatPas,
  formatTimestamp,
  addPercentage,
  getSecondsForUnit,
  generateDummyDomains,
} from "./lib/formatting";

// Domain utilities
export {
  SPECIAL_CHAR_REGEX,
  validateENSName,
  normalizeDomainName,
  filterDotNames,
  canRegisterWithStatus,
  extractBytes,
  unwrap,
} from "./lib/domain";

// Cryptographic utilities
export {
  DOT_NODE,
  labelhash,
  computeDotLabelNode,
  computeSubnode,
  computeDomainTokenId,
  ss58ToEthereum,
  isMappedTypedApi,
  isValidSubstrateAddress,
} from "./lib/crypto";

// Currency conversion
export {
  DECIMALS,
  NATIVE_TO_ETH_RATIO,
  convertWeiToNative,
  convertNativeToWei,
  formatNativeBalance,
  formatWeiAsEther,
} from "./lib/currency";
