import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getAddress, zeroAddress, type Address } from "viem";
import { printCommandHeader, step } from "../ui";
import { addAuthOptions } from "./authOptions";
import { prepareAssetHubContext, buildDotnsContext, buildReadOnlyDotnsContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { makeOnStatus } from "../txStatus";
import { readLine } from "../io";
import { resolveTransferRecipient } from "../transfer";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import { formatDomainName } from "../../core/naming";
import type { DotnsContext } from "../../core/context";
import { formatNativeBalance } from "../../utils/formatting";
import { getActiveDotnsEnvironment } from "../../utils/constants";
import {
  GOVERNANCE_TRACKS,
  assessGrant,
  buildGrantProposal,
  buildSubmission,
  describeReferendum,
  estimateProposalCosts,
  findGrantReferenda,
  formatBlockDuration,
  getReferendum,
  normaliseGrantLabel,
  placeDecisionDeposit,
  readGovernanceClock,
  readGrantEligibility,
  requiredBalance,
  submitGrantReferendum,
  type GovernanceClock,
  type GovernanceTrack,
  type GrantProposal,
  type ProposalCosts,
  type ReferendumSummary,
} from "../../commands/governance";

interface ProposeOptions {
  for?: string;
  reason?: string;
  track?: string;
  decisionDeposit?: boolean;
  dryRun?: boolean;
}

type ProposalSummaryOptions = {
  domain: string;
  you: boolean;
  networkLabel: string;
  placeDecisionDeposit: boolean;
};

const TRACK_LABELS: Record<GovernanceTrack, string> = {
  root: "Root",
  "whitelisted-caller": "Whitelisted Caller",
};

function parseTrack(value: string | undefined): GovernanceTrack {
  const track = (value ?? "root") as GovernanceTrack;
  if (!GOVERNANCE_TRACKS.includes(track)) {
    throw new Error(`Unknown track "${value}": use ${GOVERNANCE_TRACKS.join(" or ")}`);
  }
  return track;
}

// Whole tokens with thousands separators and at most four decimals, so 100000 DOT
// reads as `100,000 DOT` and a preimage deposit as `0.4023 DOT`.
export function formatTokenAmount(value: bigint, decimals: number, symbol: string): string {
  const [whole, fraction = ""] = formatNativeBalance(value, decimals).split(".");
  const shown = fraction.slice(0, 4).replace(/0+$/, "");
  return `${BigInt(whole!).toLocaleString("en-US")}${shown ? `.${shown}` : ""} ${symbol}`;
}

// The amount a user types to confirm a deposit: the exact value, no separators.
export function typedAmount(value: bigint, decimals: number): string {
  const [whole, fraction = ""] = formatNativeBalance(value, decimals).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole!;
}

export function matchesTypedAmount(input: string, expected: string): boolean {
  return input.replace(/[\s,_]/g, "") === expected;
}

function row(label: string, value: string, note = ""): string {
  return `  ${chalk.gray(label.padEnd(20))}${note ? `${value.padEnd(18)}${chalk.gray(note)}` : value}`;
}

function noteLine(text: string): string {
  return `  ${" ".repeat(38)}${chalk.gray(text)}`;
}

function printProposalSummary(
  ctx: DotnsContext,
  proposal: GrantProposal,
  costs: ProposalCosts,
  opts: ProposalSummaryOptions,
): void {
  const amount = (value: bigint) =>
    formatTokenAmount(value, ctx.nativeTokenDecimals, ctx.nativeTokenSymbol);
  const track = proposal.track;

  console.log(
    `\nProposing a grant of ${chalk.cyan(opts.domain)} to ${proposal.beneficiary}` +
      `${opts.you ? " (you)" : ""} on ${opts.networkLabel}\n`,
  );
  console.log(
    `  ${chalk.gray("Call".padEnd(20))}DotnsNameWhitelist.${proposal.action}("${proposal.label}", ${proposal.beneficiary})` +
      `   ${chalk.green("dry run as Root: ok")}`,
  );
  console.log(
    `  ${chalk.gray("Track".padEnd(20))}${TRACK_LABELS[track.track]} · ~${formatBlockDuration(track.decisionPeriod)} decision` +
      ` + ${formatBlockDuration(track.confirmPeriod)} confirm + ${formatBlockDuration(track.minEnactmentPeriod)} enactment`,
  );
  if (proposal.whitelistCallHash) {
    console.log(
      `  ${chalk.gray("Fellowship".padEnd(20))}call hash ${proposal.whitelistCallHash}  ` +
        (proposal.whitelisted ? chalk.green("whitelisted") : chalk.yellow("not whitelisted yet")),
    );
  }
  console.log();

  console.log(
    row(
      "Submission deposit",
      amount(costs.submissionDeposit),
      "refunded only if approved or cancelled",
    ),
  );
  console.log(
    costs.preimageNoted
      ? row("Preimage deposit", "-", "preimage already noted on chain")
      : row(
          "Preimage deposit",
          costs.preimageDeposit === null ? "unknown" : amount(costs.preimageDeposit),
          costs.preimageDeposit === null
            ? "couldn't be priced from this account's balance"
            : "refunded when the preimage is cleared",
        ),
  );
  if (opts.placeDecisionDeposit) {
    console.log(
      row(
        "Decision deposit",
        amount(costs.decisionDeposit),
        "placed now, refunded unless the referendum is killed",
      ),
    );
  } else {
    console.log(
      row(
        "Decision deposit",
        amount(costs.decisionDeposit),
        "not placed (--decision-deposit to place it)",
      ),
    );
    console.log(
      noteLine(
        `without it the referendum times out after ~${formatBlockDuration(costs.undecidingTimeout)}`,
      ),
    );
    console.log(noteLine(`and the ${amount(costs.submissionDeposit)} submission deposit is lost`));
  }
  const fees = costs.fees + (opts.placeDecisionDeposit ? costs.decisionDepositFee : 0n);
  console.log(row("Fees", amount(fees)));
  console.log();

  const required = requiredBalance(costs, opts.placeDecisionDeposit);
  const covered = costs.freeBalance >= required;
  console.log(
    row(
      "Free balance",
      amount(costs.freeBalance),
      covered
        ? `covers ${amount(required)}, the existential deposit included ✓`
        : `needs ${amount(required)}, short by ${amount(required - costs.freeBalance)}`,
    ),
  );
}

async function confirmSubmission(
  ctx: DotnsContext,
  costs: ProposalCosts,
  placeDeposit: boolean,
): Promise<boolean> {
  const answer = await readLine(`\n${chalk.bold("? Submit this referendum?")} (y/N) `);
  if (!/^y(es)?$/i.test(answer)) return false;
  if (!placeDeposit) return true;

  const expected = typedAmount(costs.decisionDeposit, ctx.nativeTokenDecimals);
  const typed = await readLine(
    `${chalk.bold(`? Type ${expected} to also lock the ${formatTokenAmount(costs.decisionDeposit, ctx.nativeTokenDecimals, ctx.nativeTokenSymbol)} decision deposit:`)} `,
  );
  return matchesTypedAmount(typed, expected);
}

async function runPropose(name: string, options: ProposeOptions, command: Command): Promise<void> {
  const jsonOutput = getJsonFlag(command);
  try {
    const dryRun = options.dryRun === true;
    const placeDeposit = options.decisionDeposit === true;
    const track = parseTrack(options.track);
    if (jsonOutput && !dryRun) {
      throw new Error("--json only works with --dry-run, since submitting asks for confirmation.");
    }
    if (!dryRun && !process.stdin.isTTY) {
      throw new Error(
        "Refusing to sign a referendum without an interactive terminal. Use --dry-run to print the call.",
      );
    }

    const mergedOptions = getMergedOptions(command, options);
    const context = await maybeQuiet(jsonOutput, () =>
      prepareAssetHubContext(mergedOptions, { mapAccount: false }),
    );
    if (!jsonOutput) printCommandHeader("Propose name grant", name);
    const spinner = ora();
    const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "Submitting") });

    const label = await normaliseGrantLabel(ctx, name);
    const domain = await formatDomainName(ctx, label);
    const beneficiary: Address = options.for
      ? await maybeQuiet(jsonOutput, () =>
          step("Resolving beneficiary", async () =>
            resolveTransferRecipient(ctx, options.for as string),
          ),
        )
      : getAddress(context.evmAddress);
    const you = beneficiary.toLowerCase() === context.evmAddress.toLowerCase();

    const eligibility = await maybeQuiet(jsonOutput, () =>
      step("Checking the name", async () => readGrantEligibility(ctx, label, beneficiary)),
    );
    const assessment = assessGrant(eligibility, beneficiary, domain);
    if (assessment.blocker) throw new Error(assessment.blocker);

    const openReferenda = await maybeQuiet(jsonOutput, () =>
      step("Looking for open referenda", async () => findGrantReferenda(ctx, label)),
    );
    const warnings = [...assessment.warnings];
    for (const referendum of openReferenda) {
      warnings.push(
        `Referendum #${referendum.index} already proposes a grant of ${domain} to ${referendum.grant?.beneficiary}. Only the first grant to enact succeeds.`,
      );
    }

    const proposal = await maybeQuiet(jsonOutput, () =>
      step("Building and dry-running the proposal", async () =>
        buildGrantProposal(ctx, { label, beneficiary, action: assessment.action, track }),
      ),
    );
    if (proposal.whitelisted === false) {
      warnings.push(
        `The Fellowship has not whitelisted call ${proposal.whitelistCallHash}. Without that the referendum can pass and still fail at enactment.`,
      );
    }
    const costs = await maybeQuiet(jsonOutput, () =>
      step("Estimating deposits and fees", async () =>
        estimateProposalCosts(ctx, proposal, { reason: options.reason }),
      ),
    );
    const required = requiredBalance(costs, placeDeposit);
    const affordable = costs.freeBalance >= required && !costs.submissionError;

    if (dryRun) {
      const submission = buildSubmission(ctx, proposal, {
        notePreimage: !costs.preimageNoted,
        reason: options.reason,
      });
      const callData = (await submission.getEncodedData()).asHex();
      const result = {
        label,
        domain,
        beneficiary,
        action: proposal.action,
        track,
        whitelist: proposal.whitelist,
        calldata: proposal.calldata,
        proposal: `0x${Buffer.from(proposal.proposalBytes).toString("hex")}`,
        preimageHash: proposal.preimageHash,
        preimageLength: proposal.preimageLength,
        whitelistCallHash: proposal.whitelistCallHash,
        whitelisted: proposal.whitelisted,
        submissionCall: callData,
        costs,
        requiredBalance: required,
        affordable,
        warnings,
      };
      if (!emitJsonResult(jsonOutput, result)) {
        printProposalSummary(ctx, proposal, costs, {
          domain,
          you,
          networkLabel: getActiveDotnsEnvironment().label,
          placeDecisionDeposit: placeDeposit,
        });
        printWarnings(warnings);
        if (costs.submissionError) {
          console.log(chalk.yellow(`\n  ⚠ Submission dry run failed: ${costs.submissionError}`));
        }
        console.log(chalk.gray("\n  Preimage hash:   ") + proposal.preimageHash);
        console.log(chalk.gray("  Preimage length: ") + proposal.preimageLength);
        console.log(chalk.gray("  Submission call: ") + callData);
        console.log(chalk.gray("\nDry run: nothing was signed."));
      }
      process.exit(0);
    }

    printProposalSummary(ctx, proposal, costs, {
      domain,
      you,
      networkLabel: getActiveDotnsEnvironment().label,
      placeDecisionDeposit: placeDeposit,
    });
    printWarnings(warnings);

    if (costs.submissionError) {
      throw new Error(`The submission would fail: ${costs.submissionError}`);
    }
    if (!affordable) {
      throw new Error(
        `Free balance doesn't cover the deposits and fees: short by ${formatTokenAmount(required - costs.freeBalance, ctx.nativeTokenDecimals, ctx.nativeTokenSymbol)}.`,
      );
    }

    if (!(await confirmSubmission(ctx, costs, placeDeposit))) {
      console.log(chalk.gray("\nCancelled: nothing was signed.\n"));
      process.exit(0);
    }

    spinner.start("Submitting referendum");
    const submitted = await submitGrantReferendum(ctx, proposal, {
      notePreimage: !costs.preimageNoted,
      reason: options.reason,
    });
    spinner.stop();
    console.log(chalk.green(`\n✓ Referendum #${submitted.index} submitted`));
    console.log(chalk.gray("  tx: ") + chalk.blue(submitted.txHash));

    if (placeDeposit) {
      spinner.start("Placing decision deposit");
      const placed = await placeDecisionDeposit(ctx, submitted.index);
      spinner.stop();
      console.log(chalk.green("✓ Decision deposit placed"));
      console.log(chalk.gray("  tx: ") + chalk.blue(placed.txHash));
    }

    console.log(chalk.gray("\n  Follow it:  ") + `dotns governance status ${label}`);
    console.log(
      chalk.gray("              ") +
        `https://polkadot.js.org/apps/?rpc=${encodeURIComponent(context.rpc)}#/referenda`,
    );
    console.log(
      chalk.gray("  Once enacted, ") +
        (you ? "you register it" : `${beneficiary} registers it`) +
        ` with: dotns register domain --name ${label} --governance\n`,
    );
    process.exit(0);
  } catch (error) {
    handleCommandError(jsonOutput, error);
  }
}

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) console.log(chalk.yellow(`\n  ⚠ ${warning}`));
}

