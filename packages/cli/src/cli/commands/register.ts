import chalk from "chalk";
import ora from "ora";
import { checksumAddress, isAddress, type Address, type Hex } from "viem";
import { formatErrorMessage, formatWeiAsEther } from "../../utils/formatting";
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
  type RegistrationResult,
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
  type RegistrationCommandOptions,
  ProofOfPersonhoodStatus,
} from "../../types/types";
import { step, printCommandHeader } from "../ui";
import { buildDotnsContext, prepareAssetHubContext } from "../context";
import { makeOnStatus } from "../txStatus";
import type { DotnsContext } from "../../core/context";
import { prepareReadOnlyContext } from "./lookup";
import { generateRandomLabel } from "../labels";
import { resolveTransferRecipient, transferName } from "../transfer";

type PersistContext = {
  env: string;
  caller: Address;
  credential: string;
};

// Caller plus the core operation context, built once per command and threaded
// through the commit-reveal sequence so every signed write shares one origin.
type RegistrationSession = {
  ctx: DotnsContext;
  caller: Address;
  nativeTokenDecimals: number;
};

function requireEnvironment(environment: string | undefined): string {
  if (!environment) {
    throw new Error("Could not resolve the DotNS environment for this command.");
  }
  return environment;
}

function buildSession(
  context: Awaited<ReturnType<typeof prepareAssetHubContext>>,
  operationName: string,
): RegistrationSession {
  const spinner = ora();
  return {
    ctx: buildDotnsContext(context as any, { onStatus: makeOnStatus(spinner, operationName) }),
    caller: context.evmAddress as Address,
    nativeTokenDecimals: context.nativeTokenDecimals,
  };
}

function redactSecret(secret: Hex): string {
  if (secret.length <= 10) return "0x" + "*".repeat(secret.length - 2);
  return `${secret.slice(0, 6)}${"*".repeat(secret.length - 10)}${secret.slice(-4)}`;
}

