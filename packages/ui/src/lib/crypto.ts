import { concat, keccak256, toBytes } from "viem";
import type { SS58String } from "polkadot-api";
import { AccountId, type TypedApi } from "polkadot-api";
import type { Paseo_asset_hub as Paseo } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import { ss58Decode, ss58Encode } from "@parity/product-sdk-address";

/**
 * Cryptographic Utilities
 *
 * Functions for hashing, node computation, and address conversion
 */

export const DOT_NODE: `0x${string}` =
  "0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce";

/**
 * Compute the keccak256 hash of a label
 *
 * @param label - Label to hash
 * @returns Hash as hex string
 */
export function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label)) as `0x${string}`;
}

/**
 * Compute the node for a .dot label
 *
 * @param labelOrName - Label or full name (e.g., "alice" or "alice.dot")
 * @returns Computed node hash
 * @throws Error if name contains multiple levels
 */
export function computeDotLabelNode(labelOrName: string): `0x${string}` {
  const label = normalizeDotLabel(labelOrName);
  return keccak256(concat([DOT_NODE, labelhash(label)])) as `0x${string}`;
}

/**
 * Compute a subnode from a parent node and sublabel
 *
 * @param parentNode - Parent node hash
 * @param subLabelOrName - Sublabel or name
 * @returns Computed subnode hash
 * @throws Error if sublabel contains dots
 */
export function computeSubnode(parentNode: `0x${string}`, subLabelOrName: string): `0x${string}` {
  const subLabel = normalizeSingleLabel(subLabelOrName);
  return keccak256(concat([parentNode, labelhash(subLabel)])) as `0x${string}`;
}

/**
 * Compute the token ID for a domain
 *
 * @param labelOrName - Domain label (e.g. "alice" or "alice.dot")
 * @returns Token ID as bigint
 */
export function computeDomainTokenId(labelOrName: string): bigint {
  const node = computeDotLabelNode(labelOrName);
  return BigInt(node);
}

/**
 * Normalize a .dot label by removing the .dot suffix
 *
 * @param labelOrName - Label or name to normalize
 * @returns Normalized single label
 * @throws Error if the name has multiple levels
 */
function normalizeDotLabel(labelOrName: string): string {
  const raw = labelOrName.trim();
  const withoutDot = raw.toLowerCase().endsWith(".dot") ? raw.slice(0, -4) : raw;
  if (withoutDot.includes(".")) throw new Error(`Expected single .dot label: "${labelOrName}"`);
  return withoutDot;
}

/**
 * Normalize a single label (must not contain dots)
 *
 * @param label - Label to normalize
 * @returns Trimmed label
 * @throws Error if label contains dots
 */
function normalizeSingleLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.includes(".")) throw new Error(`Expected single label: "${label}"`);
  return trimmed;
}

/**
 * Convert SS58 address to Ethereum format
 *
 * @param address - SS58 formatted address
 * @returns Ethereum address as `0x`-prefixed 20-byte hex string (matches v2 `SizedHex<20>`)
 */
export const ss58ToEthereum = (address: SS58String): `0x${string}` =>
  `0x${keccak256(AccountId().enc(address)).slice(-40)}` as `0x${string}`;

/**
 * Check if an address is mapped in the Revive pallet
 *
 * @param api - Polkadot API instance
 * @param address - SS58 address to check
 * @returns True if address is mapped
 */
export const isMappedTypedApi = async (
  api: TypedApi<Paseo>,
  address: SS58String,
): Promise<boolean> => {
  const key = ss58ToEthereum(address);
  const result = await api.query.Revive.OriginalAccount.getValue(key);
  return result != null;
};

/**
 * Validate a substrate SS58 address
 *
 * @param address - Address to validate
 * @param ss58Format - SS58 format number (default: 42)
 * @returns True if address is valid
 */
export const isValidSubstrateAddress = (address: string, ss58Format = 42): boolean => {
  try {
    if (address.startsWith("0x")) return false;
    const { publicKey } = ss58Decode(address);
    return address === ss58Encode(publicKey, ss58Format);
  } catch {
    return false;
  }
};
