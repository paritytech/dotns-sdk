import chalk from "chalk";
import { checksumAddress, isAddress, type Address } from "viem";
import {
  classifyDomainName,
  ensureDomainNotRegistered,
  generateCommitment,
  submitCommitment,
  waitForMinimumCommitmentAge,
  getPriceAndValidateEligibility,
  finalizeRegularRegistration,
  finalizeGovernanceRegistration,
  quoteCrossPayerFriction,
  registerSubnode,
  verifyDomainOwnership,
  ensureLabelStoreReady,
} from "../../commands/register";
import {
  isValidSubstrateAddress,
  validateDomainLabel,
  validateGovernanceLabel,
} from "../../utils/validation";
import {
  type NameClassification,
  type PricingAndEligibility,
  type RegistrationCommandOptions,
  ProofOfPersonhoodStatus,
} from "../../types/types";
import { step } from "../ui";
import { prepareAssetHubContext } from "../context";
import { generateRandomLabel } from "../labels";
import { resolveTransferRecipient, transferDomain } from "../transfer";

export type TransferDestinationKind = "evm" | "substrate" | "label";

export type RegisterActionOptions = RegistrationCommandOptions & {
  transfer?: boolean;
  to?: string;
  parent?: string;
};

function resolveTransferDestination(options: Partial<RegisterActionOptions>): string | undefined {
  const legacy = options.transferTo;
  const modern = options.to;

  const destination = legacy ?? modern;

  if (options.transfer === true && !destination) {
    throw new Error("Missing transfer destination: use --to <evm|ss58|label>");
  }

  if (options.transfer === false && legacy) {
    return legacy;
  }

  return destination;
}

export function classifyTransferDestination(destination: string): TransferDestinationKind {
  if (isAddress(destination)) return "evm";
  if (isValidSubstrateAddress(destination)) return "substrate";
  return "label";
}

export function isValidTransferDestination(destination: string): boolean {
  const kind = classifyTransferDestination(destination);
  if (kind === "evm" || kind === "substrate") return true;

  const domainLabelPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return (
    domainLabelPattern.test(destination) && destination.length >= 3 && destination.length <= 63
  );
}

export type DomainRegistrationResult = {
  ok: true;
  label: string;
  domain: string;
  caller: string;
  owner: string;
};

export type SubnameRegistrationResult = {
  ok: true;
  label: string;
  parent: string;
  domain: string;
  owner: string;
};

