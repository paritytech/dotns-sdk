import { ref } from "vue";
import { zeroAddress, type Address } from "viem";
import { useWalletStore } from "@/store/useWalletStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import type { ContractAuthStatus } from "@/type";

export function useStoreAuthGuard() {
  const wallet = useWalletStore();
  const storeManager = useUserStoreManager();

  const showAuthModal = ref(false);
  const authStatuses = ref<ContractAuthStatus[]>([]);
  const authLoading = ref(false);
  const authProgress = ref("");
  const authError = ref("");

  let pendingAction: (() => void) | null = null;

  async function checkAuthAndProceed(onAuthorized: () => void): Promise<void> {
    if (!wallet.isConnected || !wallet.evmAddress) {
      onAuthorized();
      return;
    }

    try {
      const storeAddress = await storeManager.getUserStore(wallet.evmAddress as Address);
      if (storeAddress === zeroAddress) {
        onAuthorized();
        return;
      }

      const statuses = await storeManager.getAuthorizationStatus(storeAddress);
      const unauthorized = statuses.filter((c) => !c.authorized);

      if (unauthorized.length === 0) {
        onAuthorized();
        return;
      }

      authStatuses.value = statuses;
      authError.value = "";
      authProgress.value = "";
      pendingAction = onAuthorized;
      showAuthModal.value = true;
    } catch {
      onAuthorized();
    }
  }

  async function handleAuthSubmit(
    changes: { address: Address; authorize: boolean }[],
  ): Promise<void> {
    if (!wallet.evmAddress || changes.length === 0) return;

    const storeAddress = await storeManager.getUserStore(wallet.evmAddress as Address);
    if (storeAddress === zeroAddress) return;

    authLoading.value = true;
    authError.value = "";
    authProgress.value =
      changes.length === 1
        ? `${changes[0]!.authorize ? "Authorizing" : "Revoking"} contract…`
        : `Batching ${changes.length} authorization changes…`;

    try {
      await storeManager.batchAuthChanges(storeAddress, changes);

      for (const change of changes) {
        const contract = authStatuses.value.find((c) => c.address === change.address);
        if (contract) {
          contract.authorized = change.authorize;
        }
      }

      showAuthModal.value = false;
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      authError.value = `Authorization failed: ${msg}`;
    } finally {
      authLoading.value = false;
      authProgress.value = "";
    }
  }

  function handleAuthClose() {
    showAuthModal.value = false;
    pendingAction = null;
  }

  return {
    showAuthModal,
    authStatuses,
    authLoading,
    authProgress,
    authError,
    checkAuthAndProceed,
    handleAuthSubmit,
    handleAuthClose,
  };
}
