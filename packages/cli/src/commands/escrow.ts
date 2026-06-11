import chalk from "chalk";
import type { Ora } from "ora";
import { getAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_NAME_ESCROW_ABI, DOTNS_REGISTRAR_ABI } from "../utils/constants";
import {
  computeDomainTokenId,
  performContractCall,
  submitContractTransaction,
} from "../utils/contractInteractions";
import { formatWeiAsEther } from "../utils/formatting";

/// On-chain release position for a token.
export type EscrowPositionView = {
  domain: string;
  tokenId: bigint;
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

export type RefundEntryView = {
  entryId: bigint;
  recipient: Address;
  amount: bigint;
  availableAt: bigint;
  tokenId: bigint;
};

export type RefundsListResult = {
  recipient: Address;
  total: bigint;
  page: {
    offset: number;
    limit: number;
  };
  entries: RefundEntryView[];
};

type RawReleasePosition = {
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

type RawRefundEntry = {
  recipient: Address;
  amount: bigint;
  availableAt: bigint;
  tokenId: bigint;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/// Reads one release position by name (no spinner). Returns null when the slot is empty.
async function readPositionForName(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  name: string,
): Promise<EscrowPositionView | null> {
  const label = name.replace(/\.dot$/, "");
  const tokenId = computeDomainTokenId(label);

  const raw = await performContractCall<RawReleasePosition>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "getReleasePosition",
    [tokenId],
  );

  if (raw.recipient === ZERO_ADDRESS && raw.amount === 0n && !raw.released) {
    return null;
  }

  return {
    domain: label,
    tokenId,
    recipient: raw.recipient,
    asset: raw.asset,
    amount: raw.amount,
    withdrawAvailableAt: raw.withdrawAvailableAt,
    released: raw.released,
    claimed: raw.claimed,
  };
}

/// Reads the current release position for a name. Returns null when the slot is empty.
export async function viewEscrowPosition(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  spinner: Ora,
): Promise<EscrowPositionView | null> {
  spinner.start(`Reading escrow position for ${chalk.cyan(label + ".dot")}`);
  const position = await readPositionForName(clientWrapper, originSubstrateAddress, label);
  spinner.succeed(
    position === null
      ? `No escrow position for ${chalk.cyan(label + ".dot")}`
      : `Position for ${chalk.cyan(label + ".dot")}`,
  );
  return position;
}

/// All release positions belonging to `recipient`, across the names they hold. Labels
/// are mirror-on-transfer and never deleted, so a released name still resolves through
/// the caller's own label set; the recipient filter drops names transferred away.
export async function listAccountPositions(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  recipient: Address,
  names: string[],
  spinner: Ora,
): Promise<EscrowPositionView[]> {
  spinner.start(`Reading escrow positions for ${chalk.white(recipient)}`);
  const me = getAddress(recipient);

  const positions: EscrowPositionView[] = [];
  for (const name of names) {
    const position = await readPositionForName(clientWrapper, originSubstrateAddress, name).catch(
      () => null,
    );
    if (position !== null && getAddress(position.recipient) === me) {
      positions.push(position);
    }
  }

  spinner.succeed(`Found ${positions.length} position(s)`);
  return positions;
}

/// Total still locked across positions. Withdrawn positions carry amount 0 (the contract
/// zeroes it on withdraw), so they fall out of the sum naturally.
export function totalEscrowAmount(positions: readonly { amount: bigint }[]): bigint {
  return positions.reduce((sum, position) => sum + position.amount, 0n);
}

/// Seconds left on a released position's cooldown before it becomes withdrawable.
export function cooldownRemainingSeconds(
  position: Pick<EscrowPositionView, "withdrawAvailableAt">,
  nowSeconds: bigint,
): bigint {
  const remaining = position.withdrawAvailableAt - nowSeconds;
  return remaining > 0n ? remaining : 0n;
}

export function formatCooldown(seconds: bigint): string {
  if (seconds <= 0n) return "0s";
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/// Plain status text for a position, embedding the live cooldown countdown while a
/// released name waits out its cooldown.
export function formatPositionStatus(position: EscrowPositionView, nowSeconds: bigint): string {
  if (position.claimed) return "claimed";
  if (!position.released) return "held";
  const remaining = cooldownRemainingSeconds(position, nowSeconds);
  return remaining > 0n ? `cooldown ${formatCooldown(remaining)}` : "claimable";
}

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

/// Reads the caller's pull-payment ledger balance (withdrawn deposits plus
/// registration-overpayment refunds). This is what `claimWithdrawal` drains and is
/// independent of any open release position.
export async function getPendingWithdrawal(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  recipient: Address,
  spinner: Ora,
): Promise<bigint> {
  spinner.start(`Reading pull-payment balance for ${chalk.white(recipient)}`);
  const balance = await performContractCall<bigint>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingWithdrawal",
    [recipient],
  );
  spinner.succeed(`Pull-payment balance: ${chalk.green(formatWeiAsEther(balance))} PAS`);
  return balance;
}

/// Approves the escrow on the registrar then calls `release`. The caller must own the NFT.
export async function releaseDomain(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  label: string,
  spinner: Ora,
): Promise<{ approveTxHash: string; releaseTxHash: string; tokenId: bigint }> {
  const tokenId = computeDomainTokenId(label);

  spinner.start(`Approving escrow for ${chalk.cyan(label + ".dot")}`);
  const approveTxHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "approve",
    [CONTRACTS.DOTNS_NAME_ESCROW, tokenId],
    originSubstrateAddress,
    signer,
    spinner,
    "Approve escrow",
  );

  spinner.start(`Releasing ${chalk.cyan(label + ".dot")} into escrow`);
  const releaseTxHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "release",
    [tokenId],
    originSubstrateAddress,
    signer,
    spinner,
    "Release",
  );

  spinner.succeed(`Released ${chalk.cyan(label + ".dot")} into escrow`);
  return { approveTxHash, releaseTxHash, tokenId };
}

