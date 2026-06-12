import chalk from "chalk";
import ora from "ora";
import crypto from "crypto";
import { checksumAddress, zeroAddress, namehash, type Address, type Hex, getAddress } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { formatErrorMessage } from "../utils/formatting";
import {
  ProofOfPersonhoodStatus,
  type CommitmentResults,
  type DomainRegistration,
  type NameClassification,
  type NameClassificationLike,
  type PricingAndEligibility,
  type ReservationInfoLike,
  type SubnodeRecord,
} from "../types/types";
import {
  CONTRACTS,
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
import { validateDomainLabel, stripTrailingDigits } from "../utils/validation";
import {
  performContractCall,
  submitContractTransaction,
  computeDomainTokenId,
} from "../utils/contractInteractions";
import { formatWeiAsEther, convertWeiToNative, withTimeout } from "../utils/formatting";
import { isSameEvmAddress } from "../utils/address";

// msg.value carries 10% over the charged amount so a price movement between quote
// and execution cannot revert; the controller refunds the unused part.
const PAYMENT_BUFFER_PERCENT = 110n;

function chargedAmountWei(priceWei: bigint, frictionWei: bigint): bigint {
  return priceWei > frictionWei ? priceWei : frictionWei;
}

function bufferedPaymentWei(chargedWei: bigint): bigint {
  return (chargedWei * PAYMENT_BUFFER_PERCENT) / 100n;
}

function toNumber(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function redactSecret(secret: Hex): string {
  if (secret.length <= 10) return "0x" + "*".repeat(secret.length - 2);
  const prefix = secret.slice(0, 6);
  const suffix = secret.slice(-4);
  const redacted = "*".repeat(secret.length - 10);
  return `${prefix}${redacted}${suffix}`;
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

export async function classifyDomainName(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
): Promise<NameClassification> {
  const spinner = ora("Classifying name via PopRules").start();

  try {
    const classificationResult = await withTimeout(
      performContractCall<NameClassificationLike>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_RULES,
        POP_RULES_ABI,
        "classifyName",
        [label],
      ),
      30000,
      "classifyName",
    );

    const requiredStatus = convertToProofOfPersonhoodStatus(classificationResult[0]);
    const message = classificationResult[1];

    spinner.succeed("Name classification");
    console.log(chalk.gray("  required:  ") + chalk.white(ProofOfPersonhoodStatus[requiredStatus]));
    console.log(chalk.gray("  message:   ") + chalk.white(message));

    return { requiredStatus, message };
  } catch (error) {
    spinner.fail("Name classification failed");
    throw error;
  }
}

export async function ensureDomainNotRegistered(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
): Promise<void> {
  const spinner = ora(`Checking availability of ${chalk.cyan(label + ".dot")}`).start();

  const tokenId = computeDomainTokenId(label);

  try {
    const owner = await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR,
        DOTNS_REGISTRAR_ABI,
        "ownerOf",
        [tokenId],
      ),
      30000,
      "Availability check",
    );

    if (owner !== zeroAddress) {
      spinner.fail(`Name ${chalk.cyan(label + ".dot")} already owned by ${chalk.yellow(owner)}`);
      throw new Error(`Domain already owned by ${owner}`);
    }
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("already owned")) throw error;
  }

  spinner.succeed(`Name ${chalk.cyan(label + ".dot")} is available`);
}

export async function generateCommitment(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  ownerAddress: Address,
  includeReverse: boolean,
): Promise<CommitmentResults> {
  const spinner = ora("Generating commitment hash").start();

  try {
    validateDomainLabel(label);

    const secret: Hex = `0x${crypto.randomBytes(32).toString("hex")}`;
    const registration: DomainRegistration = {
      label,
      owner: ownerAddress,
      secret,
      reserved: includeReverse,
    };

    const commitment = await withTimeout(
      performContractCall<Hex>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "makeCommitment",
        [registration],
      ),
      30000,
      "Commitment generation",
    );

    spinner.succeed("Commitment hash generated");
    console.log(chalk.gray("  commitment: ") + chalk.blue(commitment));
    console.log(chalk.gray("  hash:       ") + chalk.dim("label + owner + secret + reserved"));
    console.log(chalk.gray("  secret:     ") + chalk.yellow(redactSecret(secret)));
    console.log(
      chalk.gray("  reserved:   ") + (includeReverse ? chalk.green("true") : chalk.white("false")),
    );

    return { commitment, registration };
  } catch (error) {
    spinner.fail("Failed to create commitment");
    throw error;
  }
}