function printRegistrationResult(result: RegistrationResult): void {
  console.log(
    chalk.gray("  cost:      ") + chalk.green(formatWeiAsEther(result.priceWei) + " PAS"),
  );
  if (result.frictionWei > 0n) {
    console.log(
      chalk.gray("  friction:  ") + chalk.yellow(formatWeiAsEther(result.frictionWei) + " PAS"),
    );
  }
  console.log(chalk.gray("  tx:        ") + chalk.blue(result.txHash));
  console.log(
    chalk.gray("  note:      ") + chalk.gray(`sent ${formatWeiAsEther(result.bufferedWei)} PAS`),
  );
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

type DomainRegistrationResult = {
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
  const { evmAddress } = context;
  const session = buildSession(context, "Register");

  const label = options.name ?? generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

  let ownerEvmAddress: Address = evmAddress;
  if (options.owner != null) {
    ownerEvmAddress = await step("Resolving owner", async () =>
      resolveTransferRecipient(session.ctx, options.owner as string),
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
          session,
          label,
          transferDestination,
          persistContext,
          options.commitmentBuffer,
        )
      : executeRegularRegistration(
          session,
          ownerEvmAddress,
          label,
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

  console.log(chalk.bold.green("✓ Operation Complete") + chalk.gray(` ${label}.dot`));

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
  const { evmAddress } = context;
  const session = buildSession(context, "Subname");

  const sublabel = options.name;
  const parentLabel = options.parent;
  validateCanonicalLabel(sublabel, "subname");
  validateCanonicalLabel(parentLabel, "parent label");
  const ownerAddress = (options.owner as Address) ?? evmAddress;

  const fullName = `${sublabel}.${parentLabel}.dot`;

  printCommandHeader("Subname Registration");
  console.log(chalk.gray("  Subname:   ") + chalk.cyan(fullName));
  console.log(chalk.gray("  Parent:    ") + chalk.white(`${parentLabel}.dot`));
  console.log(chalk.gray("  Owner:     ") + chalk.white(ownerAddress));

  const result = await step("Registering subname", async () =>
    registerSubnode(session.ctx, sublabel, parentLabel, ownerAddress),
  );
  console.log(chalk.gray("  tx:        ") + chalk.blue(result.txHash));

  console.log(chalk.bold.green("✓ Subname Registered") + chalk.gray(` ${fullName}`));

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

/** Print the eligibility and price summary the core pricing read returns. */
function printPricing(
  pricing: {
    requiredStatus: ProofOfPersonhoodStatus;
    userStatus: ProofOfPersonhoodStatus;
    message: string;
    priceWei: bigint;
  },
  owner: Address,
  registeringForOther: boolean,
): void {
  console.log(
    chalk.gray("  name tier:  ") + chalk.white(ProofOfPersonhoodStatus[pricing.requiredStatus]),
  );
  if (registeringForOther) {
    console.log(chalk.gray("  owner:      ") + chalk.white(owner));
    console.log(
      chalk.gray("  owner tier: ") + chalk.white(ProofOfPersonhoodStatus[pricing.userStatus]),
    );
  } else {
    console.log(
      chalk.gray("  your tier:  ") + chalk.white(ProofOfPersonhoodStatus[pricing.userStatus]),
    );
  }
  console.log(chalk.gray("  message:    ") + chalk.white(pricing.message));
  console.log(
    chalk.gray("  price:      ") + chalk.green(`${formatWeiAsEther(pricing.priceWei)} PAS`),
  );
}

/** Resolve the recipient, transfer the freshly minted name, and verify the move. */
async function replayTransfer(
  session: RegistrationSession,
  label: string,
  destination: string,
): Promise<void> {
  const recipient = await step("Resolving recipient", async () =>
    resolveTransferRecipient(session.ctx, destination),
  );

  // syncLabel is a CLI-only migration helper; enable it here so freshly minted
  // names stay registrar-synced, while host-injected signers never trigger it.
  const result = await step("Transferring domain", async () =>
    transferName(session.ctx, label, recipient, { syncLabel: true }),
  );
  console.log(chalk.gray("  tx:   ") + chalk.blue(result.txHash));
  console.log(chalk.gray("  from: ") + chalk.yellow(result.from));
  console.log(chalk.gray("  to:   ") + chalk.green(result.to));
  if (result.feeWei > 0n) {
    console.log(chalk.gray("  fee:  ") + chalk.green(formatWeiAsEther(result.feeWei) + " PAS"));
  }

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(session.ctx, label, recipient),
  );
}

/** Price, quote cross-payer friction when needed, and submit the regular reveal. */
async function finalizeRegularReveal(
  session: RegistrationSession,
  ownerEvmAddress: Address,
  label: string,
  registration: DomainRegistration,
): Promise<void> {
  const isCrossPayer = checksumAddress(ownerEvmAddress) !== checksumAddress(session.caller);

  const pricing = await step("Pricing and eligibility", async () =>
    getPriceAndValidateEligibility(session.ctx, label, ownerEvmAddress),
  );
  printPricing(pricing, ownerEvmAddress, isCrossPayer);

  const frictionWei: bigint = isCrossPayer
    ? await step("Quoting cross-payer friction", async () =>
        quoteCrossPayerFriction(session.ctx, label, session.caller, ownerEvmAddress),
      )
    : 0n;

  const result = await step("Finalizing registration", async () =>
    finalizeRegularRegistration(session.ctx, registration, pricing.priceWei, frictionWei),
  );
  printRegistrationResult(result);
}

async function executeGovernanceRegistration(
  session: RegistrationSession,
  label: string,
  transferDestination: string | undefined,
  persistContext: PersistContext,
  commitmentBuffer?: number,
): Promise<void> {
  console.log(chalk.bold("\n🏛 Governance registration (commit-reveal)\n"));

  validateGovernanceLabel(label);

  const classification = await step("Classifying name", async () =>
    classifyDomainName(session.ctx, label),
  );

  if (classification.requiredStatus !== ProofOfPersonhoodStatus.Reserved) {
    throw new Error(
      `Governance name must classify as Reserved; got ${ProofOfPersonhoodStatus[classification.requiredStatus]}`,
    );
  }

  await step("Checking availability", async () => ensureDomainNotRegistered(session.ctx, label));

  const { commitment, registration, secret } = await step("Generating commitment", async () =>
    generateCommitment(session.ctx, label, { owner: session.caller, includeReverse: true }),
  );
  console.log(chalk.gray("  commitment: ") + chalk.blue(commitment));
  console.log(chalk.gray("  secret:     ") + chalk.yellow(redactSecret(secret)));

  await step("Submitting commitment", async () => submitCommitment(session.ctx, commitment));

  persistCommitment(persistContext, {
    label,
    owner: session.caller,
    reserved: true,
    governance: true,
    secret,
    commitmentHash: commitment,
    transferDestination,
  });

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(session.ctx, commitment, { commitmentBuffer }),
  );

  const result = await step("Finalizing registration", async () =>
    finalizeGovernanceRegistration(session.ctx, registration),
  );
  console.log(chalk.gray("  tx:        ") + chalk.blue(result.txHash));

  forgetCommitment(persistContext, label);

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(session.ctx, label, session.caller),
  );

  await step("Ensuring label store", async () =>
    ensureLabelStoreReady(session.ctx, session.caller),
  );

  if (transferDestination) {
    await replayTransfer(session, label, transferDestination);
  }
}

async function executeRegularRegistration(
  session: RegistrationSession,
  ownerEvmAddress: Address,
  label: string,
  enableReverseRecord: boolean,
  transferDestination: string | undefined,
  persistContext: PersistContext,
  commitmentBuffer?: number,
): Promise<void> {
  console.log(chalk.bold("\n🧾 Regular registration (commit-reveal)\n"));

  validateDomainLabel(label);

  const isCrossPayer = checksumAddress(ownerEvmAddress) !== checksumAddress(session.caller);

  await step("Classifying name", async () => classifyDomainName(session.ctx, label));

  await step("Checking availability", async () => ensureDomainNotRegistered(session.ctx, label));

  const { commitment, registration, secret } = await step("Generating commitment", async () =>
    generateCommitment(session.ctx, label, {
      owner: ownerEvmAddress,
      includeReverse: enableReverseRecord,
    }),
  );
  console.log(chalk.gray("  commitment: ") + chalk.blue(commitment));
  console.log(chalk.gray("  secret:     ") + chalk.yellow(redactSecret(secret)));

  await step("Submitting commitment", async () => submitCommitment(session.ctx, commitment));

  persistCommitment(persistContext, {
    label,
    owner: ownerEvmAddress,
    reserved: enableReverseRecord,
    governance: false,
    secret,
    commitmentHash: commitment,
    transferDestination,
  });

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(session.ctx, commitment, { commitmentBuffer }),
  );

  await finalizeRegularReveal(session, ownerEvmAddress, label, registration);

  forgetCommitment(persistContext, label);

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(session.ctx, label, ownerEvmAddress),
  );

  if (!isCrossPayer) {
    await step("Ensuring label store", async () =>
      ensureLabelStoreReady(session.ctx, session.caller),
    );
  }

  if (transferDestination) {
    await replayTransfer(session, label, transferDestination);
  }
}