/// Calls `withdraw` to credit the original depositor's pull-payment balance. Reverts before
/// the per-position cooldown elapses.
export async function withdrawDomain(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  label: string,
  spinner: Ora,
): Promise<string> {
  const tokenId = computeDomainTokenId(label);

  spinner.start(`Withdrawing ${chalk.cyan(label + ".dot")} from escrow`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "withdraw",
    [tokenId],
    originSubstrateAddress,
    signer,
    spinner,
    "Withdraw",
  );

  spinner.succeed(`Withdraw queued; call \`escrow claim-withdrawal\` to receive funds.`);
  return txHash;
}

/// Drains the legacy pull-payment ledger that holds registration-overpayment fallbacks. The
/// caller receives the amount accumulated against their address.
export async function claimWithdrawal(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  spinner: Ora,
): Promise<string> {
  spinner.start("Claiming pull-payment ledger balance");
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimWithdrawal",
    [],
    originSubstrateAddress,
    signer,
    spinner,
    "Claim withdrawal",
  );

  spinner.succeed("Withdrawal claimed");
  return txHash;
}

/// Reads the caller's pending refund ledger entries within a paginated window.
export async function listRefunds(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  recipient: Address,
  offset: number,
  limit: number,
  spinner: Ora,
): Promise<RefundsListResult> {
  spinner.start(`Reading refund ledger for ${chalk.white(recipient)}`);

  const total = await performContractCall<bigint>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingRefundCount",
    [recipient],
  );

  const ids = await performContractCall<bigint[]>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingRefundIds",
    [recipient, BigInt(offset), BigInt(limit)],
  );

  const entries = await performContractCall<RawRefundEntry[]>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingRefunds",
    [recipient, BigInt(offset), BigInt(limit)],
  );

  spinner.succeed(
    `Found ${chalk.yellow(total.toString())} entries; page returned ${entries.length}.`,
  );

  return {
    recipient,
    total,
    page: { offset, limit },
    entries: entries.map((entry, index) => ({
      entryId: ids[index] ?? 0n,
      recipient: entry.recipient,
      amount: entry.amount,
      availableAt: entry.availableAt,
      tokenId: entry.tokenId,
    })),
  };
}

/// Claims a single refund-ledger entry. Reverts before its independent cooldown elapses.
export async function claimRefund(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  entryId: bigint,
  spinner: Ora,
): Promise<string> {
  spinner.start(`Claiming refund entry #${chalk.yellow(entryId.toString())}`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimRefund",
    [entryId],
    originSubstrateAddress,
    signer,
    spinner,
    "Claim refund",
  );
  spinner.succeed(`Refund #${entryId.toString()} claimed`);
  return txHash;
}

/// Batched single-call claim for several entries. Each entry's cooldown is checked
/// independently; the call reverts atomically if any one entry is still locked.
export async function claimRefundsBatch(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  entryIds: bigint[],
  spinner: Ora,
): Promise<string> {
  spinner.start(`Claiming ${chalk.yellow(entryIds.length)} refund entries`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimRefundsBatch",
    [entryIds],
    originSubstrateAddress,
    signer,
    spinner,
    "Claim refunds (batch)",
  );
  spinner.succeed(`Batch claimed`);
  return txHash;
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
