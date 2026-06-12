import chalk from "chalk";
import { checksumAddress, isAddress, type Address, type Hex } from "viem";
import { formatErrorMessage } from "../../utils/formatting";
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
  readCommitmentStatus,
  readDomainOwner,
} from "../../commands/register";
import {
  saveCommitmentRecord,
  loadCommitmentRecords,
  findCommitmentRecord,
  latestCommitmentRecord,
  loadCommitmentRecordsForClear,
  deleteCommitmentRecord,
  decryptCommitmentSecret,
  resolveManifestCredential,
  type CommitmentRecord,
} from "../../commands/registrationManifest";
import {
  isValidSubstrateAddress,
  validateCanonicalLabel,
  validateDomainLabel,
  validateGovernanceLabel,
} from "../../utils/validation";
import {
  type DomainRegistration,
  type NameClassification,
  type PricingAndEligibility,
  type RegistrationCommandOptions,
  ProofOfPersonhoodStatus,
} from "../../types/types";
import { step } from "../ui";
import { prepareAssetHubContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { generateRandomLabel } from "../labels";
import { resolveTransferRecipient, transferDomain } from "../transfer";

type PersistContext = {
  env: string;
  caller: Address;
  credential: string;
};

function requireEnvironment(environment: string | undefined): string {
  if (!environment) {
    throw new Error("Could not resolve the DotNS environment for this command.");
  }
  return environment;
}

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

async function registerWithRetries(params: {
  attempt: () => Promise<void>;
  context: Awaited<ReturnType<typeof prepareAssetHubContext>>;
  persistContext: PersistContext;
  label: string;
  retries: number;
  commitmentBuffer?: number;
}): Promise<void> {
  try {
    await params.attempt();
    return;
  } catch (error) {
    if (params.retries <= 0) throw error;

    const { env, caller, credential } = params.persistContext;
    let lastError: unknown = error;

    for (let attempt = 1; attempt <= params.retries; attempt++) {
      console.log(
        chalk.yellow(
          `\n↻ Registration failed: ${formatErrorMessage(lastError)}` +
            `\n  Retry ${attempt}/${params.retries} (resuming from commitment)…`,
        ),
      );
      try {
        const record = findCommitmentRecord(env, caller, params.label);
        if (record) {
          await resumeRegistration(params.context, record, credential, params.commitmentBuffer);
        } else {
          await params.attempt();
        }
        return;
      } catch (retryError) {
        lastError = retryError;
      }
    }

    throw lastError;
  }
}

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

  const credential = context.auth.credential ?? resolveManifestCredential(options);
  if (!credential) {
    throw new Error("Could not resolve a credential for the registration retry cache.");
  }
  const persistContext: PersistContext = {
    env: requireEnvironment(context.environment),
    caller: evmAddress as Address,
    credential,
  };

  const attemptRegistration = (): Promise<void> =>
    options.governance
      ? executeGovernanceRegistration(
          clientWrapper,
          substrateAddress,
          signer,
          evmAddress,
          label,
          transferDestination,
          persistContext,
          options.commitmentBuffer,
          context.nativeTokenDecimals,
        )
      : executeRegularRegistration(
          clientWrapper,
          substrateAddress,
          signer,
          evmAddress,
          ownerEvmAddress,
          label,
          context.nativeTokenDecimals,
          options.reverse ?? false,
          transferDestination,
          persistContext,
          options.commitmentBuffer,
        );

  await registerWithRetries({
    attempt: attemptRegistration,
    context,
    persistContext,
    label,
    retries: options.retry ?? 0,
    commitmentBuffer: options.commitmentBuffer,
  });

  printCompletionBanner("✓ Operation Complete", `${label}.dot`);

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
  validateCanonicalLabel(sublabel, "subname");
  validateCanonicalLabel(parentLabel, "parent label");
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

  printCompletionBanner("✓ Subname Registered", fullName);

  return {
    ok: true as const,
    label: sublabel,
    parent: parentLabel,
    domain: fullName,
    owner: ownerAddress,
  };
}

function persistCommitment(
  persistContext: PersistContext,
  params: {
    label: string;
    owner: Address;
    reserved: boolean;
    governance: boolean;
    secret: Hex;
    commitmentHash: Hex;
    transferDestination?: string;
  },
): void {
  try {
    saveCommitmentRecord({
      env: persistContext.env,
      caller: persistContext.caller,
      label: params.label,
      owner: params.owner,
      reserved: params.reserved,
      governance: params.governance,
      secret: params.secret,
      commitmentHash: params.commitmentHash,
      committedAtIso: new Date().toISOString(),
      transferDestination: params.transferDestination,
      credential: persistContext.credential,
    });
  } catch (error) {
    console.warn(chalk.yellow(`  ⚠ Could not cache commitment: ${formatErrorMessage(error)}`));
  }
}

