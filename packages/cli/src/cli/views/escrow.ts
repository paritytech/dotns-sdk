import chalk from "chalk";
import {
  type EscrowPositionView,
  type RefundEntryView,
  formatPositionStatus,
} from "../../commands/escrow";
import { formatWeiAsEther } from "../../utils/formatting";

function colorPositionStatus(status: string): string {
  if (status === "claimable") return chalk.green(status);
  if (status.startsWith("cooldown")) return chalk.yellow(status);
  if (status === "held") return chalk.cyan(status);
  return chalk.gray(status);
}

/// Renders positions as an aligned NAME / DEPOSIT / STATUS table. Empty input yields no
/// lines so the caller can print its own "no positions" message.
export function formatPositionsTable(
  positions: readonly EscrowPositionView[],
  nowSeconds: bigint,
): string[] {
  if (positions.length === 0) return [];

  const rows = positions.map((position) => ({
    name: `${position.domain}.dot`,
    deposit: `${formatWeiAsEther(position.amount)} PAS`,
    status: formatPositionStatus(position, nowSeconds),
  }));
  const nameWidth = Math.max("NAME".length, ...rows.map((row) => row.name.length));
  const depositWidth = Math.max("DEPOSIT".length, ...rows.map((row) => row.deposit.length));

  const header = `${chalk.bold("NAME".padEnd(nameWidth))}  ${chalk.bold("DEPOSIT".padEnd(depositWidth))}  ${chalk.bold("STATUS")}`;
  return [
    header,
    ...rows.map(
      (row) =>
        `${chalk.cyan(row.name.padEnd(nameWidth))}  ${chalk.green(row.deposit.padEnd(depositWidth))}  ${colorPositionStatus(row.status)}`,
    ),
  ];
}

/// Pretty-prints a refund entry for terminal output.
export function formatRefundEntryLine(entry: RefundEntryView): string {
  const claimableAt = new Date(Number(entry.availableAt) * 1000);
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.floor((claimableAt.getTime() - now) / 1000));
  const status =
    remainingSeconds === 0
      ? chalk.green("claimable")
      : chalk.yellow(`cooldown ${remainingSeconds}s`);
  return `#${entry.entryId.toString()}  ${chalk.green(formatWeiAsEther(entry.amount))} PAS  ${status}  (token ${entry.tokenId.toString().slice(0, 12)}...)`;
}
