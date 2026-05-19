import { defineStore } from "pinia";
import { ref } from "vue";
import { getFirstDeployedNetwork } from "../utils";
import type { NetworkConfig } from "@/type";
import { destroyChainClient } from "@/composables/useTypedAPI";

// Slim network store. After the v2 ContractManager migration, contract
// addresses live in cdm.json and the chain client is owned by useContracts.
// This store only carries chain-level metadata (chainName, nativeCurrency,
// blockExplorerUrls) that the UI consults for display, plus a `resetClient`
// hook used by withContractRecovery as a last-ditch chainHead recovery.

export const useNetworkStore = defineStore("useNetworkStore", () => {
  const chainId = ref<number | null>(null);
  const currentNetwork = ref<NetworkConfig | null>(null);

  async function initClient(network?: NetworkConfig): Promise<void> {
    try {
      const targetNetwork = network || getFirstDeployedNetwork();
      if (!targetNetwork) throw new Error("No valid network found for initialization");
      currentNetwork.value = targetNetwork;
      chainId.value = targetNetwork.chainId;
      console.log("[NetworkStore:initClient] Network set to", {
        chainId: chainId.value,
        name: currentNetwork.value.chainName,
      });
    } catch (error) {
      console.warn("[NetworkStore:initClient]", error);
      throw error;
    }
  }

  function resetClient(): void {
    destroyChainClient();
  }

  return {
    chainId,
    currentNetwork,
    initClient,
    resetClient,
  };
});
