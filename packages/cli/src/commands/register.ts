import chalk from "chalk";
import ora from "ora";
import crypto from "crypto";
import { checksumAddress, zeroAddress, namehash, type Address, type Hex } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import {
  ProofOfPersonhoodStatus,
  type CommitmentResults,
  type DomainOwnership,
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
  STORE_FACTORY_ABI,
} from "../utils/constants";
import { validateDomainLabel, stripTrailingDigits, countTrailingDigits } from "../utils/validation";
import {
  performContractCall,
  submitContractTransaction,
  computeDomainTokenId,
} from "../utils/contractInteractions";
import { formatWeiAsEther, convertWeiToNative, withTimeout } from "../utils/formatting";

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
  throw new Error(`Unexpected ProofOfPersonhoodStatus type: ${typeof value}`);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
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
): Promise<void> {
  const checkSpinner = ora("Reading minimum commitment age").start();

  const minimumAge = await withTimeout(
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
  );

  const minimumAgeSeconds = typeof minimumAge === "bigint" ? Number(minimumAge) : minimumAge;
  const waitSeconds = minimumAgeSeconds + 6;

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
  waitSpinner.succeed("Commitment age requirement met");
}

export async function getUserProofOfPersonhoodStatus(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  ownerAddress: Address,
): Promise<ProofOfPersonhoodStatus> {
  const userStatusRaw = await withTimeout(
    performContractCall<ProofOfPersonhoodStatus | number | bigint>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_RULES,
      POP_RULES_ABI,
      "userPopStatus",
      [ownerAddress],
    ),
    30000,
    "userPopStatus",
  );

  return convertToProofOfPersonhoodStatus(userStatusRaw);
}

export async function getPriceAndValidateEligibility(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  ownerAddress: Address,
): Promise<PricingAndEligibility> {
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
    } else {
      const trailingDigitCount = countTrailingDigits(label);
      if (
        trailingDigitCount === 0 ||
        userStatus === ProofOfPersonhoodStatus.ProofOfPersonhoodLite
      ) {
        spinner.fail("Eligibility failed");
        throw new Error(
          "Personhood Lite cannot register base names\nThis means another user already owns the name without digits",
        );
      }
    }

    spinner.succeed("Eligibility and price");
    console.log(chalk.gray("  required:  ") + chalk.white(ProofOfPersonhoodStatus[requiredStatus]));
    console.log(chalk.gray("  user:      ") + chalk.white(ProofOfPersonhoodStatus[userStatus]));
    console.log(chalk.gray("  message:   ") + chalk.white(message));
    console.log(
      chalk.gray("  price:     ") +
        chalk.green(
          `${classificationResult.priceWei > 0n ? formatWeiAsEther(classificationResult.priceWei) : 0n} PAS`,
        ),
    );

    return {
      priceWei: classificationResult.price ?? classificationResult.priceWei,
      requiredStatus,
      userStatus,
      message,
      status: requiredStatus,
      price: classificationResult.price ?? classificationResult.priceWei,
    };
  } catch (error) {
    if (!spinner.isSpinning) throw error;
    spinner.fail("Pricing failed");
    throw error;
  }
}

export async function finalizeRegularRegistration(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  registration: DomainRegistration,
  priceWei: bigint,
): Promise<void> {
  const spinner = ora(`Registering ${chalk.cyan(registration.label + ".dot")}`).start();

  try {
    const bufferedPaymentWei = (priceWei * 110n) / 100n;
    const bufferedPaymentNative = convertWeiToNative(bufferedPaymentWei);

    console.log(chalk.gray("  oracle:    ") + chalk.green(formatWeiAsEther(priceWei) + " PAS"));
    console.log(
      chalk.gray("  paying:    ") + chalk.green(formatWeiAsEther(bufferedPaymentWei) + " PAS"),
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
      chalk.gray("  paid:      ") + chalk.green(formatWeiAsEther(bufferedPaymentWei) + " PAS"),
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

export async function displayDeployedStore(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  ownerAddress: Address,
): Promise<void> {
  const spinner = ora("Reading deployed Store address").start();

  try {
    const storeAddress = await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        originSubstrateAddress,
        CONTRACTS.STORE_FACTORY,
        STORE_FACTORY_ABI,
        "getDeployedStore",
        [ownerAddress],
      ),
      30000,
      "getDeployedStore",
    );

    spinner.succeed("Store");
    console.log(
      chalk.gray("  store:     ") +
        (storeAddress === zeroAddress ? chalk.yellow("not deployed") : chalk.cyan(storeAddress)),
    );
  } catch (error) {
    spinner.fail("Failed to read Store address");
    throw error;
  }
}

export async function setUserProofOfPersonhoodStatus(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  ownerAddress: Address,
  label: string,
  status: ProofOfPersonhoodStatus,
): Promise<void> {
  const displayName = label ? chalk.cyan(label) : "account";
  const checkSpinner = ora(`Checking current PoP status for ${displayName}`).start();

  try {
    const currentStatus = await getUserProofOfPersonhoodStatus(
      clientWrapper,
      substrateAddress,
      ownerAddress,
    );

    checkSpinner.succeed("Current PoP status");
    console.log(chalk.gray("  current:   ") + chalk.white(ProofOfPersonhoodStatus[currentStatus]));
    console.log(chalk.gray("  desired:   ") + chalk.white(ProofOfPersonhoodStatus[status]));

    if (currentStatus === status) {
      console.log(
        chalk.yellow(
          `  ↳ Status already set to ${ProofOfPersonhoodStatus[status]}, skipping update`,
        ),
      );
      return;
    }

    const updateSpinner = ora(
      `Setting PoP status for ${displayName} to ${chalk.yellow(ProofOfPersonhoodStatus[status])}`,
    ).start();

    const transactionHash = await submitContractTransaction(
      clientWrapper,
      CONTRACTS.DOTNS_RULES,
      0n,
      POP_RULES_ABI,
      "setUserPopStatus",
      [status],
      substrateAddress,
      signer,
      updateSpinner,
      "PoP status update",
    );

    console.log(chalk.gray("  tx:        ") + chalk.blue(transactionHash));
  } catch (error) {
    if (checkSpinner.isSpinning) checkSpinner.fail("Failed to check PoP status");
    throw error;
  }
}

export async function getDomainOwnershipInfo(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  label: string,
): Promise<DomainOwnership> {
  const evmAddress = await clientWrapper.getEvmAddress(substrateAddress);
  const ownerEvmAddress = await verifyDomainOwnership(
    clientWrapper,
    substrateAddress,
    label,
    evmAddress,
  );

  const ownerSubstrateAddress = await clientWrapper.getSubstrateAddress(ownerEvmAddress);

  return {
    registered: ownerEvmAddress !== zeroAddress,
    ownerEvm: ownerEvmAddress !== zeroAddress ? ownerEvmAddress : zeroAddress,
    ownerSubstrate: ownerSubstrateAddress,
  };
}
