import {
  bytesToHex,
  checksumAddress,
  getAddress,
  isHex,
  namehash,
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
import { validateDomainLabel, normaliseLabel, stripTrailingDigits } from "../utils/validation";
import { computeDomainTokenId } from "../utils/contractInteractions";
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
  const label = normaliseLabel(name);
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

export async function ensureDomainNotRegistered(ctx: DotnsContext, name: string): Promise<void> {
  const label = normaliseLabel(name);
  const owner = await readDomainOwner(ctx, label);
  if (owner !== zeroAddress) throw new DomainUnavailableError(`${label}.dot`);
}

export type GenerateCommitmentOptions = {
  owner?: Address;
  secret?: Hex;
  includeReverse?: boolean;
};

export type GeneratedCommitment = {
  commitment: Hex;
  registration: DomainRegistration;
  secret: Hex;
};

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
  const label = normaliseLabel(name);
  validateDomainLabel(label);

  const owner = opts.owner ?? (await ownEvmAddress(ctx));
  const secret = resolveSecret(opts.secret);
  const registration: DomainRegistration = {
    label,
    owner,
    secret,
    reserved: opts.includeReverse ?? false,
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
  const label = normaliseLabel(name);
  const tokenId = computeDomainTokenId(label);
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
  const label = normaliseLabel(name);
  validateDomainLabel(label);

  const baseName = stripTrailingDigits(label);
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

  const classificationResult = await read<PricingAndEligibility>(
    ctx,
    ctx.contracts.DOTNS_RULES,
    POP_RULES_ABI,
    "priceWithoutCheck",
    [label, ownerAddress],
  );
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

  const resolvedPriceWei = classificationResult.price ?? classificationResult.priceWei;

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
  const label = normaliseLabel(name);
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
    name: `${registration.label}.dot`,
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
  return { name: `${registration.label}.dot`, owner: registration.owner, txHash };
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
  const subLabel = normaliseLabel(sublabel);
  const parent = normaliseLabel(parentLabel);
  const subnodeRecord: SubnodeRecord = {
    parentNode: namehash(`${parent}.dot`),
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

  return { name: `${subLabel}.${parent}.dot`, owner: ownerAddress, txHash };
}

export async function verifyDomainOwnership(
  ctx: DotnsContext,
  name: string,
  expectedOwner: Address,
): Promise<Address> {
  const label = normaliseLabel(name);
  const tokenId = computeDomainTokenId(label);
  const actualOwner = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "ownerOf",
    [tokenId],
  );

  if (checksumAddress(actualOwner) !== checksumAddress(expectedOwner)) {
    throw new Error(`Owner mismatch for ${label}.dot`);
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

// Governance whitelist authorising registerReserved. Independent of the account's
// PoP tier: a whitelisted address may register Reserved names regardless of its
// own personhood status.
export async function getWhitelistStatus(ctx: DotnsContext, address: Address): Promise<boolean> {
  return read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "isWhiteListed",
    [address],
  );
}

async function readPendingClaims(
  ctx: DotnsContext,
  ownerAddress: Address,
): Promise<readonly PendingClaim[]> {
  return (
    (await read<readonly PendingClaim[]>(
      ctx,
      ctx.contracts.DOTNS_POP_CONTROLLER,
      DOTNS_POP_CONTROLLER_ABI,
      "pendingClaims",
      [ownerAddress],
    )) ?? []
  );
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

  void lastError;
  return { labelStore, pending: pendingLabels, synced: false };
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
  const label = normaliseLabel(name);
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
