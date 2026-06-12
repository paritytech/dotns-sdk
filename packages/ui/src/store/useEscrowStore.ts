import { defineStore } from "pinia";
import { zeroAddress, type Address, type Hash } from "viem";
import { getContract, getEscrowContract, withContractRecovery } from "@/composables/useContracts";
import { NAME_ESCROW_ADDRESS } from "@/lib/abis/nameEscrow";
import { useContractWrite } from "@/lib/contractWrite";
import { isRefundableDeposit } from "@/lib/escrowStatus";
import { isSameEvmAddress } from "@/lib/address";
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
  const { txOptions, withWrite, submitWrite } = useContractWrite();

  function tokenIdFor(domain: string): bigint {
    return computeDomainTokenId(normalizeDomainName(domain));
  }

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

  // All escrow positions belonging to `recipient`, across the names they hold.
  // Labels are mirror-on-transfer and never deleted, so a released name (now held
  // by the escrow contract) still resolves through the caller's own label set;
  // the recipient filter drops names transferred away whose position rebound to
  // someone else.
  async function listAccountPositions(
    recipient: Address,
    domains: string[],
  ): Promise<EscrowPosition[]> {
    const results = await Promise.all(
      domains.map((domain) => getPosition(domain).catch(() => null)),
    );
    return results.filter(
      (position): position is EscrowPosition =>
        position !== null &&
        isSameEvmAddress(position.recipient, recipient) &&
        isRefundableDeposit(position),
    );
  }

  // pendingRefunds returns ids and entries together, so one read covers the page.
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

  // Caller must own the name: approve the escrow on the registrar, then release.
  async function release(domain: string): Promise<Hash> {
    const tokenId = tokenIdFor(domain);
    return withWrite(async () => {
      const registrar = await getContract("@dotns/registrar");
      await submitWrite(
        registrar.approve!.tx(NAME_ESCROW_ADDRESS, tokenId, txOptions()),
        "Approve",
      );
      const escrow = await getEscrowContract();
      return submitWrite(escrow.release!.tx(tokenId, txOptions()), "Release");
    });
  }

  // Per-name claim: withdraw the released deposit onto the pull-payment ledger,
  // then drain it to the caller in the same signing session. withdraw requires
  // the cooldown to have elapsed; callers gate on the withdrawable state.
  async function withdrawAndClaim(domain: string): Promise<Hash> {
    return withWrite(async () => {
      const escrow = await getEscrowContract();
      await submitWrite(escrow.withdraw!.tx(tokenIdFor(domain), txOptions()), "Withdraw");
      return submitWrite(escrow.claimWithdrawal!.tx(txOptions()), "Claim");
    });
  }

  async function claimRefund(entryId: bigint): Promise<Hash> {
    return withWrite(async () =>
      submitWrite(
        (await getEscrowContract()).claimRefund!.tx(entryId, txOptions()),
        "Claim refund",
      ),
    );
  }

  async function claimRefundsBatch(entryIds: bigint[]): Promise<Hash> {
    return withWrite(async () =>
      submitWrite(
        (await getEscrowContract()).claimRefundsBatch!.tx(entryIds, txOptions()),
        "Claim refunds",
      ),
    );
  }

  return {
    listAccountPositions,
    listRefunds,
    release,
    withdrawAndClaim,
    claimRefund,
    claimRefundsBatch,
  };
});
