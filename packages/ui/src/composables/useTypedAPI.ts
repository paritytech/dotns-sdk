import { paseo, type Paseo } from "@polkadot-api/descriptors";
import { createPapiProvider } from "@novasamatech/product-sdk";
import { createClient, type PolkadotClient, type TypedApi } from "polkadot-api";
import { PASEO_NEXT_ASSET_HUB_GENESIS } from "@/lib/networks";

let rawClient: PolkadotClient | null = null;
let typedApiInstance: TypedApi<Paseo> | null = null;

export const useTypeClientAPI = async (): Promise<TypedApi<Paseo>> => {
  if (typedApiInstance) return typedApiInstance;

  rawClient = createClient(createPapiProvider(PASEO_NEXT_ASSET_HUB_GENESIS));
  typedApiInstance = rawClient.getTypedApi(paseo);
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
  }
}
