import { paseo, type Paseo } from "@polkadot-api/descriptors";
import { createClient, type TypedApi } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";

let clientInstance: TypedApi<Paseo> | null = null;

export const useTypeClientAPI = async (rpcEndPoints: string[]): Promise<TypedApi<Paseo>> => {
  clientInstance = createClient(getWsProvider(rpcEndPoints)).getTypedApi(paseo);

  return clientInstance;
};