export async function submitCommitment(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  commitment: Hex,
): Promise<void> {
  const spinner = ora("Submitting commitment to controller").start();

  const transactionHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
    0n,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "commit",
    [commitment],
    substrateAddress,
    signer,
    spinner,
    "Commitment",
  );

  console.log(chalk.gray("  tx:        ") + chalk.blue(transactionHash));
  console.log(chalk.gray("  committed: ") + chalk.white(new Date().toISOString()));
}

export async function waitForMinimumCommitmentAge(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  commitment: Hex,
  commitmentBuffer?: number,
): Promise<void> {
  const buffer = commitmentBuffer ?? DEFAULT_COMMITMENT_BUFFER_SECONDS;
  const checkSpinner = ora("Reading minimum commitment age").start();

  const [minimumAge, initialCommitTimestamp] = await Promise.all([
    withTimeout(
      performContractCall<bigint | number>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "minCommitmentAge",
        [],
      ),
      30000,
      "minCommitmentAge",
    ),
    withTimeout(
      performContractCall<bigint | number>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "commitments",
        [commitment],
      ),
      30000,
      "commitments",
    ),
  ]);

  const minimumAgeSeconds = toNumber(minimumAge);
  const initialCommitTime = toNumber(initialCommitTimestamp);

  if (initialCommitTime === 0) {
    checkSpinner.fail("Commitment not found on-chain");
    throw new Error("Commitment not found on-chain. It may not have been included in a block yet.");
  }

  const waitSeconds = minimumAgeSeconds + buffer;
  checkSpinner.succeed(`Minimum commitment age: ${chalk.yellow(waitSeconds.toString() + "s")}`);

  const waitSpinner = ora(`Waiting for commitment age (${waitSeconds}s)`).start();

  let elapsedSeconds = 0;
  const intervalId = setInterval(() => {
    elapsedSeconds++;
    const remainingSeconds = waitSeconds - elapsedSeconds;
    waitSpinner.text = `Waiting for commitment age (${chalk.yellow(remainingSeconds + "s")} remaining)`;
  }, 1000);

  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  clearInterval(intervalId);

  waitSpinner.text = "Verifying commitment age on-chain";

  // Compare block-time to block-time, not wall-clock to block-time. The
  // contract's CommitmentTooNew check is `block.timestamp - commitTimestamp
  // >= minCommitmentAge`, so the verify poll has to use the chain's current
  // block timestamp as "now" — otherwise block-time can lag wall-clock by
  // several seconds (e.g. on a parachain between blocks) and we submit the
  // reveal while the contract still sees the commitment as too new. The
  // Timestamp pallet stores block.timestamp in milliseconds.
  const pollDeadline = Date.now() + COMMITMENT_POLL_TIMEOUT_MS;

  const timestampQuery = (clientWrapper.client as any).query?.Timestamp?.Now;
  while (Date.now() < pollDeadline) {
    const polledTimestamp = await performContractCall<bigint | number>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "commitments",
      [commitment],
    );

    const polledCommitTime = toNumber(polledTimestamp);

    // Prefer chain block.timestamp via Timestamp::Now; fall back to wall-clock
    // only if the pallet storage isn't available on this runtime (defensive —
    // every Substrate chain we care about has it).
    let chainNowSeconds: number;
    if (timestampQuery?.getValue) {
      const timestampMs = (await timestampQuery.getValue()) as bigint | number;
      chainNowSeconds = Math.floor(Number(timestampMs) / 1000);
    } else {
      chainNowSeconds = Math.floor(Date.now() / 1000);
    }

    if (polledCommitTime > 0 && chainNowSeconds - polledCommitTime >= minimumAgeSeconds) {
      waitSpinner.succeed("Commitment age requirement met (verified on-chain)");
      return;
    }

    waitSpinner.text = `Commitment still too new, polling (${Math.ceil((pollDeadline - Date.now()) / 1000)}s remaining)`;
    await new Promise((resolve) => setTimeout(resolve, COMMITMENT_POLL_INTERVAL_MS));
  }

  waitSpinner.fail("Commitment age verification timed out");
  throw new Error(
    `Commitment still too new after ${waitSeconds + COMMITMENT_POLL_TIMEOUT_MS / 1000}s. The chain's block timestamps may be advancing slower than expected. Try increasing --commitment-buffer or DOTNS_COMMITMENT_BUFFER.`,
  );
}

