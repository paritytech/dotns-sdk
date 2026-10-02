import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { isHex } from "viem";

// Longest label the contracts accept (StringUtils.MAX_DNS_LABEL_OCTETS).
const MAX_DNS_LABEL_LEN = 63;
// Digits the gateway pallet allocates after a device-name stem (StringUtils.DEVICE_SUFFIX_DIGITS).
const DEVICE_SUFFIX_DIGITS = 2;
// Longest dotted parent path a subname registration may carry (StringUtils.MAX_NAME_PATH_OCTETS).
const MAX_NAME_PATH_OCTETS = 255;

// A name a person chose, mirroring StringUtils.isPersonhoodLabel: lowercase ASCII
// letters only. Stricter than an ordinary label, which also takes digits and
// hyphens, because the gateway pallet's `BaseLabel::is_valid_person` admits
// neither. No lower bound: how short a name may be is PopRules policy.
export function isPersonhoodLabel(value: string): boolean {
  return value.length > 0 && value.length <= MAX_DNS_LABEL_LEN && /^[a-z]+$/.test(value);
}

// A device name, mirroring StringUtils.isDeviceLabel: a letters-only stem, one
// separator, then exactly DEVICE_SUFFIX_DIGITS digits (`joseph.42`). The stem follows
// the personhood rule, so `web3.42` and `andrew-x.42` are shapes the gateway pallet
// cannot have issued.
export function isDeviceLabel(value: string): boolean {
  const separator = value.length - DEVICE_SUFFIX_DIGITS - 1;
  if (separator < 1 || value[separator] !== ".") return false;
  return isPersonhoodLabel(value.slice(0, separator)) && /^\d+$/.test(value.slice(separator + 1));
}

// The part of `label` its tier is measured on, mirroring PopRules:
// the label as written, except a device label, whose separator and allocated
// digits come off first. The gateway pallet allocates those digits to tell apart people
// who chose the same stem; nothing allocates the digits in `web3`, so it
// measures whole.
export function baseLabelOf(label: string): string {
  return isDeviceLabel(label) ? label.slice(0, -(DEVICE_SUFFIX_DIGITS + 1)) : label;
}

// Normalise a name or `name.<tld>` to its bare lowercase label. The TLD is a
// per-deployment value, so callers that know it (from the chain) pass it in;
// `tld` defaults to "dot" for the mainnet deployment. Stripping the correct TLD
// suffix is what distinguishes a second-level name (`alice.paseo`) from a
// subdomain (`sub.alice`).
export function normaliseLabel(name: string, tld = "dot"): string {
  const raw = name.trim().toLowerCase();
  const suffix = `.${tld}`;
  return raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
}

// True for a single label under the active TLD ("alice", "alice.paseo"), false
// for subdomains ("sub.alice"). A device name keeps its separator and names one owner,
// so it is a single name despite the dot; `domainNode` resolves where it is stored.
export function isSecondLevelDotName(name: string, tld = "dot"): boolean {
  const bare = normaliseLabel(name, tld);
  if (isDeviceLabel(bare)) return true;
  return bare.split(".").filter(Boolean).length === 1;
}

// A single canonical DNS label, mirroring StringUtils.isSingleLabel (PopRules'
// label checks and DotnsRegistry.setSubnodeOwner's subLabel check): lowercase ASCII
// letters, digits and hyphen only, no leading or trailing hyphen, length 1-63, no
// dots. Non-canonical labels revert on-chain, so reject them before submitting.
const CANONICAL_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isCanonicalLabel(label: string): boolean {
  return label.length > 0 && label.length <= 63 && CANONICAL_LABEL_REGEX.test(label);
}

export function validateCanonicalLabel(label: string, role = "label"): void {
  if (!isCanonicalLabel(label)) {
    throw new Error(
      `Invalid ${role}: must be a single label of lowercase letters, digits and hyphens (no dots, spaces or uppercase), 1-63 characters, not starting or ending with a hyphen`,
    );
  }
}

export function validateDomainLabel(label: string): void {
  // A device name is a valid on-chain label, so the charset error below would misdescribe
  // it. Only the gateway pallet issues one, so say that instead.
  if (isDeviceLabel(label)) {
    throw new Error(
      `Invalid domain label: "${label}" is a device name; the dotNS gateway pallet issues these and they cannot be registered here`,
    );
  }

  if (!/^[a-z0-9-]{3,}$/.test(label)) {
    throw new Error(
      "Invalid domain label: must contain only lowercase letters, digits, and hyphens, with minimum length of 3 characters",
    );
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    throw new Error("Invalid domain label: cannot start or end with hyphen");
  }

  // An ordinary label is measured as written: digits carry no
  // special meaning and no count is privileged or rejected ("web3", "blink182").
  // A device name is the dotted form issued by the gateway pallet and never enters here.
}

// A label for an operation on a name that already exists. Accepts a device name
// alongside an ordinary label: the gateway pallet issues `joseph.42` to one holder, who
// can still delegate it or make it their primary name.
// Registration paths keep {@link validateDomainLabel}, which refuses a device name
// because only the gateway pallet can issue one.
export function validateExistingNameLabel(label: string): void {
  if (isDeviceLabel(label)) return;
  validateDomainLabel(label);
}

// The parent path of a subname registration, bounded at StringUtils.MAX_NAME_PATH_OCTETS.
// The bound is on the dotted parent string the caller passes, with no TLD. Applied on every
// deployment: a registry without the bound stores the full name in a label-store row that
// cannot be deleted, and one with it rejects the path with a generic ParentLabelMismatch.
// Checked before any chain read.
export function validateParentPath(path: string): void {
  const octets = new TextEncoder().encode(path).length;
  if (octets > MAX_NAME_PATH_OCTETS) {
    throw new Error(
      `Invalid parent name: ${octets} bytes long; dotNS limits a parent name to ${MAX_NAME_PATH_OCTETS} bytes`,
    );
  }
}

/**
 * Validates a label for the governance registration path.
 *
 * Intentionally does **not** delegate to {@link validateDomainLabel}: this path
 * does not go through PopRules, and a governance label is never a device name.
 * Checks the canonical label shape, a minimum length of 3, and bounds the base to
 * the reserved class this path exists for.
 *
 * `executeGovernanceRegistration` documents why each bound is or is not applied.
 */
export function validateGovernanceLabel(label: string): void {
  validateCanonicalLabel(label, "governance label");

  if (label.length < 3) {
    throw new Error("Invalid governance label: minimum length of 3 characters");
  }

  const baseName = baseLabelOf(label);
  if (baseName.length > 5) {
    throw new Error(
      `Invalid governance label: base name must be 5 characters or fewer (got ${baseName.length})`,
    );
  }
}

export const isValidSubstrateAddress = (address: string, ss58Format = 42): boolean => {
  try {
    if (isHex(address)) return false;

    const decoded = decodeAddress(address);

    const checksummed = encodeAddress(decoded, ss58Format);

    return address === checksummed;
  } catch {
    return false;
  }
};
