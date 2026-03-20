import type { AbiName } from "@/type";
import { defineStore } from "pinia";
import type { Abi } from "viem";

export const useAbiStore = defineStore("useAbiStore", () => {
  let DotnsRegistrarControllerABI: Abi;
  let DotnsRegistrarABI: Abi;
  let DotnsResolverABI: Abi;
  let DotnsReverseResolverABI: Abi;
  let DotnsContentResolverABI: Abi;
  let StoreFactoryABI: Abi;
  let StoreABI: Abi;
  let PopOracleABI: Abi;
  let MultiCallABI: Abi;
  let DotnsRegistryABI: Abi;
  async function loadABIs(): Promise<void> {
    if (DotnsRegistrarControllerABI) return;

    const [
      DotnsRegistrarController,
      DotnsRegistrar,
      DotnsResolver,
      DotnsReverseResolver,
      DotnsContentResolver,
      StoreFactory,
      Store,
      PopOracle,
      MultiCall,
      DotnsRegistry,
    ] = await Promise.all([
      import("../../abis/DotnsRegistrarController.json"),
      import("../../abis/DotnsRegistrar.json"),
      import("../../abis/DotnsResolver.json"),
      import("../../abis/DotnsReverseResolver.json"),
      import("../../abis/DotnsContentResolver.json"),
      import("../../abis/StoreFactory.json"),
      import("../../abis/Store.json"),
      import("../../abis/PopRules.json"),
      import("../../abis/MultiCall3.json"),
      import("../../abis/DotnsRegistry.json"),
    ]);

    DotnsRegistrarControllerABI = DotnsRegistrarController.abi as Abi;
    DotnsRegistrarABI = DotnsRegistrar.abi as Abi;
    DotnsResolverABI = DotnsResolver.abi as Abi;
    DotnsReverseResolverABI = DotnsReverseResolver.abi as Abi;
    DotnsContentResolverABI = DotnsContentResolver.abi as Abi;
    StoreFactoryABI = StoreFactory.abi as Abi;
    StoreABI = Store.abi as Abi;
    PopOracleABI = PopOracle.abi as Abi;
    MultiCallABI = MultiCall as Abi;
    DotnsRegistryABI = DotnsRegistry.abi as Abi;
  }

  function getABI(name: AbiName): Abi {
    const abis: Record<AbiName, Abi> = {
      DotnsRegistrarController: DotnsRegistrarControllerABI,
      DotnsRegistrar: DotnsRegistrarABI,
      DotnsResolver: DotnsResolverABI,
      DotnsReverseResolver: DotnsReverseResolverABI,
      DotnsContentResolver: DotnsContentResolverABI,
      StoreFactory: StoreFactoryABI,
      Store: StoreABI,
      PopRules: PopOracleABI,
      MultiCall: MultiCallABI,
      DotnsRegistry: DotnsRegistryABI,
    };
    return abis[name];
  }

  async function ensureAbis(): Promise<void> {
    if (!DotnsRegistrarControllerABI) {
      await loadABIs();
    }
  }

  return {
    loadABIs,
    getABI,
    ensureAbis,
  };
});
