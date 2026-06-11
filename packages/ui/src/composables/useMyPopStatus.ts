import { ref, watch } from "vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useDomainStore } from "@/store/useDomainStore";
import { PopStatus } from "@/type";

// Reactive Proof-of-Personhood tier for the connected wallet. Null only when no
// wallet is connected; once connected it always resolves to a tier (defaulting to
// NoStatus while the chain read is pending or unavailable) so the badge is never
// blank. Shared so the wallet badge and the search gating read one source.
export function useMyPopStatus() {
  const wallet = useWalletStore();
  const domainStore = useDomainStore();
  const popStatus = ref<PopStatus | null>(null);

  async function refresh(): Promise<void> {
    if (!wallet.isConnected) {
      popStatus.value = null;
      return;
    }
    popStatus.value = PopStatus.NoStatus;
    const evm = wallet.evmAddress;
    if (!evm) return;
    try {
      popStatus.value = await domainStore.userPopStatus(evm);
    } catch {
      /* keep NoStatus when the read fails */
    }
  }

  watch(() => [wallet.isConnected, wallet.evmAddress], refresh, { immediate: true });

  return { popStatus, refreshPopStatus: refresh };
}
