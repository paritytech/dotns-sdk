import { getChainAPI } from "@parity/product-sdk-chain-client";

type ChainClient = Awaited<ReturnType<typeof getChainAPI<"paseo">>>;

let chainPromise: Promise<ChainClient> | null = null;

export const getChainClient = (): Promise<ChainClient> => {
  if (!chainPromise) {
    chainPromise = getChainAPI("paseo");
  }
  return chainPromise;
};

export function destroyChainClient(): void {
  if (chainPromise) {
    void chainPromise.then((c) => {
      try {
        c.destroy();
      } catch {
        /* already destroyed */
      }
    });
    chainPromise = null;
  }
}
