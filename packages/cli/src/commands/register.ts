import {
  bytesToHex,
  checksumAddress,
  getAddress,
  isHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  type DotnsContext,
  read,
  write,
  ownEvmAddress,
  DomainUnavailableError,
} from "../core/context";
import {
  ProofOfPersonhoodStatus,
  type DomainRegistration,
  type NameClassification,
  type NameClassificationLike,
  type PricingAndEligibility,
  type ReservationInfoLike,
  type SubnodeRecord,
} from "../types/types";
import {
  DOTNS_REGISTRAR_CONTROLLER_ABI,
  DOTNS_REGISTRAR_ABI,
  DOTNS_REGISTRY_ABI,
  POP_RULES_ABI,
  PERSONHOOD_ABI,
  PERSONHOOD_CONTEXT,
  PERSONHOOD_PRECOMPILE_ADDRESS,
  STORE_FACTORY_ABI,
  DOTNS_POP_CONTROLLER_ABI,
  DEFAULT_COMMITMENT_BUFFER_SECONDS,
  COMMITMENT_POLL_TIMEOUT_MS,
  COMMITMENT_POLL_INTERVAL_MS,
} from "../utils/constants";
import { validateDomainLabel, validateGovernanceLabel, baseLabelOf } from "../utils/validation";
import { ContractRevertError } from "../utils/contractInteractions";
import {
  computeDomainTokenId,
  domainNode,
  formatDomainName,
  normaliseName,
  readCurrentPricingVersion,
} from "../core/naming";
import { convertWeiToNative } from "../utils/formatting";
import { isSameEvmAddress } from "../utils/address";

// msg.value carries 10% over the charged amount so a price movement between quote
// and execution cannot revert; the controller refunds the unused part.
const PAYMENT_BUFFER_PERCENT = 100n;

function chargedAmountWei(priceWei: bigint, frictionWei: bigint): bigint {
  return priceWei > frictionWei ? priceWei : frictionWei;
}

function bufferedPaymentWei(chargedWei: bigint): bigint {
  return (chargedWei * PAYMENT_BUFFER_PERCENT) / 100n;
}

function toNumber(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function convertToProofOfPersonhoodStatus(value: unknown): ProofOfPersonhoodStatus {
  if (typeof value === "number") return value as ProofOfPersonhoodStatus;
  if (typeof value === "bigint") return Number(value) as ProofOfPersonhoodStatus;
  if (typeof value === "string") return Number(value) as ProofOfPersonhoodStatus;
  throw new Error(`Unexpected ProofOfPersonhoodStatus type: ${typeof value}`);
}

type PersonhoodInfo = {
  status: ProofOfPersonhoodStatus | number | bigint | string;
  contextAlias: `0x${string}`;
};

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function getPersonhoodStatusValue(info: PersonhoodInfo | readonly unknown[]): unknown {
  if (isReadonlyArray(info)) return info[0];
  return info.status;
}

// Aborts the wrapped sleep promptly when ctx.signal fires so a cancelled command
// does not hang for the full commitment-age wait.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function classifyDomainName(
  ctx: DotnsContext,
  name: string,
): Promise<NameClassification> {
  const label = await normaliseName(ctx, name);
  const result = await read<NameClassificationLike>(
    ctx,
    ctx.contracts.DOTNS_RULES,
    POP_RULES_ABI,
    "classifyName",
    [label],
  );
  return {
    requiredStatus: convertToProofOfPersonhoodStatus(result[0]),
    message: result[1],
  };
}

/**
 * {@link classifyDomainName}, but returns `null` when PopRules *refuses to
 * classify* the label at all rather than throwing.
 *
 * `classifyName` is `pure`, yet it reverts with `PopError` for label shapes
 * PopRules rejects outright (a non-canonical label). For callers
 * that treat the classification as advisory — notably the governance path, which
 * submits through `registerReserved` and bypasses PopRules entirely — that revert
 * is an answer, not a failure.
 *
 * Only a revert is converted to `null`. An unreachable chain, an unmapped origin
 * or an ABI mismatch all propagate: reinterpreting those as "unclassifiable"
 * would let a transient RPC failure silently unlock the governance path, which is
 * precisely the wrong behaviour under uncertainty.
 *
 * The revert reason is handed to `onUnclassifiable` rather than printed, so the
 * reason is never lost while this layer stays free of presentation concerns.
 */