function forgetCommitment(persistContext: PersistContext, label: string): void {
  try {
    deleteCommitmentRecord(persistContext.env, persistContext.caller, label);
  } catch (error) {
    console.warn(
      chalk.yellow(`  ⚠ Could not clear cached commitment: ${formatErrorMessage(error)}`),
    );
  }
}

const BANNER_RULE = "═══════════════════════════════════════";

/** Centre a title within the banner rule width for the completion box. */
function centerInBanner(title: string): string {
  const width = BANNER_RULE.length;
  if (title.length >= width) return title;
  const left = Math.floor((width - title.length) / 2);
  return title.padStart(title.length + left).padEnd(width);
}

function printCompletionBanner(title: string, domain: string): void {
  console.log(`\n${chalk.bold.green(BANNER_RULE)}`);
  console.log(chalk.bold.green(centerInBanner(title)));
  console.log(`${chalk.bold.green(BANNER_RULE)}\n`);
  console.log(chalk.gray("  Domain: ") + chalk.cyan(domain));
}

/** Resolve the recipient, transfer the freshly minted name, and verify the move. */
async function replayTransfer(params: {
  clientWrapper: any;
  substrateAddress: string;
  signer: any;
  evmAddress: Address;
  label: string;
  transferDestination: string;
  nativeTokenDecimals?: number;
}): Promise<void> {
  const recipient = await step("Resolving recipient", async () =>
    resolveTransferRecipient(
      params.clientWrapper,
      params.substrateAddress,
      params.transferDestination,
    ),
  );

  await step("Transferring domain", async () =>
    transferDomain(
      params.clientWrapper,
      params.substrateAddress,
      params.signer,
      params.evmAddress,
      recipient,
      params.label,
      params.nativeTokenDecimals,
    ),
  );

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(params.clientWrapper, params.substrateAddress, params.label, recipient),
  );
}

/** Price, quote cross-payer friction when needed, and submit the regular reveal. */
async function finalizeRegularReveal(params: {
  clientWrapper: any;
  substrateAddress: string;
  signer: any;
  evmAddress: Address;
  ownerEvmAddress: Address;
  label: string;
  registration: DomainRegistration;
  nativeTokenDecimals: number;
}): Promise<void> {
  const isCrossPayer =
    checksumAddress(params.ownerEvmAddress) !== checksumAddress(params.evmAddress);

  const pricing: PricingAndEligibility = await step("Pricing and eligibility", async () =>
    getPriceAndValidateEligibility(
      params.clientWrapper,
      params.substrateAddress,
      params.label,
      params.ownerEvmAddress,
      params.evmAddress,
    ),
  );

  const frictionWei: bigint = isCrossPayer
    ? await step("Quoting cross-payer friction", async () =>
        quoteCrossPayerFriction(
          params.clientWrapper,
          params.substrateAddress,
          params.label,
          params.evmAddress,
          params.ownerEvmAddress,
        ),
      )
    : 0n;

  await step("Finalizing registration", async () =>
    finalizeRegularRegistration(
      params.clientWrapper,
      params.substrateAddress,
      params.signer,
      params.registration,
      pricing.priceWei,
      params.nativeTokenDecimals,
      frictionWei,
    ),
  );
}

async function executeGovernanceRegistration(
  clientWrapper: any,
  substrateAddress: string,
  signer: any,
  evmAddress: Address,
  label: string,
  transferDestination: string | undefined,
  persistContext: PersistContext,
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

  persistCommitment(persistContext, {
    label,
    owner: evmAddress,
    reserved: true,
    governance: true,
    secret: registration.secret,
    commitmentHash: commitment,
    transferDestination,
  });

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress, commitment, commitmentBuffer),
  );

  await step("Finalizing registration", async () =>
    finalizeGovernanceRegistration(clientWrapper, substrateAddress, signer, registration),
  );

  forgetCommitment(persistContext, label);

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress),
  );

  await step("Ensuring label store", async () =>
    ensureLabelStoreReady(clientWrapper, substrateAddress, signer, evmAddress),
  );

  if (transferDestination) {
    await replayTransfer({
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      label,
      transferDestination,
      nativeTokenDecimals,
    });
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
  persistContext: PersistContext,
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

  persistCommitment(persistContext, {
    label,
    owner: ownerEvmAddress,
    reserved: enableReverseRecord,
    governance: false,
    secret: registration.secret,
    commitmentHash: commitment,
    transferDestination,
  });

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(clientWrapper, substrateAddress, commitment, commitmentBuffer),
  );

  await finalizeRegularReveal({
    clientWrapper,
    substrateAddress,
    signer,
    evmAddress,
    ownerEvmAddress,
    label,
    registration,
    nativeTokenDecimals,
  });

  forgetCommitment(persistContext, label);

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, ownerEvmAddress),
  );

  if (!isCrossPayer) {
    await step("Ensuring label store", async () =>
      ensureLabelStoreReady(clientWrapper, substrateAddress, signer, evmAddress),
    );
  }

  if (transferDestination) {
    await replayTransfer({
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      label,
      transferDestination,
      nativeTokenDecimals,
    });
  }

  void classification;
}

