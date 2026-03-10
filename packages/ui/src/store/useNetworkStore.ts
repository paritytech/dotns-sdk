import { defineStore } from "pinia";
import { ref } from "vue";
import { DEFAULT_NETWORK_ID, getFirstDeployedNetwork, SUPPORTED_NETWORKS } from "../utils";
import type { NetworkConfig, Deployment } from "@/type";
import { zeroAddress } from "viem";
import { ReviveClientWrapper, type IReviveClientWrapper } from "@/composables";
import { useTypeClientAPI } from "@/composables/useTypedAPI";

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

      const typedApi = await useTypeClientAPI(selectedNetwork.rpcUrls);
      client.value = new ReviveClientWrapper(typedApi);

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
      const typedApi = await useTypeClientAPI(targetNetwork.rpcUrls);
      client.value = new ReviveClientWrapper(typedApi);

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
    ensureClient,
  };
});
