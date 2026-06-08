import chalk from "chalk";
import type { Ora } from "ora";
import { type Address } from "viem";
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

/// Reads the current release position for a name. Returns null when the slot is empty.
export async function viewEscrowPosition(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  spinner: Ora,
): Promise<EscrowPositionView | null> {
  const tokenId = computeDomainTokenId(label);
  spinner.start(`Reading escrow position for ${chalk.cyan(label + ".dot")}`);

  const raw = await performContractCall<RawReleasePosition>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "getReleasePosition",
    [tokenId],
  );

  if (raw.recipient === ZERO_ADDRESS && raw.amount === 0n && !raw.released) {
    spinner.succeed(`No escrow position for ${chalk.cyan(label + ".dot")}`);
    return null;
  }

  spinner.succeed(`Position for ${chalk.cyan(label + ".dot")}`);

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
