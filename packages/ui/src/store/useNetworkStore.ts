import { defineStore } from "pinia";
import { ref } from "vue";
import { DEFAULT_NETWORK_ID, getFirstDeployedNetwork, SUPPORTED_NETWORKS } from "../utils";
import type { NetworkConfig, Deployment } from "@/type";
import { zeroAddress } from "viem";
import { ReviveClientWrapper, type IReviveClientWrapper } from "@/composables";
import { destroyChainClient, getChainClient } from "@/composables/useTypedAPI";

export const useNetworkStore = defineStore("useNetworkStore", () => {
  const chainId = ref<number | null>(null);

  const currentNetwork = ref<(NetworkConfig & Partial<Deployment>) | null>(null);

  const client = ref<IReviveClientWrapper | null>(null);

  async function createIfMissing(): Promise<void> {
    if (!client.value) {
      const selectedNetwork = currentNetwork.value || getFirstDeployedNetwork();
      if (!selectedNetwork) {
        throw new Error("No valid network found for initialization");
      }

      console.log(
        "[NetworkStore:createIfMissing] Initializing client for",
        selectedNetwork.chainName,
      );

      const chain = await getChainClient();
      client.value = new ReviveClientWrapper(chain.assetHub);

      if (!currentNetwork.value) {
        currentNetwork.value = selectedNetwork;
        chainId.value = selectedNetwork.chainId;
      }
    }
  }

  function hasValidContracts(network: NetworkConfig & Partial<Deployment>): boolean {
    return !!(
      network.storeFactory &&
      network.storeFactory !== zeroAddress &&
      network.dotnsRegistry &&
      network.dotnsRegistry !== zeroAddress &&
      network.dotnsRegistrarController &&
      network.dotnsRegistrarController !== zeroAddress &&
      network.dotnsRegistrar &&
      network.dotnsRegistrar !== zeroAddress &&
      network.multiCall &&
      network.multiCall !== zeroAddress
    );
  }

  async function initClient(network?: NetworkConfig & Partial<Deployment>): Promise<void> {
    try {
      const targetNetwork = network || getFirstDeployedNetwork();
      if (!targetNetwork) {
        throw new Error("No valid network found for initialization");
      }

      console.log("[NetworkStore:initClient] Initializing client for", targetNetwork.chainName);
      console.time("[NetworkStore:initClient]");

      // Create new Polkadot API client
      const chain = await getChainClient();
      client.value = new ReviveClientWrapper(chain.assetHub);

      console.timeEnd("[NetworkStore:initClient]");

      // Update network state
      if (!currentNetwork.value) {
        currentNetwork.value = targetNetwork;
        chainId.value = targetNetwork.chainId;
        console.log("[NetworkStore:initClient] Network set to", {
          chainId: chainId.value,
          name: currentNetwork.value.chainName,
        });
      }
    } catch (error) {
      console.warn("[NetworkStore:initClient]", error);
      throw error;
    }
  }

  async function switchNetwork(targetChainId: number = DEFAULT_NETWORK_ID): Promise<boolean> {
    try {
      const targetNetwork = SUPPORTED_NETWORKS[targetChainId];
      if (!targetNetwork) {
        throw new Error(`Network with chainId ${targetChainId} not found`);
      }

      console.log("[NetworkStore:switchNetwork] Switching to", targetNetwork.chainName);

      // Update network state
      chainId.value = targetChainId;
      currentNetwork.value = targetNetwork;

      // Initialize new client
      await initClient(targetNetwork);

      console.log("[NetworkStore:switchNetwork] Switch successful");
      return true;
    } catch (error) {
      console.warn("[NetworkStore:switchNetwork]", error);
      return false;
    }
  }

  async function getClient(): Promise<IReviveClientWrapper> {
    await createIfMissing();
    if (!client.value) {
      throw new Error("Failed to initialize client");
    }
    return client.value;
  }

  // Tear down the chain client singleton + wrapper and rebuild from scratch.
  // Used as a last-ditch recovery when the chainHead_follow subscription is
  // observed dead (RpcError "No active follow"). PAPI v2's typed API doesn't
  // auto-recover from this — a fresh follow has to be initiated.
  async function resetClient(): Promise<IReviveClientWrapper> {
    destroyChainClient();
    client.value = null;
    await createIfMissing();
    if (!client.value) {
      throw new Error("Failed to reset client");
    }
    return client.value;
  }

  function ensureClient(): void {
    if (!client.value) {
      throw new Error("Client not initialized - call initClient() or getClient() first");
    }
    if (!currentNetwork.value) {
      throw new Error("Network not configured");
    }
  }

  return {
    chainId,
    currentNetwork,
    hasValidContracts,
    initClient,
    switchNetwork,
    getClient,
    resetClient,
    ensureClient,
  };
});
