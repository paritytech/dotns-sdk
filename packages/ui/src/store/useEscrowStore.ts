import { defineStore } from "pinia";
import { zeroAddress, type Address, type Hash } from "viem";
import {
  getContract,
  getEscrowContract,
  withContractRecovery,
  WRITE_TX_DEFAULTS,
} from "@/composables/useContracts";
import { NAME_ESCROW_ADDRESS } from "@/lib/abis/nameEscrow";
import { useWalletStore } from "./useWalletStore";
import type { TxStatus } from "@parity/product-sdk-tx";
import { mapTxStatus } from "@/lib/txStatus";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";

export type EscrowPosition = {
  domain: string;
  tokenId: bigint;
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

export type RefundEntry = {
  entryId: bigint;
  recipient: Address;
  amount: bigint;
  availableAt: bigint;
  tokenId: bigint;
};

export type RefundLedger = {
  total: bigint;
  entries: RefundEntry[];
};

type RawPosition = {
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint | number;
  released: boolean;
  claimed: boolean;
};

type RawRefund = {
  recipient: Address;
  amount: bigint;
  availableAt: bigint | number;
  tokenId: bigint;
};

export const useEscrowStore = defineStore("useEscrowStore", () => {
  const walletStore = useWalletStore();

  function relayStatus(status: TxStatus): void {
    walletStore.setTransactionStatus(mapTxStatus(status));
  }

  function tokenIdFor(domain: string): bigint {
    return computeDomainTokenId(normalizeDomainName(domain));
  }

  // Reads the release position for a name; null when no position is recorded.
  async function getPosition(domain: string): Promise<EscrowPosition | null> {
    return withContractRecovery(async () => {
      const escrow = await getEscrowContract();
      const tokenId = tokenIdFor(domain);
      const result = await escrow.getReleasePosition!.query(tokenId, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const raw = result.value as RawPosition;
      if (raw.recipient === zeroAddress && raw.amount === 0n && !raw.released) {
        return null;
      }
      return {
        domain: normalizeDomainName(domain),
        tokenId,
        recipient: raw.recipient,
        asset: raw.asset,
        amount: raw.amount,
        withdrawAvailableAt: BigInt(raw.withdrawAvailableAt),
        released: raw.released,
        claimed: raw.claimed,
      };
    });
  }

  // Reads a paginated window of the caller's pending refund ledger. pendingRefunds
  // returns both ids and entries, so a single read is sufficient.
  async function listRefunds(
    recipient: Address,
    offset: number,
    limit: number,
  ): Promise<RefundLedger> {
    return withContractRecovery(async () => {
      const escrow = await getEscrowContract();
      const countResult = await escrow.pendingRefundCount!.query(recipient, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      const total = countResult.success ? (countResult.value as bigint) : 0n;

      const pageResult = await escrow.pendingRefunds!.query(
        recipient,
        BigInt(offset),
        BigInt(limit),
        {
          origin: ZERO_SUBSTRATE_ADDRESS,
        },
      );
      if (!pageResult.success) return { total, entries: [] };

      const page = pageResult.value as { entryIds: bigint[]; entries: RawRefund[] };
      const entries = page.entries.map((entry, index) => ({
        entryId: page.entryIds[index] ?? 0n,
        recipient: entry.recipient,
        amount: entry.amount,
        availableAt: BigInt(entry.availableAt),
        tokenId: entry.tokenId,
      }));
      return { total, entries };
    });
  }

  // Approves the escrow on the registrar then releases the NFT, starting the
  // refund cooldown. The caller must own the name.
  async function release(domain: string): Promise<Hash> {
    await walletStore.ensureSignerReady();
    const tokenId = tokenIdFor(domain);
    try {
      const registrar = await getContract("@dotns/registrar");
      const approveResult = await registrar.approve!.tx(NAME_ESCROW_ADDRESS, tokenId, txOptions());
      if (!approveResult.ok) {
        throw new Error(
          `Approve reverted: ${JSON.stringify(approveResult.dispatchError ?? "unknown")}`,
        );
      }

      const escrow = await getEscrowContract();
      const releaseResult = await escrow.release!.tx(tokenId, txOptions());
      if (!releaseResult.ok) {
        throw new Error(
          `Release reverted: ${JSON.stringify(releaseResult.dispatchError ?? "unknown")}`,
        );
      }
      return releaseResult.txHash as Hash;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function withdraw(domain: string): Promise<Hash> {
    return runWrite((escrow) => escrow.withdraw!.tx(tokenIdFor(domain), txOptions()), "Withdraw");
  }

  async function claimWithdrawal(): Promise<Hash> {
    return runWrite((escrow) => escrow.claimWithdrawal!.tx(txOptions()), "Claim withdrawal");
  }

  async function claimRefund(entryId: bigint): Promise<Hash> {
    return runWrite((escrow) => escrow.claimRefund!.tx(entryId, txOptions()), "Claim refund");
  }

  async function claimRefundsBatch(entryIds: bigint[]): Promise<Hash> {
    return runWrite(
      (escrow) => escrow.claimRefundsBatch!.tx(entryIds, txOptions()),
      "Claim refunds",
    );
  }

  function txOptions() {
    return { ...WRITE_TX_DEFAULTS, onStatus: relayStatus };
  }

  // Single-write helper: ensures the signer, runs the escrow call, and surfaces a
  // revert as a thrown error. Keeps the simple single-extrinsic writes DRY.
  async function runWrite(
    call: (escrow: Awaited<ReturnType<typeof getEscrowContract>>) => Promise<{
      ok: boolean;
      txHash: string;
      dispatchError?: unknown;
    }>,
    label: string,
  ): Promise<Hash> {
    await walletStore.ensureSignerReady();
    try {
      const escrow = await getEscrowContract();
      const result = await call(escrow);
      if (!result.ok) {
        throw new Error(`${label} reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      return result.txHash as Hash;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  return {
    getPosition,
    listRefunds,
    release,
    withdraw,
    claimWithdrawal,
    claimRefund,
    claimRefundsBatch,
  };
});