export async function executeRegistration(
  options: Partial<RegisterActionOptions> = {},
): Promise<DomainRegistrationResult | SubnameRegistrationResult> {
  if (options.mnemonic && options.keyUri) {
    throw new Error("Cannot specify both --mnemonic and --key-uri");
  }

  if (options.parent) {
    return executeSubnameRegistration(options);
  }

  const transferDestination = resolveTransferDestination(options);

  if (transferDestination && !isValidTransferDestination(transferDestination)) {
    throw new Error(
      "Invalid transfer destination: must be valid EVM address, Substrate address, or domain label",
    );
  }

  // Cross-payer registration: caller pays, --owner receives the NFT.
  // Conflicts with --owner (rejected up-front before credentials are required):
  //  - --transfer/--to is redundant when --owner already names the final holder.
  //  - --reverse cannot be honoured: register() sets reverse only when
  //    `registration.reserved && isDirect`, so cross-payer regular registration
  //    would silently no-op.
  //  - --governance routes through registerReserved (whitelist-gated, price=0);
  //    the CLI does not model the operator-pays-for-third-party case there.
  if (options.owner != null) {
    if (transferDestination) {
      throw new Error("Cannot combine --owner with --transfer/--to; pick one");
    }
    if (options.reverse === true) {
      throw new Error("Cannot combine --owner with --reverse; reverse record requires self-mint");
    }
    if (options.governance === true) {
      throw new Error("Cannot combine --owner with --governance");
    }
  }

  const context = await prepareAssetHubContext(options);
  const { clientWrapper, substrateAddress, signer, evmAddress } = context;

  const label = options.name ?? generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

  let ownerEvmAddress: Address = evmAddress;
  if (options.owner != null) {
    ownerEvmAddress = await step("Resolving owner", async () =>
      resolveTransferRecipient(clientWrapper, substrateAddress, options.owner as string),
    );
  }

  const crossPayer = checksumAddress(ownerEvmAddress) !== checksumAddress(evmAddress);

  console.log(
    chalk.gray("  Mode:      ") +
      chalk.yellow(options.governance ? "Governance registration" : "Regular registration"),
  );
  console.log(chalk.gray("  Label:     ") + chalk.cyan(label));
  console.log(chalk.gray("  Domain:    ") + chalk.cyan(label + ".dot"));
  console.log(chalk.gray("  Caller:    ") + chalk.white(evmAddress));
  console.log(chalk.gray("  Owner:     ") + chalk.white(ownerEvmAddress));
  if (crossPayer) {
    console.log(
      chalk.gray("  Note:      ") +
        chalk.yellow("caller pays price + transferFloor friction; owner receives the name"),
    );
  }
  console.log(
    chalk.gray("  Transfer:  ") +
      (transferDestination ? chalk.green("post-mint") : chalk.gray("none")),
  );

  await step("Ensuring account mapped", async () =>
    clientWrapper.ensureAccountMapped(substrateAddress, signer),
  );

  if (options.governance) {
    await executeGovernanceRegistration(
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      label,
      transferDestination,
      options.commitmentBuffer,
      context.nativeTokenDecimals,
    );
  } else {
    await executeRegularRegistration(
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      ownerEvmAddress,
      label,
      context.nativeTokenDecimals,
      options.reverse ?? false,
      transferDestination,
      options.commitmentBuffer,
    );
  }

  console.log(`\n${chalk.bold.green("═══════════════════════════════════════")}`);
  console.log(`${chalk.bold.green("         ✓ Operation Complete          ")}`);
  console.log(`${chalk.bold.green("═══════════════════════════════════════")}\n`);
  console.log(chalk.gray("  Domain: ") + chalk.cyan(label + ".dot"));

  return {
    ok: true as const,
    label,
    domain: `${label}.dot`,
    caller: evmAddress,
    owner: ownerEvmAddress,
  };
}

export async function executeSubnameRegistration(
  options: Partial<RegisterActionOptions>,
): Promise<SubnameRegistrationResult> {
  if (!options.name) {
    throw new Error("Missing subname: use --name <sublabel>");
  }

  if (!options.parent) {
    throw new Error("Missing parent: use --parent <parentlabel>");
  }

  const context = await prepareAssetHubContext(options);
  const { clientWrapper, substrateAddress, signer, evmAddress } = context;

  const sublabel = options.name;
  const parentLabel = options.parent;
  const ownerAddress = (options.owner as Address) ?? evmAddress;

  const fullName = `${sublabel}.${parentLabel}.dot`;

  console.log(chalk.bold("\n▶ Subname Registration\n"));
  console.log(chalk.gray("  Subname:   ") + chalk.cyan(fullName));
  console.log(chalk.gray("  Parent:    ") + chalk.white(`${parentLabel}.dot`));
  console.log(chalk.gray("  Owner:     ") + chalk.white(ownerAddress));

  await step("Ensuring account mapped", async () =>
    clientWrapper.ensureAccountMapped(substrateAddress, signer),
  );

  await registerSubnode(
    clientWrapper,
    substrateAddress,
    signer,
    sublabel,
    parentLabel,
    ownerAddress,
  );

  console.log(`\n${chalk.bold.green("═══════════════════════════════════════")}`);
  console.log(`${chalk.bold.green("         ✓ Subname Registered          ")}`);
  console.log(`${chalk.bold.green("═══════════════════════════════════════")}\n`);
  console.log(chalk.gray("  Domain: ") + chalk.cyan(fullName));

  return {
    ok: true as const,
    label: sublabel,
    parent: parentLabel,
    domain: fullName,
    owner: ownerAddress,
  };
}

