import { getChainAPI } from "@parity/product-sdk-chain-client";

type ChainClient = Awaited<ReturnType<typeof getChainAPI<"paseo">>>;

let chainPromise: Promise<ChainClient> | null = null;

export const getChainClient = (): Promise<ChainClient> => {
  if (!chainPromise) {
    chainPromise = (async () => {
      const chain = await getChainAPI("paseo");
      // Prime chainHead_follow before returning. PAPI v2's typed API uses
      // chainHead operations under the hood; if the first downstream query
      // races the subscription, it errors with "No active follow for this
      // chain". A single cheap query forces the subscription to be live by
      // the time anyone else uses the client.
      await chain.assetHub.query.System.Number.getValue();
      return chain;
    })();
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
