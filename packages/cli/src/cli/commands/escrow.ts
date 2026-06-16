import { printCommandHeader } from "../ui";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import type { Address } from "viem";
import {
  getEscrowPosition,
  listEscrowPositions,
  totalEscrowAmount,
  formatPositionStatus,
  cooldownRemainingSeconds,
  releaseName,
  withdrawName,
  claimWithdrawal,
  getPendingWithdrawal,
  listRefunds,
  claimRefund,
  claimRefundsBatch,
} from "../../commands/escrow";
import { formatPositionsTable, formatRefundEntryLine } from "../views/escrow";
import { listStoreNames } from "../../commands/storeManagement";
import { resolveTransferRecipient } from "../transfer";
import { addAuthOptions } from "./authOptions";
import { prepareContext, buildDotnsContext, buildReadOnlyDotnsContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { makeOnStatus } from "../txStatus";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import { formatWeiAsEther } from "../../utils/formatting";
import type { AssetHubContext, ReadOnlyContext } from "../../types/types";

const DEFAULT_REFUND_PAGE_SIZE = 50;
const MAX_REFUND_PAGE_SIZE = 200;

async function resolveRecipientOption(
  jsonOutput: boolean,
  context: ReadOnlyContext,
  recipientOption: string | undefined,
): Promise<Address> {
  if (!recipientOption) return context.evmAddress as Address;
  return maybeQuiet(jsonOutput, () =>
    resolveTransferRecipient(buildReadOnlyDotnsContext(context), recipientOption),
  );
}

interface EscrowCommonOptions {
  rpc?: string;
}

interface RefundListOptions extends EscrowCommonOptions {
  offset?: string;
  limit?: string;
  recipient?: string;
}

function parsePositiveBigInt(value: string, label: string): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a non-negative decimal integer`);
  }
  return BigInt(value.trim());
}

export function attachEscrowCommands(root: Command) {
  const escrowCommand = root
    .command("escrow")
    .description("Manage NoStatus deposits and the refund-on-leave ledger");
  addAuthOptions(escrowCommand);

  // escrow status <name>
  const statusCommand = escrowCommand
    .command("status <name>")
    .description("Show the escrow release position for a name")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(statusCommand).action(
    async (name: string, options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as any),
        );

        if (!jsonOutput) printCommandHeader("Escrow status");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const position = await maybeQuiet(jsonOutput, () => getEscrowPosition(ctx, name));

        if (!emitJsonResult(jsonOutput, position)) {
          if (position === null) {
            console.log(chalk.gray("  no release position recorded for this name"));
          } else {
            console.log(chalk.gray("  recipient: ") + chalk.white(position.recipient));
            console.log(
              chalk.gray("  amount:    ") + chalk.green(formatWeiAsEther(position.amount) + " PAS"),
            );
            console.log(chalk.gray("  released:  ") + chalk.white(String(position.released)));
            console.log(chalk.gray("  claimed:   ") + chalk.white(String(position.claimed)));
            const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
            console.log(
              chalk.gray("  status:    ") + chalk.white(formatPositionStatus(position, nowSeconds)),
            );
            if (position.withdrawAvailableAt > 0n) {
              const t = new Date(Number(position.withdrawAvailableAt) * 1000).toISOString();
              console.log(chalk.gray("  withdraw:  ") + chalk.white(t));
            }
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  // escrow balance
  const balanceCommand = escrowCommand
    .command("balance")
    .description("Show the caller's claimable pull-payment balance")
    .option(
      "--recipient <address>",
      "Recipient EVM address, SS58 address, or .dot label (defaults to caller)",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(balanceCommand).action(async (options: RefundListOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(mergedOptions as any),
      );

      const recipient = await resolveRecipientOption(jsonOutput, context, options.recipient);

      if (!jsonOutput) printCommandHeader("Escrow balance");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, { onStatus: makeOnStatus(spinner, "Escrow") });

      const balance = await maybeQuiet(jsonOutput, () => getPendingWithdrawal(ctx, recipient));

      if (!emitJsonResult(jsonOutput, { recipient, balance: balance.toString() })) {
        console.log(chalk.gray("  claimable: ") + chalk.green(formatWeiAsEther(balance) + " PAS"));
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  // escrow positions
  const positionsCommand = escrowCommand
    .command("positions")
    .description("List all escrow positions for the caller and the total locked")
    .option(
      "--recipient <address>",
      "Recipient EVM address, SS58 address, or .dot label (defaults to caller)",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(positionsCommand).action(async (options: RefundListOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(mergedOptions as any),
      );

      const recipient = await resolveRecipientOption(jsonOutput, context, options.recipient);

      if (!jsonOutput) printCommandHeader("Escrow positions");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, { onStatus: makeOnStatus(spinner, "Escrow") });

      const names = await maybeQuiet(jsonOutput, () => listStoreNames(ctx, recipient));
      const positions = await maybeQuiet(jsonOutput, () =>
        listEscrowPositions(ctx, recipient, names),
      );
      const total = totalEscrowAmount(positions);
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

      const handled = emitJsonResult(jsonOutput, {
        recipient,
        total: total.toString(),
        positions: positions.map((position) => ({
          domain: position.domain,
          tokenId: position.tokenId.toString(),
          amount: position.amount.toString(),
          released: position.released,
          claimed: position.claimed,
          withdrawAvailableAt: position.withdrawAvailableAt.toString(),
          status: formatPositionStatus(position, nowSeconds),
          cooldownSeconds: cooldownRemainingSeconds(position, nowSeconds).toString(),
        })),
      });

      if (!handled) {
        if (positions.length === 0) {
          console.log(chalk.gray("  no escrow positions"));
        } else {
          for (const line of formatPositionsTable(positions, nowSeconds)) console.log("  " + line);
        }
        console.log(
          chalk.gray("\n  total in escrow: ") + chalk.green(formatWeiAsEther(total) + " PAS"),
        );
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  // escrow release <name>
  const releaseCommand = escrowCommand
    .command("release <name>")
    .description("Approve the escrow and surrender the NFT to start the refund cooldown")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(releaseCommand).action(
    async (name: string, options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Escrow release");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const result = await maybeQuiet(jsonOutput, () => releaseName(ctx, name));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  approve tx: ") + chalk.blue(result.approveTxHash));
          console.log(chalk.gray("  release tx: ") + chalk.blue(result.releaseTxHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  // escrow withdraw <name>
  const withdrawCommand = escrowCommand
    .command("withdraw <name>")
    .description("Move a released deposit onto the pull-payment ledger (after cooldown)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(withdrawCommand).action(
    async (name: string, options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Escrow withdraw");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const txHash = await maybeQuiet(jsonOutput, () => withdrawName(ctx, name));

        if (!emitJsonResult(jsonOutput, { ok: true, txHash })) {
          console.log(chalk.gray("  tx: ") + chalk.blue(txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  // escrow claim-withdrawal
  const claimWithdrawalCommand = escrowCommand
    .command("claim-withdrawal")
    .description("Drain the pull-payment ledger (registration-overpayment fallback)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(claimWithdrawalCommand).action(
    async (options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Escrow claim-withdrawal");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const balance = await maybeQuiet(jsonOutput, () =>
          getPendingWithdrawal(ctx, context.evmAddress as Address),
        );

        if (balance === 0n) {
          if (!emitJsonResult(jsonOutput, { ok: true, txHash: null, balance: "0" })) {
            console.log(chalk.gray("  nothing to claim; pull-payment balance is 0"));
            console.log(chalk.green("\n✓ Complete\n"));
          }
          process.exit(0);
        }

        const txHash = await maybeQuiet(jsonOutput, () => claimWithdrawal(ctx));

        if (!emitJsonResult(jsonOutput, { ok: true, txHash, balance: balance.toString() })) {
          console.log(chalk.gray("  tx: ") + chalk.blue(txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const refundsCommand = escrowCommand
    .command("refunds")
    .description("Inspect and claim entries from the time-locked refund ledger");

  // escrow refunds list [--recipient <addr>] [--offset N] [--limit N]
  const refundsListCommand = refundsCommand
    .command("list")
    .description("List pending refund entries for the caller (or a specified recipient)")
    .option(
      "--recipient <address>",
      "Recipient EVM address, SS58 address, or .dot label (defaults to caller)",
    )
    .option("--offset <n>", "Page offset", "0")
    .option(
      "--limit <n>",
      `Page size (max ${MAX_REFUND_PAGE_SIZE})`,
      String(DEFAULT_REFUND_PAGE_SIZE),
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(refundsListCommand).action(
    async (options: RefundListOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as any),
        );

        const offset = Number(options.offset ?? "0");
        const limit = Number(options.limit ?? String(DEFAULT_REFUND_PAGE_SIZE));
        if (!Number.isInteger(offset) || offset < 0)
          throw new Error("offset must be a non-negative integer");
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REFUND_PAGE_SIZE) {
          throw new Error(`limit must be between 1 and ${MAX_REFUND_PAGE_SIZE}`);
        }

        const recipient = await resolveRecipientOption(jsonOutput, context, options.recipient);

        if (!jsonOutput) printCommandHeader("Refund ledger");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const result = await maybeQuiet(jsonOutput, () =>
          listRefunds(ctx, recipient, offset, limit),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          if (result.entries.length === 0) {
            console.log(chalk.gray("  no entries in this page"));
          } else {
            for (const entry of result.entries) {
              console.log("  " + formatRefundEntryLine(entry));
            }
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  // escrow refunds claim <entryId>
  const refundsClaimCommand = refundsCommand
    .command("claim <entryId>")
    .description("Claim a single refund entry after its cooldown elapses")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(refundsClaimCommand).action(
    async (entryIdRaw: string, options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const entryId = parsePositiveBigInt(entryIdRaw, "entryId");

        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Refund claim");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const txHash = await maybeQuiet(jsonOutput, () => claimRefund(ctx, entryId));

        if (!emitJsonResult(jsonOutput, { ok: true, txHash, entryId: entryId.toString() })) {
          console.log(chalk.gray("  tx: ") + chalk.blue(txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  // escrow refunds claim-batch <ids...>
  const refundsClaimBatchCommand = refundsCommand
    .command("claim-batch <ids...>")
    .description("Claim several refund entries in one transaction")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(refundsClaimBatchCommand).action(
    async (idsRaw: string[], options: EscrowCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        if (idsRaw.length === 0) throw new Error("Provide at least one entry id");
        if (idsRaw.length > MAX_REFUND_PAGE_SIZE) {
          throw new Error(
            `Cannot claim more than ${MAX_REFUND_PAGE_SIZE} entries in a single batch`,
          );
        }
        const entryIds = idsRaw.map((value) => parsePositiveBigInt(value, "entryId"));

        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Refund batch claim");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "Escrow"),
        });

        const txHash = await maybeQuiet(jsonOutput, () => claimRefundsBatch(ctx, entryIds));

        if (
          !emitJsonResult(jsonOutput, {
            ok: true,
            txHash,
            count: entryIds.length,
            entryIds: entryIds.map((id) => id.toString()),
          })
        ) {
          console.log(chalk.gray("  tx:    ") + chalk.blue(txHash));
          console.log(chalk.gray("  count: ") + chalk.white(String(entryIds.length)));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
