import { ref, watch } from "vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useDomainStore } from "@/store/useDomainStore";
import type { PopStatus } from "@/type";

// Reactive Proof-of-Personhood tier for the connected wallet, refetched whenever
// the connection or account changes. Null when no wallet is connected. Shared so
// the wallet badge and the search gating read one source instead of each fetching.
export function useMyPopStatus() {
  const wallet = useWalletStore();
  const domainStore = useDomainStore();
  const popStatus = ref<PopStatus | null>(null);

  async function refresh(): Promise<void> {
    const evm = wallet.evmAddress;
    if (!wallet.isConnected || !evm) {
      popStatus.value = null;
      return;
    }
    try {
      popStatus.value = await domainStore.userPopStatus(evm);
    } catch {
      popStatus.value = null;
    }
  }

  watch(() => [wallet.isConnected, wallet.evmAddress], refresh, { immediate: true });

  return { popStatus, refreshPopStatus: refresh };
}