export async function tryClassifyDomainName(
  ctx: DotnsContext,
  name: string,
  opts: { onUnclassifiable?: (reason: string) => void } = {},
): Promise<NameClassification | null> {
  try {
    return await classifyDomainName(ctx, name);
  } catch (error) {
    if (!(error instanceof ContractRevertError)) throw error;
    opts.onUnclassifiable?.(error.message);
    return null;
  }
}

export async function ensureDomainNotRegistered(ctx: DotnsContext, name: string): Promise<void> {
  const label = await normaliseName(ctx, name);
  // Ask the controller directly: `available(label)` is the exact predicate the
  // on-chain `register()` enforces. Reading `ownerOf` instead would wrongly pass a
  // name that is unavailable yet not currently minted (for example one in its
  // post-expiry grace period), because `ownerOf` reverts and that revert is
  // swallowed as "no owner", so the pre-check would disagree with the reveal.
  const available = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "available",
    [label],
  );
  if (!available) throw new DomainUnavailableError(await formatDomainName(ctx, label));
}

export type GenerateCommitmentOptions = {
  owner?: Address;
  secret?: Hex;
  includeReverse?: boolean;
  /**
   * Set for commitments that will be revealed through registerReserved. That path
   * bypasses PopRules, so the label is validated against the controller's own rules
   * (validateGovernanceLabel) instead of the PopRules-derived validateDomainLabel.
   */
  governance?: boolean;
};

export type GeneratedCommitment = {
  commitment: Hex;
  registration: DomainRegistration;
  secret: Hex;
};

// Headroom added over the quoted price when sealing maxPrice into a commitment.
// register() reverts once the charged amount exceeds maxPrice; the pricingVersion
// stamp already pins the price deterministically, so this margin only absorbs a
// rounding difference between the quote and the reveal charge. The margin has no
// cost because the reveal refunds any excess msg.value on-chain.
const MAX_PRICE_SLIPPAGE_PERCENT = 10n;

function bufferedMaxPriceWei(priceWei: bigint): bigint {
  return priceWei + (priceWei * MAX_PRICE_SLIPPAGE_PERCENT) / 100n;
}

// PopRules' price quote for a label and owner at the current cost-model version,
// before any eligibility enforcement. The commit-time maxPrice seal and the
// reveal-time eligibility check both start from this read, so the knowledge of
// which PopRules call and field carry the price stays in one place.
async function readNamePricing(
  ctx: DotnsContext,
  label: string,
  owner: Address,
): Promise<PricingAndEligibility> {
  return read<PricingAndEligibility>(
    ctx,
    ctx.contracts.DOTNS_RULES,
    POP_RULES_ABI,
    "priceWithoutCheck",
    [label, owner],
  );
}

// The quoted price for maxPrice, read without enforcing eligibility. The reveal
// (register) re-prices and enforces eligibility itself; sealing maxPrice must not
// throw here for an ineligible owner, or a name that only the reveal can reject
// would fail at commit time instead with a misleading error. register() compares
// its charge against the name price alone, so this cap tracks the name price.
async function quoteMaxPriceWei(ctx: DotnsContext, label: string, owner: Address): Promise<bigint> {
  const priced = await readNamePricing(ctx, label, owner);
  return bufferedMaxPriceWei(priced.price);
}

