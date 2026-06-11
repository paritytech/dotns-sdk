import { defineStore } from "pinia";
import { zeroAddress, type Address, type Hash } from "viem";
import { getContract, getEscrowContract, withContractRecovery } from "@/composables/useContracts";
import { NAME_ESCROW_ADDRESS } from "@/lib/abis/nameEscrow";
import { useContractWrite } from "@/lib/contractWrite";
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

  async function withdraw(domain: string): Promise<Hash> {
    return withWrite(async () =>
      submitWrite(
        (await getEscrowContract()).withdraw!.tx(tokenIdFor(domain), txOptions()),
        "Withdraw",
      ),
    );
  }

  async function claimWithdrawal(): Promise<Hash> {
    return withWrite(async () =>
      submitWrite((await getEscrowContract()).claimWithdrawal!.tx(txOptions()), "Claim withdrawal"),
    );
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
    getPosition,
    listRefunds,
    release,
    withdraw,
    claimWithdrawal,
    claimRefund,
    claimRefundsBatch,
  };
});
