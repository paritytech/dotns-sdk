import { useWalletStore } from "@/store/useWalletStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useAbiStore } from "@/store/useAbiStore";
import { useDomainStore } from "@/store/useDomainStore";
import { useBulletinStore } from "@/store/useBulletinStore";

/**
 * Centralized application initialization service
 * Manages ordered startup of all stores
 */
export class AppInitializer {
  private static initialized = false;

  /**
   * Initialize all application stores in correct dependency order
   */
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

      const abiStore = useAbiStore();
      await abiStore.loadABIs();

      // Phase 2: Initialize network client (depends on ABIs)
      const networkStore = useNetworkStore();
      await networkStore.initClient();

      await walletStore.init();

      // REMOVE AUTO-CONNECT: Do not connect wallet automatically
      // Phase 4: Post-connection initialization (depends on wallet)
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

  /**
   * Reset initialization state (useful for testing)
   */
  static reset(): void {
    this.initialized = false;
  }

  /**
   * Check if app has been initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }
}
