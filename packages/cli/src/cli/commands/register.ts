import chalk from "chalk";
import { isAddress, type Address } from "viem";
import {
  classifyDomainName,
  ensureDomainNotRegistered,
  generateCommitment,
  submitCommitment,
  waitForMinimumCommitmentAge,
  getPriceAndValidateEligibility,
  finalizeRegularRegistration,
  finalizeGovernanceRegistration,
  registerSubnode,
  verifyDomainOwnership,
  displayDeployedStore,
  setUserProofOfPersonhoodStatus,
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
import { generateRandomLabel, parseProofOfPersonhoodStatus } from "../labels";
import { resolveTransferRecipient, transferDomain } from "../transfer";

export type TransferDestinationKind = "evm" | "substrate" | "label";

export type RegistrationPopStatusConfig =
  | { mode: "unchanged" }
  | { mode: "set"; status: ProofOfPersonhoodStatus };

export type RegisterActionOptions = RegistrationCommandOptions & {
  __statusProvided?: boolean;
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

export async function executeRegistration(options: Partial<RegisterActionOptions> = {}) {
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

  const context = await prepareAssetHubContext(options);
  const { clientWrapper, substrateAddress, signer, evmAddress } = context;

  const statusWasProvided = options.__statusProvided === true;

  const popStatusConfig: RegistrationPopStatusConfig = statusWasProvided
    ? { mode: "set", status: parseProofOfPersonhoodStatus(options.status ?? "none") }
    : { mode: "unchanged" };

  const label =
    options.name ??
    generateRandomLabel(
      popStatusConfig.mode === "set" ? popStatusConfig.status : ProofOfPersonhoodStatus.NoStatus,
    );

  console.log(
    chalk.gray("  Mode:      ") +
      chalk.yellow(options.governance ? "Governance registration" : "Regular registration"),
  );
  console.log(chalk.gray("  Label:     ") + chalk.cyan(label));
  console.log(chalk.gray("  Domain:    ") + chalk.cyan(label + ".dot"));
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
    );
  } else {
    await executeRegularRegistration(
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      label,
      popStatusConfig,
      options.reverse ?? false,
      transferDestination,
    );
  }

  console.log(`\n${chalk.bold.green("═══════════════════════════════════════")}`);
  console.log(`${chalk.bold.green("         ✓ Operation Complete          ")}`);
  console.log(`${chalk.bold.green("═══════════════════════════════════════")}\n`);
  console.log(chalk.gray("  Domain: ") + chalk.cyan(label + ".dot"));
}

export async function executeSubnameRegistration(
  options: Partial<RegisterActionOptions>,
): Promise<void> {
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
}

async function executeGovernanceRegistration(
  clientWrapper: any,
  substrateAddress: string,
  signer: any,
  evmAddress: Address,
  label: string,
  transferDestination: string | undefined,
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
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress),
  );

  await step("Finalizing registration", async () =>
    finalizeGovernanceRegistration(clientWrapper, substrateAddress, signer, registration),
  );

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress),
  );

  if (transferDestination) {
    const recipient = await step("Resolving recipient", async () =>
      resolveTransferRecipient(clientWrapper, substrateAddress, transferDestination),
    );

    await step("Transferring domain", async () =>
      transferDomain(clientWrapper, substrateAddress, signer, evmAddress, recipient, label),
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
  label: string,
  popStatusConfig: RegistrationPopStatusConfig,
  enableReverseRecord: boolean,
  transferDestination: string | undefined,
): Promise<void> {
  console.log(chalk.bold("\n🧾 Regular registration (commit-reveal)\n"));

  validateDomainLabel(label);

  const classification: NameClassification = await step("Classifying name", async () =>
    classifyDomainName(clientWrapper, substrateAddress, label),
  );

  if (popStatusConfig.mode === "set") {
    await step("Setting PoP status", async () =>
      setUserProofOfPersonhoodStatus(
        clientWrapper,
        substrateAddress,
        signer,
        evmAddress,
        label,
        popStatusConfig.status,
      ),
    );
  }

  await step("Checking availability", async () =>
    ensureDomainNotRegistered(clientWrapper, substrateAddress, label),
  );

  const { commitment, registration } = await step("Generating commitment", async () =>
    generateCommitment(clientWrapper, substrateAddress, label, evmAddress, enableReverseRecord),
  );

  await step("Submitting commitment", async () =>
    submitCommitment(clientWrapper, substrateAddress, signer, commitment),
  );

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress),
  );

  const pricing: PricingAndEligibility = await step("Pricing and eligibility", async () =>
    getPriceAndValidateEligibility(clientWrapper, substrateAddress, label, evmAddress),
  );

  await step("Finalizing registration", async () =>
    finalizeRegularRegistration(
      clientWrapper,
      substrateAddress,
      signer,
      registration,
      pricing.priceWei,
    ),
  );

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress),
  );

  await step("Displaying store", async () =>
    displayDeployedStore(clientWrapper, substrateAddress, evmAddress),
  );

  if (transferDestination) {
    const recipient = await step("Resolving recipient", async () =>
      resolveTransferRecipient(clientWrapper, substrateAddress, transferDestination),
    );

    await step("Transferring domain", async () =>
      transferDomain(clientWrapper, substrateAddress, signer, evmAddress, recipient, label),
    );

    await step("Verifying ownership", async () =>
      verifyDomainOwnership(clientWrapper, substrateAddress, label, recipient),
    );
  }

  void classification;
}