export async function readDomainOwner(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
): Promise<Address> {
  const tokenId = computeDomainTokenId(label);
  try {
    return await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR,
        DOTNS_REGISTRAR_ABI,
        "ownerOf",
        [tokenId],
      ),
      30000,
      "ownerOf",
    );
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
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  commitment: Hex,
): Promise<CommitmentStatus> {
  const [minAge, maxAge, committedAt] = await Promise.all([
    withTimeout(
      performContractCall<bigint | number>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "minCommitmentAge",
        [],
      ),
      30000,
      "minCommitmentAge",
    ),
    withTimeout(
      performContractCall<bigint | number>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "maxCommitmentAge",
        [],
      ),
      30000,
      "maxCommitmentAge",
    ),
    withTimeout(
      performContractCall<bigint | number>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "commitments",
        [commitment],
      ),
      30000,
      "commitments",
    ),
  ]);

  const timestampQuery = (clientWrapper.client as any).query?.Timestamp?.Now;
  const nowSeconds = timestampQuery?.getValue
    ? Math.floor(Number((await timestampQuery.getValue()) as bigint | number) / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    committedTimestampSeconds: toNumber(committedAt),
    nowSeconds,
    minAgeSeconds: toNumber(minAge),
    maxAgeSeconds: toNumber(maxAge),
  };
}

export async function getUserProofOfPersonhoodStatus(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  ownerAddress: Address,
): Promise<ProofOfPersonhoodStatus> {
  const personhoodInfo = await withTimeout(
    performContractCall<PersonhoodInfo | readonly unknown[]>(
      clientWrapper,
      originSubstrateAddress,
      PERSONHOOD_PRECOMPILE_ADDRESS,
      PERSONHOOD_ABI,
      "personhoodStatus",
      [ownerAddress, PERSONHOOD_CONTEXT],
    ),
    30000,
    "personhoodStatus",
  );

  return convertToProofOfPersonhoodStatus(getPersonhoodStatusValue(personhoodInfo));
}