async function executeGovernanceRegistration(
  clientWrapper: any,
  substrateAddress: string,
  signer: any,
  evmAddress: Address,
  label: string,
  transferDestination: string | undefined,
  commitmentBuffer?: number,
  nativeTokenDecimals?: number,
): Promise<void> {
  console.log(chalk.bold("\n🏛 Governance registration (commit-reveal)\n"));

  validateGovernanceLabel(label);

  const classification = await step("Classifying name", async () =>
    classifyDomainName(clientWrapper, substrateAddress, label),
  );

  if (classification.requiredStatus !== ProofOfPersonhoodStatus.Reserved) {
    throw new Error(
      `Governance name must classify as Reserved; got ${ProofOfPersonhoodStatus[classification.requiredStatus]}`,
    );
  }

  await step("Checking availability", async () =>
    ensureDomainNotRegistered(clientWrapper, substrateAddress, label),
  );

  const { commitment, registration } = await step("Generating commitment", async () =>
    generateCommitment(clientWrapper, substrateAddress, label, evmAddress, true),
  );

  await step("Submitting commitment", async () =>
    submitCommitment(clientWrapper, substrateAddress, signer, commitment),
  );

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress, commitment, commitmentBuffer),
  );

  await step("Finalizing registration", async () =>
    finalizeGovernanceRegistration(clientWrapper, substrateAddress, signer, registration),
  );

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress),
  );

  await step("Ensuring label store", async () =>
    ensureLabelStoreReady(clientWrapper, substrateAddress, signer, evmAddress),
  );

  if (transferDestination) {
    const recipient = await step("Resolving recipient", async () =>
      resolveTransferRecipient(clientWrapper, substrateAddress, transferDestination),
    );

    await step("Transferring domain", async () =>
      transferDomain(
        clientWrapper,
        substrateAddress,
        signer,
        evmAddress,
        recipient,
        label,
        nativeTokenDecimals,
      ),
    );

    await step("Verifying ownership", async () =>
      verifyDomainOwnership(clientWrapper, substrateAddress, label, recipient),
    );
  }
}

async function executeRegularRegistration(
  clientWrapper: any,
  substrateAddress: string,
  signer: any,
  evmAddress: Address,
  ownerEvmAddress: Address,
  label: string,
  nativeTokenDecimals: number,
  enableReverseRecord: boolean,
  transferDestination: string | undefined,
  commitmentBuffer?: number,
): Promise<void> {
  console.log(chalk.bold("\n🧾 Regular registration (commit-reveal)\n"));

  validateDomainLabel(label);

  const isCrossPayer = checksumAddress(ownerEvmAddress) !== checksumAddress(evmAddress);

  const classification: NameClassification = await step("Classifying name", async () =>
    classifyDomainName(clientWrapper, substrateAddress, label),
  );

  await step("Checking availability", async () =>
    ensureDomainNotRegistered(clientWrapper, substrateAddress, label),
  );

  const { commitment, registration } = await step("Generating commitment", async () =>
    generateCommitment(
      clientWrapper,
      substrateAddress,
      label,
      ownerEvmAddress,
      enableReverseRecord,
    ),
  );

  await step("Submitting commitment", async () =>
    submitCommitment(clientWrapper, substrateAddress, signer, commitment),
  );

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress, commitment, commitmentBuffer),
  );

  const pricing: PricingAndEligibility = await step("Pricing and eligibility", async () =>
    getPriceAndValidateEligibility(clientWrapper, substrateAddress, label, ownerEvmAddress),
  );

  const frictionWei: bigint = isCrossPayer
    ? await step("Quoting cross-payer friction", async () =>
        quoteCrossPayerFriction(
          clientWrapper,
          substrateAddress,
          label,
          evmAddress,
          ownerEvmAddress,
        ),
      )
    : 0n;

  await step("Finalizing registration", async () =>
    finalizeRegularRegistration(
      clientWrapper,
      substrateAddress,
      signer,
      registration,
      pricing.priceWei,
      nativeTokenDecimals,
      frictionWei,
    ),
  );

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, ownerEvmAddress),
  );

  if (!isCrossPayer) {
    await step("Ensuring label store", async () =>
      ensureLabelStoreReady(clientWrapper, substrateAddress, signer, evmAddress),
    );
  }

  if (transferDestination) {
    const recipient = await step("Resolving recipient", async () =>
      resolveTransferRecipient(clientWrapper, substrateAddress, transferDestination),
    );

    await step("Transferring domain", async () =>
      transferDomain(
        clientWrapper,
        substrateAddress,
        signer,
        evmAddress,
        recipient,
        label,
        nativeTokenDecimals,
      ),
    );

    await step("Verifying ownership", async () =>
      verifyDomainOwnership(clientWrapper, substrateAddress, label, recipient),
    );
  }

  void classification;
}