function resolveSecret(secret?: Hex): Hex {
  if (secret !== undefined) {
    if (!isHex(secret) || secret.length !== 66) {
      throw new Error("secret must be a 32-byte 0x-prefixed hex string");
    }
    return secret;
  }
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

// The owner defaults to the caller's own (round-trip-checked) EVM address. An
// explicitly-supplied owner is the cross-payer case and is used verbatim. The
// secret is returned to the caller and never logged.
export async function generateCommitment(
  ctx: DotnsContext,
  name: string,
  opts: GenerateCommitmentOptions = {},
): Promise<GeneratedCommitment> {
  const label = await normaliseName(ctx, name);
  if (opts.governance) {
    validateGovernanceLabel(label);
  } else {
    validateDomainLabel(label);
  }

  const owner = opts.owner ?? (await ownEvmAddress(ctx));
  const secret = resolveSecret(opts.secret);

  // maxPrice and pricingVersion are part of the commitment preimage, so they must
  // be sealed here and reused verbatim at reveal. pricingVersion binds the live
  // cost-model version (commit() stamps it and register() rejects a mismatch). The
  // governance path (registerReserved) charges nothing and never reads maxPrice, so
  // a zero cap keeps the preimage stable without constraining it.
  const pricingVersion = await readCurrentPricingVersion(ctx);
  const maxPrice = opts.governance ? 0n : await quoteMaxPriceWei(ctx, label, owner);

  const registration: DomainRegistration = {
    label,
    owner,
    secret,
    reserved: opts.includeReverse ?? false,
    maxPrice,
    pricingVersion,
  };

  const commitment = await read<Hex>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "makeCommitment",
    [registration],
  );

  return { commitment, registration, secret };
}

export async function submitCommitment(ctx: DotnsContext, commitment: Hex): Promise<Hex> {
  return write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    0n,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "commit",
    [commitment],
    "Commitment",
  );
}

async function readCommitmentTimestamp(ctx: DotnsContext, commitment: Hex): Promise<number> {
  return toNumber(
    await read<bigint | number>(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "commitments",
      [commitment],
    ),
  );
}