async function isRegisteredTo(
  clientWrapper: any,
  substrateAddress: string,
  label: string,
  owner: Address,
): Promise<boolean> {
  const actual = await readDomainOwner(clientWrapper, substrateAddress, label);
  return checksumAddress(actual) === checksumAddress(owner);
}

export async function resumeRegistration(
  context: Awaited<ReturnType<typeof prepareAssetHubContext>>,
  record: CommitmentRecord,
  credential: string,
  commitmentBuffer?: number,
): Promise<DomainRegistrationResult> {
  const { clientWrapper, substrateAddress, signer, evmAddress, nativeTokenDecimals } = context;
  const { label } = record;
  const persistContext: PersistContext = {
    env: requireEnvironment(context.environment),
    caller: evmAddress as Address,
    credential,
  };

  console.log(chalk.bold(`\n▶ Resuming ${chalk.cyan(label + ".dot")}\n`));

  const registration: DomainRegistration = {
    label,
    owner: record.owner,
    secret: decryptCommitmentSecret(record, credential),
    reserved: record.reserved,
  };

  const alreadyOwned = await step("Checking on-chain ownership", async () =>
    isRegisteredTo(clientWrapper, substrateAddress, label, record.owner),
  );

  if (alreadyOwned) {
    console.log(chalk.green(`  ✓ ${label}.dot is already registered to ${record.owner}`));
    forgetCommitment(persistContext, label);
    return {
      ok: true as const,
      label,
      domain: `${label}.dot`,
      caller: evmAddress,
      owner: record.owner,
    };
  }

  const status = await step("Reading commitment status", async () =>
    readCommitmentStatus(clientWrapper, substrateAddress, record.commitmentHash),
  );

  const commitmentAge = status.nowSeconds - status.committedTimestampSeconds;
  const needsRecommit =
    status.committedTimestampSeconds === 0 || commitmentAge > status.maxAgeSeconds;

  if (needsRecommit) {
    await step("Re-submitting commitment", async () =>
      submitCommitment(clientWrapper, substrateAddress, signer, record.commitmentHash),
    );
  }

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(
      clientWrapper,
      substrateAddress,
      record.commitmentHash,
      commitmentBuffer,
    ),
  );

  if (record.governance) {
    await step("Finalizing registration", async () =>
      finalizeGovernanceRegistration(clientWrapper, substrateAddress, signer, registration),
    );
  } else {
    await finalizeRegularReveal({
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      ownerEvmAddress: record.owner,
      label,
      registration,
      nativeTokenDecimals,
    });
  }

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(clientWrapper, substrateAddress, label, record.owner),
  );

  forgetCommitment(persistContext, label);

  if (record.transferDestination) {
    await replayTransfer({
      clientWrapper,
      substrateAddress,
      signer,
      evmAddress,
      label,
      transferDestination: record.transferDestination,
      nativeTokenDecimals,
    });
  }

  printCompletionBanner("✓ Registration Resumed", `${label}.dot`);

  return {
    ok: true as const,
    label,
    domain: `${label}.dot`,
    caller: evmAddress,
    owner: record.owner,
  };
}

function requireManifestCredential(
  context: Awaited<ReturnType<typeof prepareAssetHubContext>>,
  options: Partial<RegisterActionOptions>,
): string {
  const credential = context.auth.credential ?? resolveManifestCredential(options);
  if (!credential) {
    throw new Error(
      "A credential is required to decrypt the cached commitment: pass --password, --mnemonic, or --key-uri.",
    );
  }
  return credential;
}

export async function executeRetry(
  options: Partial<RegisterActionOptions> = {},
): Promise<DomainRegistrationResult> {
  const context = await prepareAssetHubContext(options);
  const credential = requireManifestCredential(context, options);
  const caller = context.evmAddress as Address;
  const env = requireEnvironment(context.environment);

  const record = options.name
    ? findCommitmentRecord(env, caller, options.name)
    : latestCommitmentRecord(env, caller);

  if (!record) {
    throw new Error("No cached commitment to retry.");
  }

  return resumeRegistration(context, record, credential, options.commitmentBuffer);
}