export async function getPriceAndValidateEligibility(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  ownerAddress: Address,
  callerAddress: Address = ownerAddress,
): Promise<PricingAndEligibility> {
  const registeringForOther = !isSameEvmAddress(callerAddress, ownerAddress);
  const spinner = ora("Pricing via PopRules.price").start();

  try {
    validateDomainLabel(label);

    const baseName = stripTrailingDigits(label);
    const reservationInfo = await withTimeout(
      performContractCall<ReservationInfoLike>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_RULES,
        POP_RULES_ABI,
        "isBaseNameReserved",
        [baseName],
      ),
      30000,
      "isBaseNameReserved",
    );

    const [isReserved, reservationOwner] = reservationInfo;

    if (isReserved && checksumAddress(reservationOwner) !== checksumAddress(ownerAddress)) {
      spinner.fail("Eligibility failed");
      throw new Error("Base name reserved for original Lite registrant");
    }

    const classificationResult = await withTimeout(
      performContractCall<PricingAndEligibility>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_RULES,
        POP_RULES_ABI,
        "priceWithoutCheck",
        [label, ownerAddress],
      ),
      30000,
      "priceWithoutCheck",
    );
    const requiredStatus = convertToProofOfPersonhoodStatus(classificationResult.status);
    const message = classificationResult.message;

    const userStatus = await getUserProofOfPersonhoodStatus(
      clientWrapper,
      originSubstrateAddress,
      ownerAddress,
    );
    if (requiredStatus === ProofOfPersonhoodStatus.Reserved) {
      spinner.fail("Eligibility failed");
      throw new Error(message);
    }

    if (requiredStatus === ProofOfPersonhoodStatus.ProofOfPersonhoodFull) {
      if (userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodFull) {
        spinner.fail("Eligibility failed");
        throw new Error("Requires Full Personhood verification");
      }
    } else if (requiredStatus === ProofOfPersonhoodStatus.ProofOfPersonhoodLite) {
      if (
        userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodLite &&
        userStatus !== ProofOfPersonhoodStatus.ProofOfPersonhoodFull
      ) {
        spinner.fail("Eligibility failed");
        throw new Error("Requires Personhood Lite verification");
      }
    }
    // NoStatus-tier labels (stem of nine characters or more) are open to every tier,
    // so no caller-side check fires here. Reservation collisions and any other
    // protocol-side guards are enforced by PopRules at submission time.

    spinner.succeed("Eligibility and price");
    const resolvedPriceWei = classificationResult.price ?? classificationResult.priceWei;
    const flatPriceWei = await withTimeout(
      performContractCall<bigint>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_RULES,
        POP_RULES_ABI,
        "price",
        [label],
      ),
      30000,
      "price",
    );
    const noStatusLabel = ProofOfPersonhoodStatus[ProofOfPersonhoodStatus.NoStatus];
    console.log(
      chalk.gray("  name tier:  ") + chalk.white(ProofOfPersonhoodStatus[requiredStatus]),
    );
    if (registeringForOther) {
      console.log(chalk.gray("  owner:      ") + chalk.white(ownerAddress));
      console.log(chalk.gray("  owner tier: ") + chalk.white(ProofOfPersonhoodStatus[userStatus]));
    } else {
      console.log(chalk.gray("  your tier:  ") + chalk.white(ProofOfPersonhoodStatus[userStatus]));
    }
    console.log(chalk.gray("  message:    ") + chalk.white(message));
    console.log(
      chalk.gray(`  price (${registeringForOther ? "owner" : "you"}):       `) +
        chalk.green(`${formatWeiAsEther(resolvedPriceWei)} PAS`),
    );
    console.log(
      chalk.gray(`  price (${noStatusLabel}):  `) +
        chalk.white(`${formatWeiAsEther(flatPriceWei)} PAS`),
    );

    return {
      priceWei: resolvedPriceWei,
      requiredStatus,
      userStatus,
      message,
      status: requiredStatus,
      price: resolvedPriceWei,
    };
  } catch (error) {
    if (!spinner.isSpinning) throw error;
    spinner.fail("Pricing failed");
    throw error;
  }
}

// Cross-payer friction charged when msg.sender != owner. register() requires
// msg.value >= max(price, transferFloor(label, msg.sender, owner)); underpaying
// reverts with InsufficientValue.
export async function quoteCrossPayerFriction(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  callerEvmAddress: Address,
  ownerEvmAddress: Address,
): Promise<bigint> {
  return await withTimeout(
    performContractCall<bigint>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_RULES,
      POP_RULES_ABI,
      "transferFloor",
      [label, callerEvmAddress, ownerEvmAddress],
    ),
    30000,
    "transferFloor",
  );
}