async function readChainNowSeconds(ctx: DotnsContext): Promise<number> {
  // Prefer chain block.timestamp via Timestamp::Now (milliseconds); fall back to
  // wall-clock only if the pallet storage isn't available on this runtime.
  const timestampQuery = (ctx.clientWrapper.client as any).query?.Timestamp?.Now;
  if (timestampQuery?.getValue) {
    const timestampMs = (await timestampQuery.getValue()) as bigint | number;
    return Math.floor(Number(timestampMs) / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

export type WaitForCommitmentOptions = {
  commitmentBuffer?: number;
};

export async function waitForMinimumCommitmentAge(
  ctx: DotnsContext,
  commitment: Hex,
  opts: WaitForCommitmentOptions = {},
): Promise<void> {
  const buffer = opts.commitmentBuffer ?? DEFAULT_COMMITMENT_BUFFER_SECONDS;

  const [minimumAge, initialCommitTimestamp] = await Promise.all([
    read<bigint | number>(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "minCommitmentAge",
      [],
    ),
    readCommitmentTimestamp(ctx, commitment),
  ]);

  const minimumAgeSeconds = toNumber(minimumAge);

  if (initialCommitTimestamp === 0) {
    throw new Error("Commitment not found on-chain. It may not have been included in a block yet.");
  }

  const waitSeconds = minimumAgeSeconds + buffer;
  ctx.onStatus("waiting");
  await sleep(waitSeconds * 1000, ctx.signal);

  // Compare block-time to block-time, not wall-clock to block-time. The contract's
  // CommitmentTooNew check is `block.timestamp - commitTimestamp >= minCommitmentAge`,
  // so block-time can lag wall-clock by several seconds on a parachain; polling the
  // chain's current block timestamp avoids revealing while still too new.
  const pollDeadline = Date.now() + COMMITMENT_POLL_TIMEOUT_MS;
  while (Date.now() < pollDeadline) {
    if (ctx.signal?.aborted) throw ctx.signal.reason ?? new Error("Aborted");

    const polledCommitTime = await readCommitmentTimestamp(ctx, commitment);
    const chainNowSeconds = await readChainNowSeconds(ctx);

    if (polledCommitTime > 0 && chainNowSeconds - polledCommitTime >= minimumAgeSeconds) {
      return;
    }

    await sleep(COMMITMENT_POLL_INTERVAL_MS, ctx.signal);
  }

  throw new Error(
    `Commitment still too new after ${waitSeconds + COMMITMENT_POLL_TIMEOUT_MS / 1000}s. The chain's block timestamps may be advancing slower than expected. Try increasing --commitment-buffer or DOTNS_COMMITMENT_BUFFER.`,
  );
}

export async function readDomainOwner(ctx: DotnsContext, name: string): Promise<Address> {
  const label = await normaliseName(ctx, name);
  const tokenId = await computeDomainTokenId(ctx, label);
  try {
    return await read<Address>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "ownerOf", [
      tokenId,
    ]);
  } catch {
    return zeroAddress;
  }
}

export type CommitmentStatus = {
  committedTimestampSeconds: number;
  nowSeconds: number;
  minAgeSeconds: number;
  maxAgeSeconds: number;
};

export async function readCommitmentStatus(
  ctx: DotnsContext,
  commitment: Hex,
): Promise<CommitmentStatus> {
  const [minAge, maxAge, committedAt] = await Promise.all([
    read<bigint | number>(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "minCommitmentAge",
      [],
    ),
    read<bigint | number>(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "maxCommitmentAge",
      [],
    ),
    readCommitmentTimestamp(ctx, commitment),
  ]);

  return {
    committedTimestampSeconds: committedAt,
    nowSeconds: await readChainNowSeconds(ctx),
    minAgeSeconds: toNumber(minAge),
    maxAgeSeconds: toNumber(maxAge),
  };
}

export async function getUserProofOfPersonhoodStatus(
  ctx: DotnsContext,
  ownerAddress: Address,
): Promise<ProofOfPersonhoodStatus> {
  const personhoodInfo = await read<PersonhoodInfo | readonly unknown[]>(
    ctx,
    PERSONHOOD_PRECOMPILE_ADDRESS,
    PERSONHOOD_ABI,
    "personhoodStatus",
    [ownerAddress, PERSONHOOD_CONTEXT],
  );
  return convertToProofOfPersonhoodStatus(getPersonhoodStatusValue(personhoodInfo));
}

export async function getPriceAndValidateEligibility(
  ctx: DotnsContext,
  name: string,
  ownerAddress: Address,
): Promise<PricingAndEligibility> {
  const label = await normaliseName(ctx, name);
  validateDomainLabel(label);

  const baseName = baseLabelOf(label);
  const [isReserved, reservationOwner] = await read<ReservationInfoLike>(
    ctx,
    ctx.contracts.DOTNS_RULES,
    POP_RULES_ABI,
    "isBaseNameReserved",
    [baseName],
  );

  if (isReserved && checksumAddress(reservationOwner) !== checksumAddress(ownerAddress)) {
    throw new Error("Base name reserved for original Lite registrant");
  }

  const classificationResult = await readNamePricing(ctx, label, ownerAddress);
  const requiredStatus = convertToProofOfPersonhoodStatus(classificationResult.status);
  const message = classificationResult.message;

  const userStatus = await getUserProofOfPersonhoodStatus(ctx, ownerAddress);

  if (requiredStatus === ProofOfPersonhoodStatus.Reserved) {
    throw new Error(message);
  }
  if (requiredStatus === ProofOfPersonhoodStatus.ProofOfPersonhoodFull) {
    if (userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodFull) {
      throw new Error("Requires Full Personhood verification");
    }
  } else if (requiredStatus === ProofOfPersonhoodStatus.ProofOfPersonhoodLite) {
    if (
      userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodLite &&
      userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodFull
    ) {
      throw new Error("Requires Personhood Lite verification");
    }
  }
  // NoStatus-tier labels (stem of nine characters or more) are open to every tier,
  // so no caller-side check fires here. Reservation collisions and any other
  // protocol-side guards are enforced by PopRules at submission time.

  const resolvedPriceWei = classificationResult.price;

  return {
    priceWei: resolvedPriceWei,
    requiredStatus,
    userStatus,
    message,
    status: requiredStatus,
    price: resolvedPriceWei,
  };
}

// Cross-payer friction charged when msg.sender != owner. register() requires
// msg.value >= max(price, transferFloor(label, msg.sender, owner)); underpaying
// reverts with InsufficientValue.
export async function quoteCrossPayerFriction(
  ctx: DotnsContext,
  name: string,
  callerEvmAddress: Address,
  ownerEvmAddress: Address,
): Promise<bigint> {
  const label = await normaliseName(ctx, name);
  return read<bigint>(ctx, ctx.contracts.DOTNS_RULES, POP_RULES_ABI, "transferFloor", [
    label,
    callerEvmAddress,
    ownerEvmAddress,
  ]);
}

export type RegistrationResult = {
  name: string;
  owner: Address;
  priceWei: bigint;
  frictionWei: bigint;
  chargedWei: bigint;
  bufferedWei: bigint;
  txHash: Hex;
};

export async function finalizeRegularRegistration(
  ctx: DotnsContext,
  registration: DomainRegistration,
  priceWei: bigint,
  frictionWei: bigint = 0n,
): Promise<RegistrationResult> {
  const chargedWei = chargedAmountWei(priceWei, frictionWei);
  const bufferedWei = bufferedPaymentWei(chargedWei);
  const bufferedPaymentNative = convertWeiToNative(bufferedWei, ctx.nativeTokenDecimals);

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    bufferedPaymentNative,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "register",
    [registration],
    "Registration",
  );

  return {
    name: await formatDomainName(ctx, registration.label),
    owner: registration.owner,
    priceWei,
    frictionWei,
    chargedWei,
    bufferedWei,
    txHash,
  };
}

export async function finalizeGovernanceRegistration(
  ctx: DotnsContext,
  registration: DomainRegistration,
): Promise<{ name: string; owner: Address; txHash: Hex }> {
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    0n,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "registerReserved",
    [registration],
    "Governance Registration",
  );
  return {
    name: await formatDomainName(ctx, registration.label),
    owner: registration.owner,
    txHash,
  };
}