export type ClearSummary = {
  ok: true;
  purged: string[];
  discarded: string[];
  resumed: string[];
  cancelled: boolean;
};

async function promptPendingAction(
  pending: CommitmentRecord[],
): Promise<"register" | "discard" | "cancel"> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.bold("\n▶ Pending commitments\n"));
  for (const record of pending) {
    console.log(
      chalk.gray("  • ") +
        chalk.cyan(record.label + ".dot") +
        chalk.gray(`  committed ${record.committedAtIso}`),
    );
  }

  try {
    const answer = (
      await rl.question(chalk.bold("\nregister / discard / cancel (default cancel): "))
    )
      .trim()
      .toLowerCase();
    if (answer === "register" || answer === "r") return "register";
    if (answer === "discard" || answer === "d") return "discard";
    return "cancel";
  } finally {
    rl.close();
  }
}

export async function executeClear(
  options: Partial<RegisterActionOptions> & { discard?: boolean; register?: boolean } = {},
): Promise<ClearSummary> {
  const context = await prepareAssetHubContext(options);
  const { clientWrapper, substrateAddress } = context;
  const caller = context.evmAddress as Address;
  const env = requireEnvironment(context.environment);

  const records = loadCommitmentRecordsForClear(env, caller, options.name);

  const summary: ClearSummary = {
    ok: true as const,
    purged: [],
    discarded: [],
    resumed: [],
    cancelled: false,
  };

  const pending: CommitmentRecord[] = [];
  for (const record of records) {
    const registered = await step(`Checking ${record.label}.dot`, async () =>
      isRegisteredTo(clientWrapper, substrateAddress, record.label, record.owner),
    );
    if (registered) {
      deleteCommitmentRecord(env, caller, record.label);
      summary.purged.push(record.label);
    } else {
      pending.push(record);
    }
  }

  if (summary.purged.length > 0) {
    console.log(chalk.green(`  ✓ Purged ${summary.purged.length} completed`));
  }

  if (pending.length === 0) {
    return summary;
  }

  let action: "register" | "discard" | "cancel";
  if (options.discard) {
    action = "discard";
  } else if (options.register) {
    action = "register";
  } else if (process.stdin.isTTY) {
    action = await promptPendingAction(pending);
  } else {
    throw new Error(
      `${pending.length} pending commitment(s) found. Pass --discard to delete them or --register to complete them.`,
    );
  }

  if (action === "cancel") {
    summary.cancelled = true;
    return summary;
  }

  if (action === "discard") {
    for (const record of pending) {
      deleteCommitmentRecord(env, caller, record.label);
      summary.discarded.push(record.label);
    }
    return summary;
  }

  const credential = requireManifestCredential(context, options);
  for (const record of pending) {
    await resumeRegistration(context, record, credential, options.commitmentBuffer);
    summary.resumed.push(record.label);
  }

  return summary;
}

export type CommitmentRow = {
  label: string;
  status: "registered" | "pending";
  committedAtIso: string;
  env: string;
};

export type ListSummary = {
  ok: true;
  records: CommitmentRow[];
};

export async function executeList(
  options: Partial<RegisterActionOptions> & { json?: boolean } = {},
): Promise<ListSummary> {
  const context = await prepareReadOnlyContext(options);
  const { clientWrapper } = context;
  const caller = context.evmAddress as Address;
  const env = requireEnvironment(context.environment);

  const records = loadCommitmentRecords(env, caller);

  const rows: CommitmentRow[] = [];
  for (const record of records) {
    const registered = await isRegisteredTo(
      clientWrapper,
      context.account.address,
      record.label,
      record.owner,
    );
    rows.push({
      label: record.label,
      status: registered ? "registered" : "pending",
      committedAtIso: record.committedAtIso,
      env: record.env,
    });
  }

  if (!options.json) {
    if (rows.length === 0) {
      console.log(chalk.gray("\n  No cached commitments.\n"));
    } else {
      console.log(chalk.bold("\n▶ Cached commitments\n"));
      for (const row of rows) {
        const statusLabel =
          row.status === "registered" ? chalk.green("registered") : chalk.yellow("pending");
        console.log(
          chalk.gray("  • ") +
            chalk.cyan((row.label + ".dot").padEnd(24)) +
            statusLabel +
            chalk.gray(`  ${row.committedAtIso}  ${row.env}`),
        );
      }
      console.log();
    }
  }

  return { ok: true as const, records: rows };
}