function referendumLine(summary: ReferendumSummary, clock: GovernanceClock): string {
  const grant = summary.grant
    ? chalk.gray(
        `  ${summary.grant.action} to ${summary.grant.beneficiary}` +
          (summary.grant.viaWhitelist ? " via Whitelisted Caller" : ""),
      )
    : "";
  return `  Referendum #${summary.index} · ${describeReferendum(summary, clock)}${grant}`;
}

async function runStatus(target: string, options: object, command: Command): Promise<void> {
  const jsonOutput = getJsonFlag(command);
  try {
    const mergedOptions = getMergedOptions(command, options);
    const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));
    const ctx = buildReadOnlyDotnsContext(context);
    const clock = await readGovernanceClock(ctx);

    if (/^\d+$/.test(target)) {
      const summary = await getReferendum(ctx, Number(target));
      if (!summary) throw new Error(`Referendum #${target} does not exist on this network.`);
      if (!emitJsonResult(jsonOutput, summary)) {
        console.log(referendumLine(summary, clock));
        if (summary.grant) {
          console.log(chalk.gray("  Names:    ") + summary.grant.labels.join(", "));
        }
        if (summary.status === "Approved") {
          console.log(
            chalk.gray(
              "  An approved grant takes effect after the enactment period. Check the name with dotns governance status <name>.",
            ),
          );
        }
      }
      process.exit(0);
    }

    const label = await normaliseGrantLabel(ctx, target);
    const domain = await formatDomainName(ctx, label);
    const [eligibility, referenda] = await Promise.all([
      readGrantEligibility(ctx, label, zeroAddress),
      findGrantReferenda(ctx, label),
    ]);
    const granted = eligibility.whitelistStatus === "Claimed";

    if (
      !emitJsonResult(jsonOutput, {
        label,
        domain,
        registered: !eligibility.available,
        whitelistStatus: eligibility.whitelistStatus,
        grantee: granted ? eligibility.grantee : null,
        popReservation: eligibility.popReservation,
        referenda,
      })
    ) {
      console.log(chalk.bold(`\n${domain}`));
      console.log(
        chalk.gray("  Whitelist:  ") +
          (granted ? `granted to ${eligibility.grantee}` : eligibility.whitelistStatus),
      );
      console.log(chalk.gray("  Registered: ") + (eligibility.available ? "no" : "yes"));
      if (eligibility.popReservation) {
        console.log(
          chalk.yellow(
            `  Reserved through the Polkadot App by ${eligibility.popReservation.owner}`,
          ),
        );
      }
      for (const referendum of referenda) console.log(referendumLine(referendum, clock));

      if (!eligibility.available) {
        console.log(chalk.gray(`\n  ${domain} is registered.`));
      } else if (granted) {
        console.log(
          `\n  ${eligibility.grantee} registers it with: dotns register domain --name ${label} --governance`,
        );
        if (eligibility.baseLength >= 6) {
          console.log(
            chalk.yellow(
              "  Do it soon: a person can still claim this name in the Polkadot App until it is registered.",
            ),
          );
        }
      } else if (referenda.length === 0) {
        console.log(
          chalk.gray(
            `\n  No open referendum grants ${domain}. Propose one with: dotns governance propose ${label}`,
          ),
        );
      }
      console.log();
    }
    process.exit(0);
  } catch (error) {
    handleCommandError(jsonOutput, error);
  }
}

export function attachGovernanceCommands(root: Command) {
  const governanceCommand = root
    .command("governance")
    .description("Ask OpenGov for a name that can't be bought, and follow the vote");
  addAuthOptions(governanceCommand);

  const proposeCommand = governanceCommand
    .command("propose <name>")
    .description(
      "Submit a referendum that grants a name on the whitelist, after checking it can succeed and showing what it costs",
    )
    .option(
      "--for <account>",
      "Account the grant is for: EVM address, SS58 address or domain name (default: the signer). That account registers the name.",
    )
    .option(
      "--reason <text>",
      "Why the name should be granted, recorded on chain with the submission",
    )
    .option(
      "--track <track>",
      "Referendum track: root (default) or whitelisted-caller, which needs the Technical Fellowship to whitelist the call",
    )
    .option("--decision-deposit", "Also place the track's decision deposit", false)
    .option("--dry-run", "Print the call, preimage and costs without signing", false)
    .option("--json", "Output result as JSON; only with --dry-run", false);
  addAuthOptions(proposeCommand).action(runPropose);

  const statusCommand = governanceCommand
    .command("status <nameOrIndex>")
    .description("Show the referenda for a name, or one referendum by its index")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(statusCommand).action(runStatus);
}
