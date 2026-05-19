import { defineStore } from "pinia";
import { ref } from "vue";
import { type Address, type Hash } from "viem";
import { useWalletStore } from "./useWalletStore";
import { useNetworkStore } from "./useNetworkStore";
import type { GenericTransaction } from "@/type";
import type { IReviveClientWrapper, TransactionStatus } from "@/composables";
import type { PolkadotSigner } from "polkadot-api";

const isNoActiveFollow = (err: unknown): boolean =>
  (err instanceof Error ? err.message : String(err)).includes("No active follow");

export const useTransactionStore = defineStore("useTransactionStore", () => {
  const walletStore = useWalletStore();
  const networkStore = useNetworkStore();

  const pendingTxs = ref<Map<Hash, { status: TransactionStatus; timestamp: number }>>(new Map());

  async function ethCall(
    client: IReviveClientWrapper,
    originSs58: string,
    to: Address,
    data: `0x${string}`,
    value: bigint = 0n,
  ): Promise<`0x${string}`> {
    const fallback: `0x${string}` = "0x";

    try {
      walletStore.setIsLoading(true);

      if (!client) throw new Error("Client not initialised");

      // Recovery ladder for transient/dead chainHead_follow subscriptions.
      // PAPI v2's typed API doesn't auto-recover from "No active follow", which
      // commonly fires after host modals pause the WebView. We give it three
      // chances: original client → original after 250 ms → fresh client after
      // tearing down + rebuilding the chain singleton.
      let callResult;
      let activeClient = client;
      try {
        callResult = await activeClient.performDryRunCall(originSs58, to, value, data);
      } catch (err1) {
        if (!isNoActiveFollow(err1)) throw err1;
        await new Promise((r) => setTimeout(r, 250));
        try {
          callResult = await activeClient.performDryRunCall(originSs58, to, value, data);
        } catch (err2) {
          if (!isNoActiveFollow(err2)) throw err2;
          console.warn("[TransactionStore:ethCall] chainHead disjoint, resetting client");
          activeClient = await networkStore.resetClient();
          callResult = await activeClient.performDryRunCall(originSs58, to, value, data);
        }
      }

      if (callResult.result.isErr) {
        console.warn(
          `[TransactionStore:ethCall] reverted to=${to} flags=${callResult.result.value.flags} data=${callResult.result.value.data}`,
        );
        return fallback;
      }

      if (!callResult.result.isOk) return fallback;

      return (callResult.result.value.data ?? fallback) as `0x${string}`;
    } catch (error) {
      console.warn("[TransactionStore:ethCall] Exception:", error);
      return fallback;
    } finally {
      walletStore.setIsLoading(false);
    }
  }

  async function ethTransact(
    client: IReviveClientWrapper,
    injected: PolkadotSigner,
    originSs58: string,
    tx: GenericTransaction,
  ): Promise<Hash> {
    try {
      if (!client) throw new Error("Client not initialised");
      if (!tx.to) throw new Error("Transaction missing 'to' address");
      if (!tx.data) throw new Error("Transaction missing 'data'");

      const hash = await client.submitTransaction(
        tx.to,
        tx.value ?? 0n,
        tx.data,
        originSs58,
        injected,
        (status) => walletStore.setTransactionStatus(status),
      );

      return hash;
    } catch (error) {
      console.warn("[TransactionStore:ethTransact] Exception:", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function batchEthTransact(
    client: IReviveClientWrapper,
    injected: PolkadotSigner,
    originSs58: string,
    calls: { to: Address; value?: bigint; data: `0x${string}` }[],
  ): Promise<Hash> {
    try {
      if (!client) throw new Error("Client not initialised");
      if (calls.length === 0) throw new Error("No calls provided");

      const batchCalls = calls.map((call) => {
        if (!call.to) throw new Error("Transaction missing 'to' address");
        if (!call.data) throw new Error("Transaction missing 'data'");
        return { dest: call.to, value: call.value ?? 0n, data: call.data };
      });

      const hash = await client.submitBatchTransaction(batchCalls, originSs58, injected, (status) =>
        walletStore.setTransactionStatus(status),
      );

      return hash;
    } catch (error) {
      console.warn("[TransactionStore:batchEthTransact] Exception:", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  function clearPendingTx(txHash: Hash): void {
    pendingTxs.value.delete(txHash);
  }

  function getPendingTxStatus(txHash: Hash): TransactionStatus | null {
    return pendingTxs.value.get(txHash)?.status ?? null;
  }

  return {
    pendingTxs,
    ethCall,
    ethTransact,
    batchEthTransact,
    clearPendingTx,
    getPendingTxStatus,
  };
});