async function isRegisteredTo(ctx: DotnsContext, label: string, owner: Address): Promise<boolean> {
  const actual = await readDomainOwner(ctx, label);
  return checksumAddress(actual) === checksumAddress(owner);
}

async function resumeRegistration(
  context: Awaited<ReturnType<typeof prepareAssetHubContext>>,
  record: CommitmentRecord,
  credential: string,
  commitmentBuffer?: number,
): Promise<DomainRegistrationResult> {
  const session = buildSession(context, "Register");
  const { label } = record;
  const persistContext: PersistContext = {
    env: requireEnvironment(context.environment),
    caller: session.caller,
    credential,
  };

  printCommandHeader("Resuming", `${label}.dot`);

  const registration: DomainRegistration = {
    label,
    owner: record.owner,
    secret: decryptCommitmentSecret(record, credential),
    reserved: record.reserved,
  };

  const alreadyOwned = await step("Checking on-chain ownership", async () =>
    isRegisteredTo(session.ctx, label, record.owner),
  );

  if (alreadyOwned) {
    console.log(chalk.green(`  ✓ ${label}.dot is already registered to ${record.owner}`));
    forgetCommitment(persistContext, label);
    return {
      ok: true as const,
      label,
      domain: `${label}.dot`,
      caller: session.caller,
      owner: record.owner,
    };
  }

  const status = await step("Reading commitment status", async () =>
    readCommitmentStatus(session.ctx, record.commitmentHash),
  );

  const commitmentAge = status.nowSeconds - status.committedTimestampSeconds;
  const needsRecommit =
    status.committedTimestampSeconds === 0 || commitmentAge > status.maxAgeSeconds;

  if (needsRecommit) {
    await step("Re-submitting commitment", async () =>
      submitCommitment(session.ctx, record.commitmentHash),
    );
  }

  await step("Waiting commitment age", async () =>
    waitForMinimumCommitmentAge(session.ctx, record.commitmentHash, { commitmentBuffer }),
  );

  if (record.governance) {
    const result = await step("Finalizing registration", async () =>
      finalizeGovernanceRegistration(session.ctx, registration),
    );
    console.log(chalk.gray("  tx:        ") + chalk.blue(result.txHash));
  } else {
    await finalizeRegularReveal(session, record.owner, label, registration);
  }

  await step("Verifying ownership", async () =>
    verifyDomainOwnership(session.ctx, label, record.owner),
  );

  forgetCommitment(persistContext, label);

  if (record.transferDestination) {
    await replayTransfer(session, label, record.transferDestination);
  }

  console.log(chalk.bold.green("✓ Registration Resumed") + chalk.gray(` ${label}.dot`));

  return {
    ok: true as const,
    label,
    domain: `${label}.dot`,
    caller: session.caller,
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

type ClearSummary = {
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

  printCommandHeader("Pending commitments");
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
  const session = buildSession(context, "Register");
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
      isRegisteredTo(session.ctx, record.label, record.owner),
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

type CommitmentRow = {
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
  const caller = context.evmAddress as Address;
  const env = requireEnvironment(context.environment);
  const ctx = buildDotnsContext(
    { ...context, substrateAddress: context.account.address, signer: undefined } as any,
    { onStatus: makeOnStatus(undefined, "Register") },
  );

  const records = loadCommitmentRecords(env, caller);

  const rows: CommitmentRow[] = [];
  for (const record of records) {
    const registered = await isRegisteredTo(ctx, record.label, record.owner);
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
      printCommandHeader("Cached commitments");
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
