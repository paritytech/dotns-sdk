import { paseo, type Paseo } from "@polkadot-api/descriptors";
import { createClient, type PolkadotClient, type TypedApi } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";

let rawClient: PolkadotClient | null = null;
let typedApiInstance: TypedApi<Paseo> | null = null;
let currentRpcKey: string | null = null;

export const useTypeClientAPI = async (rpcEndPoints: string[]): Promise<TypedApi<Paseo>> => {
  const rpcKey = rpcEndPoints.join(",");

  if (typedApiInstance && currentRpcKey === rpcKey) {
    return typedApiInstance;
  }

  if (rawClient) {
    try {
      rawClient.destroy();
    } catch {
      /* already destroyed */
    }
    rawClient = null;
    typedApiInstance = null;
  }

  rawClient = createClient(withPolkadotSdkCompat(getWsProvider(rpcEndPoints)));
  typedApiInstance = rawClient.getTypedApi(paseo);
  currentRpcKey = rpcKey;

  return typedApiInstance;
};

export function destroyTypeClientAPI(): void {
  if (rawClient) {
    try {
      rawClient.destroy();
    } catch {
      /* already destroyed */
    }
    rawClient = null;
    typedApiInstance = null;
    currentRpcKey = null;
  }
}