export async function finalizeRegularRegistration(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  registration: DomainRegistration,
  priceWei: bigint,
  nativeTokenDecimals?: number,
  frictionWei: bigint = 0n,
): Promise<void> {
  const spinner = ora(`Registering ${chalk.cyan(registration.label + ".dot")}`).start();

  try {
    const totalChargedWei = chargedAmountWei(priceWei, frictionWei);
    const bufferedWei = bufferedPaymentWei(totalChargedWei);
    const bufferedPaymentNative = convertWeiToNative(bufferedWei, nativeTokenDecimals);

    console.log(chalk.gray("  cost:      ") + chalk.green(formatWeiAsEther(priceWei) + " PAS"));
    if (frictionWei > 0n) {
      console.log(
        chalk.gray("  friction:  ") + chalk.yellow(formatWeiAsEther(frictionWei) + " PAS"),
      );
    }
    console.log(
      chalk.gray("  paying:    ") + chalk.green(formatWeiAsEther(totalChargedWei) + " PAS"),
    );

    const transactionHash = await submitContractTransaction(
      clientWrapper,
      CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
      bufferedPaymentNative,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "register",
      [registration],
      substrateAddress,
      signer,
      spinner,
      "Registration",
    );

    console.log(chalk.gray("  tx:        ") + chalk.blue(transactionHash));
    console.log(
      chalk.gray("  paid:      ") + chalk.green(formatWeiAsEther(totalChargedWei) + " PAS"),
    );
    console.log(
      chalk.gray("  note:      ") +
        chalk.gray(
          `sent ${formatWeiAsEther(bufferedWei)} PAS with a 10% buffer; the unused amount is refunded`,
        ),
    );
  } catch (error) {
    spinner.fail("Registration failed");
    throw error;
  }
}

export async function finalizeGovernanceRegistration(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  registration: DomainRegistration,
): Promise<void> {
  const spinner = ora(
    `Registering governance name ${chalk.cyan(registration.label + ".dot")}`,
  ).start();

  try {
    const transactionHash = await submitContractTransaction(
      clientWrapper,
      CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
      0n,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "registerReserved",
      [registration],
      substrateAddress,
      signer,
      spinner,
      "Governance Registration",
    );

    console.log(chalk.gray("  tx:        ") + chalk.blue(transactionHash));
  } catch (error) {
    spinner.fail("Governance registration failed");
    throw error;
  }
}

export async function registerSubnode(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  sublabel: string,
  parentLabel: string,
  ownerAddress: Address,
): Promise<Hex> {
  const fullName = `${sublabel}.${parentLabel}.dot`;
  const spinner = ora(`Registering subname ${chalk.cyan(fullName)}`).start();

  try {
    const parentNode = namehash(`${parentLabel}.dot`);

    const subnodeRecord: SubnodeRecord = {
      parentNode,
      subLabel: sublabel,
      parentLabel: parentLabel,
      owner: ownerAddress,
    };

    const transactionHash = await submitContractTransaction(
      clientWrapper,
      CONTRACTS.DOTNS_REGISTRY,
      0n,
      DOTNS_REGISTRY_ABI,
      "setSubnodeOwner",
      [subnodeRecord],
      substrateAddress,
      signer,
      spinner,
      "Subname registration",
    );

    console.log(chalk.gray("  tx:        ") + chalk.blue(transactionHash));

    return transactionHash as Hex;
  } catch (error) {
    spinner.fail("Subname registration failed");
    throw error;
  }
}

export async function verifyDomainOwnership(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  expectedOwner: Address,
): Promise<Address> {
  const spinner = ora("Verifying minted ownership").start();

  try {
    const tokenId = computeDomainTokenId(label);
    const actualOwner = await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_REGISTRAR,
        DOTNS_REGISTRAR_ABI,
        "ownerOf",
        [tokenId],
      ),
      30000,
      "ownerOf",
    );

    if (checksumAddress(actualOwner) !== checksumAddress(expectedOwner)) {
      spinner.fail("Ownership verification failed");
      console.log(chalk.gray("  expected:  ") + chalk.white(expectedOwner));
      console.log(chalk.gray("  actual:    ") + chalk.white(actualOwner));
      throw new Error(`Owner mismatch for ${label}.dot`);
    }

    spinner.succeed("Ownership verified");
    console.log(chalk.gray("  owner:     ") + chalk.white(actualOwner));
    return actualOwner;
  } catch (error) {
    spinner.fail("Ownership verification failed");
    throw error;
  }
}

async function readLabelStore(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  ownerAddress: Address,
): Promise<Address> {
  return getAddress(
    await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.STORE_FACTORY,
        STORE_FACTORY_ABI,
        "getLabelStore",
        [ownerAddress],
      ),
      30000,
      "getLabelStore",
    ),
  );
}

type PendingClaim = { label: string; mintedAt: bigint };