export type SubnameResult = {
  name: string;
  owner: Address;
  txHash: Hex;
};

export async function registerSubnode(
  ctx: DotnsContext,
  sublabel: string,
  parentLabel: string,
  ownerAddress: Address,
): Promise<SubnameResult> {
  const subLabel = await normaliseName(ctx, sublabel);
  const parent = await normaliseName(ctx, parentLabel);
  const subnodeRecord: SubnodeRecord = {
    parentNode: await domainNode(ctx, parent),
    subLabel,
    parentLabel: parent,
    owner: ownerAddress,
  };

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    0n,
    DOTNS_REGISTRY_ABI,
    "setSubnodeOwner",
    [subnodeRecord],
    "Subname registration",
  );

  return {
    name: `${subLabel}.${await formatDomainName(ctx, parent)}`,
    owner: ownerAddress,
    txHash,
  };
}

export async function verifyDomainOwnership(
  ctx: DotnsContext,
  name: string,
  expectedOwner: Address,
): Promise<Address> {
  const label = await normaliseName(ctx, name);
  const tokenId = await computeDomainTokenId(ctx, label);
  const actualOwner = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "ownerOf",
    [tokenId],
  );

  if (checksumAddress(actualOwner) !== checksumAddress(expectedOwner)) {
    throw new Error(`Owner mismatch for ${await formatDomainName(ctx, label)}`);
  }
  return actualOwner;
}

async function readLabelStore(ctx: DotnsContext, ownerAddress: Address): Promise<Address> {
  return getAddress(
    await read<Address>(ctx, ctx.contracts.STORE_FACTORY, STORE_FACTORY_ABI, "getLabelStore", [
      ownerAddress,
    ]),
  );
}

type PendingClaim = { label: string; mintedAt: bigint };

