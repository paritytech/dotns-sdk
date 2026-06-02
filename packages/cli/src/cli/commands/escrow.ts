import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import type { Address } from "viem";
import {
  viewEscrowPosition,
  releaseDomain,
  withdrawDomain,
  claimWithdrawal,
  listRefunds,
  claimRefund,
  claimRefundsBatch,
  formatRefundEntryLine,
} from "../../commands/escrow";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import { formatWeiAsEther } from "../../utils/formatting";

const DEFAULT_REFUND_PAGE_SIZE = 50;
const MAX_REFUND_PAGE_SIZE = 200;

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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Escrow status\n"));
        const spinner = ora();

        const position = await maybeQuiet(jsonOutput, () =>
          viewEscrowPosition(context.clientWrapper!, context.account.address, name, spinner),
        );

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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Escrow release\n"));
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          releaseDomain(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            spinner,
          ),
        );

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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Escrow withdraw\n"));
        const spinner = ora();

        const txHash = await maybeQuiet(jsonOutput, () =>
          withdrawDomain(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            spinner,
          ),
        );

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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Escrow claim-withdrawal\n"));
        const spinner = ora();

        const txHash = await maybeQuiet(jsonOutput, () =>
          claimWithdrawal(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            spinner,
          ),
        );

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

  const refundsCommand = escrowCommand
    .command("refunds")
    .description("Inspect and claim entries from the time-locked refund ledger");

  // escrow refunds list [--recipient <addr>] [--offset N] [--limit N]
  const refundsListCommand = refundsCommand
    .command("list")
    .description("List pending refund entries for the caller (or a specified recipient)")
    .option("--recipient <address>", "Recipient EVM address (defaults to caller)")
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

        const recipient = (options.recipient ?? context.account.address) as Address;

        if (!jsonOutput) console.log(chalk.bold("\n▶ Refund ledger\n"));
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          listRefunds(
            context.clientWrapper!,
            context.account.address,
            recipient,
            offset,
            limit,
            spinner,
          ),
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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Refund claim\n"));
        const spinner = ora();

        const txHash = await maybeQuiet(jsonOutput, () =>
          claimRefund(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            entryId,
            spinner,
          ),
        );

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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Refund batch claim\n"));
        const spinner = ora();

        const txHash = await maybeQuiet(jsonOutput, () =>
          claimRefundsBatch(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            entryIds,
            spinner,
          ),
        );

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