// Governance whitelist authorising registerReserved. Independent of the account's
// PoP tier: a whitelisted address may register Reserved names regardless of its
// own personhood status.
export async function getWhitelistStatus(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  address: Address,
): Promise<boolean> {
  return await withTimeout(
    performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
      DOTNS_REGISTRAR_CONTROLLER_ABI,
      "isWhiteListed",
      [address],
    ),
    30000,
    "isWhiteListed",
  );
}

export async function getPendingClaimLabels(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  address: Address,
): Promise<string[]> {
  const claims = await readPendingClaims(clientWrapper, originSubstrateAddress, address);
  return claims.map((claim) => claim.label);
}

async function readPendingClaims(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  ownerAddress: Address,
): Promise<readonly PendingClaim[]> {
  return (
    (await withTimeout(
      performContractCall<readonly PendingClaim[]>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.DOTNS_POP_CONTROLLER,
        DOTNS_POP_CONTROLLER_ABI,
        "pendingClaims",
        [ownerAddress],
      ),
      30000,
      "pendingClaims",
    )) ?? []
  );
}

// Reconciles on-chain state for the caller: a fresh registration parks the name
// in the PoP controller's pending queue; this step settles the queue into the
// user's LabelStore (deploying it on first use). Always runs after a register.
export async function ensureLabelStoreReady(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  ownerAddress: Address,
): Promise<void> {
  const inspectSpinner = ora("Checking your Label Store and pending names").start();

  let labelStore: Address;
  let pending: readonly PendingClaim[];
  try {
    [labelStore, pending] = await Promise.all([
      readLabelStore(clientWrapper, substrateAddress, ownerAddress),
      readPendingClaims(clientWrapper, substrateAddress, ownerAddress),
    ]);
    inspectSpinner.succeed(
      pending.length === 0
        ? "Label Store up to date. Nothing to sync."
        : `Found ${pending.length} pending name(s) to sync into your Label Store`,
    );
  } catch (error) {
    inspectSpinner.fail("Could not read your Label Store status");
    throw error;
  }

  if (pending.length === 0) {
    if (labelStore === zeroAddress) {
      console.log(
        chalk.gray("  label store: ") +
          chalk.yellow("(not deployed yet; will be created on your next registration)"),
      );
    } else {
      console.log(chalk.gray("  label store: ") + chalk.cyan(labelStore));
    }
    return;
  }

  console.log(
    chalk.gray("  pending names: ") + chalk.white(pending.map((claim) => claim.label).join(", ")),
  );

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const syncSpinner = ora(
      labelStore === zeroAddress
        ? `Deploying your Label Store and syncing ${pending.length} name(s) on-chain (attempt ${attempt}/${maxAttempts})`
        : `Syncing ${pending.length} name(s) into your Label Store (attempt ${attempt}/${maxAttempts})`,
    ).start();

    try {
      await submitContractTransaction(
        clientWrapper,
        CONTRACTS.DOTNS_POP_CONTROLLER,
        0n,
        DOTNS_POP_CONTROLLER_ABI,
        "claimLabelStore",
        [],
        substrateAddress,
        signer,
        syncSpinner,
        "Label Store sync",
      );
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      syncSpinner.fail(
        attempt < maxAttempts
          ? `Sync attempt ${attempt} failed. Retrying.`
          : `Sync attempt ${attempt} failed`,
      );
    }
  }

  if (lastError !== undefined) {
    console.log();
    console.log(chalk.yellow("  ⚠ Could not sync your Label Store right now."));
    console.log(
      chalk.gray(
        "    Your name is safely registered on-chain. The pending claim stays queued, and we will automatically retry on your next `dotns register`.",
      ),
    );
    console.log(chalk.gray("    To retry sooner, run: " + chalk.cyan("dotns store sync")));
    return;
  }

  const deployed = await readLabelStore(clientWrapper, substrateAddress, ownerAddress);
  console.log(chalk.gray("  label store: ") + chalk.cyan(deployed));
  console.log(
    chalk.gray("  synced:      ") +
      chalk.green(`${pending.length} name(s) now resolvable from your Label Store`),
  );
}