// `pendingClaims(address,uint256,uint256)` pages since dotns v0.6.0.
const PENDING_CLAIM_PAGE_LIMIT = 16n;
const PENDING_CLAIM_PAGE_MAX = 16n;

async function readPendingClaims(
  ctx: DotnsContext,
  ownerAddress: Address,
): Promise<readonly PendingClaim[]> {
  const claims: PendingClaim[] = [];
  for (let page = 0n; page < PENDING_CLAIM_PAGE_MAX; page += 1n) {
    const chunk =
      (await read<readonly PendingClaim[]>(
        ctx,
        ctx.contracts.DOTNS_POP_CONTROLLER,
        DOTNS_POP_CONTROLLER_ABI,
        "pendingClaims",
        [ownerAddress, page * PENDING_CLAIM_PAGE_LIMIT, PENDING_CLAIM_PAGE_LIMIT],
      )) ?? [];
    claims.push(...chunk);
    if (BigInt(chunk.length) < PENDING_CLAIM_PAGE_LIMIT) break;
  }
  return claims;
}

export async function getPendingClaimLabels(
  ctx: DotnsContext,
  address: Address,
): Promise<string[]> {
  const claims = await readPendingClaims(ctx, address);
  return claims.map((claim) => claim.label);
}

export type LabelStoreSyncResult = {
  labelStore: Address;
  pending: string[];
  synced: boolean;
  /** The last claim failure when `synced` is false. */
  error?: unknown;
};

// Reconciles on-chain state for the caller: a fresh registration parks the name
// in the PoP controller's pending queue; this step settles the queue into the
// user's LabelStore (deploying it on first use). Always runs after a register.
export async function ensureLabelStoreReady(
  ctx: DotnsContext,
  ownerAddress: Address,
): Promise<LabelStoreSyncResult> {
  const [labelStore, pending] = await Promise.all([
    readLabelStore(ctx, ownerAddress),
    readPendingClaims(ctx, ownerAddress),
  ]);
  const pendingLabels = pending.map((claim) => claim.label);

  if (pendingLabels.length === 0) {
    return { labelStore, pending: pendingLabels, synced: true };
  }

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await write(
        ctx,
        ctx.contracts.DOTNS_POP_CONTROLLER,
        0n,
        DOTNS_POP_CONTROLLER_ABI,
        "claimLabelStore",
        [],
        "Label Store sync",
      );
      const deployed = await readLabelStore(ctx, ownerAddress);
      return { labelStore: deployed, pending: pendingLabels, synced: true };
    } catch (error) {
      lastError = error;
    }
  }

  return { labelStore, pending: pendingLabels, synced: false, error: lastError };
}

export type RegisterNameOptions = GenerateCommitmentOptions & {
  commitmentBuffer?: number;
  callerAddress?: Address;
};

// Thin happy-path wrapper over the commit-reveal sequence for regular names. Each
// step is also exported individually so callers that need to persist commitments
// or surface progress between phases can drive the sequence themselves.
export async function registerName(
  ctx: DotnsContext,
  name: string,
  opts: RegisterNameOptions = {},
): Promise<RegistrationResult> {
  const label = await normaliseName(ctx, name);
  await ensureDomainNotRegistered(ctx, label);

  const { commitment, registration } = await generateCommitment(ctx, label, opts);
  await submitCommitment(ctx, commitment);
  await waitForMinimumCommitmentAge(ctx, commitment, { commitmentBuffer: opts.commitmentBuffer });

  const owner = registration.owner;
  const caller = opts.callerAddress ?? owner;
  const pricing = await getPriceAndValidateEligibility(ctx, label, owner);
  const frictionWei = isSameEvmAddress(caller, owner)
    ? 0n
    : await quoteCrossPayerFriction(ctx, label, caller, owner);

  const result = await finalizeRegularRegistration(
    ctx,
    registration,
    pricing.priceWei,
    frictionWei,
  );
  await verifyDomainOwnership(ctx, label, owner);
  return result;
}
