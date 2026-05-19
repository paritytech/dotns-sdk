import { useWalletStore } from "@/store/useWalletStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useDomainStore } from "@/store/useDomainStore";
import { useBulletinStore } from "@/store/useBulletinStore";

/**
 * Centralized application initialization service
 * Manages ordered startup of all stores
 */
export class AppInitializer {
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[AppInitializer] Already initialized, skipping");
      return;
    }

    console.log("[AppInitializer] Starting initialization");

    try {
      const walletStore = useWalletStore();
      walletStore.setTransactionStatus("idle");
      useBulletinStore().resetUploadState();

      // Set chain metadata (chainName, blockExplorer, etc.) used by UI. The
      // chain client itself is initialized lazily by useContracts on the
      // first contract call — no eager connect here.
      const networkStore = useNetworkStore();
      await networkStore.initClient();

      await walletStore.init();

      if (walletStore.isConnected && walletStore.evmAddress) {
        const domainStore = useDomainStore();
        const popStatus = await domainStore.userPopStatus(walletStore.evmAddress);
        walletStore.userPopState = popStatus;
      }

      this.initialized = true;
      console.log("[AppInitializer] Initialization complete");
    } catch (error) {
      console.error("[AppInitializer] Initialization failed:", error);
      throw error;
    }
  }

  static reset(): void {
    this.initialized = false;
  }

  static isInitialized(): boolean {
    return this.initialized;
  }
}
