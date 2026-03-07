import { Binary } from "@polkadot-api/substrate-bindings";
import { createClient as createPolkadotClient } from "polkadot-api";
import type { PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";
import { createRawCid, createDagPbCid, CODEC, HASH } from "./cid";
import type {
  HashingEnumVariant,
  StoreContentParameters,
  BulletinStoreResult,
  StoreSingleFileParameters,
  StoreChunkedFileParameters,
  ChunkedStoreResult,
  StoreBlockParameters,
} from "../types/types";

const MAXIMUM_TRANSACTION_SIZE = 8 * 1024 * 1024;

export function createBulletinClient(rpc: string): PolkadotClient {
  return createPolkadotClient(withPolkadotSdkCompat(getWsProvider(rpc)));
}

function convertHashCodeToEnum(hashCode: number): HashingEnumVariant {
  switch (hashCode) {
    case HASH.SHA2_256:
      return { type: "Sha2_256", value: undefined };
    case HASH.BLAKE2B_256:
      return { type: "Blake2b256", value: undefined };
    default:
      throw new Error(`Unsupported hash code: 0x${hashCode.toString(16)}`);
  }
}

export function splitBytesIntoChunks(sourceBytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) {
    throw new Error("Chunk size must be greater than zero");
  }

  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < sourceBytes.length; offset += chunkSize) {
    chunks.push(sourceBytes.slice(offset, offset + chunkSize));
  }

  return chunks;
}

async function storeContentOnBulletin(
  parameters: StoreContentParameters,
): Promise<BulletinStoreResult> {
  const {
    rpc,
    signer,
    contentBytes,
    contentCid,
    codecValue,
    hashCodeValue,
    nonce,
    onProgress,
    client: externalClient,
    waitForFinalization = true,
  } = parameters;

  if (contentBytes.length > MAXIMUM_TRANSACTION_SIZE) {
    throw new Error(
      `Content size ${contentBytes.length} bytes exceeds maximum transaction size of 8MB`,
    );
  }

  const isExternalClient = !!externalClient;
  const client = externalClient ?? createBulletinClient(rpc);
  const typedApi = client.getTypedApi(bulletin);

  if (!typedApi.tx.TransactionStorage?.store_with_cid_config) {
    if (!isExternalClient) client.destroy();
    throw new Error("TransactionStorage.store_with_cid_config is not available on this chain");
  }

  const storeTransaction = typedApi.tx.TransactionStorage.store_with_cid_config({
    cid: {
      codec: BigInt(codecValue),
      hashing: convertHashCodeToEnum(hashCodeValue),
    },
    data: Binary.fromBytes(contentBytes),
  });

  const transactionOptions: Record<string, unknown> = {};

  if (nonce !== undefined) {
    transactionOptions.nonce = nonce;
  }

  return new Promise((resolve, reject) => {
    const subscription = storeTransaction
      .signSubmitAndWatch(signer as never, transactionOptions)
      .subscribe({
        next: (event) => {
          switch (event.type) {
            case "signed":
              onProgress?.("signing");
              break;
            case "broadcasted":
              onProgress?.("broadcasting");
              break;
            case "txBestBlocksState":
              onProgress?.("included");
              if (!waitForFinalization && event.found) {
                if (event.ok) {
                  const storedEvent = event.events.find(
                    (eventItem: { type: string; value: { type: string } }) =>
                      eventItem.type === "TransactionStorage" && eventItem.value.type === "Stored",
                  );
                  const storedIndex = (
                    storedEvent?.value as { value?: { index?: { toString?: () => string } } }
                  )?.value?.index?.toString?.();
                  subscription.unsubscribe();
                  if (!isExternalClient) client.destroy();
                  resolve({ cid: contentCid, storedIndex });
                } else {
                  let errorMessage = "Transaction failed";
                  if (event.dispatchError?.type === "Module") {
                    const moduleError = event.dispatchError.value as {
                      type: string;
                      value?: { type: string };
                    };
                    errorMessage = `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
                  }
                  subscription.unsubscribe();
                  if (!isExternalClient) client.destroy();
                  reject(new Error(errorMessage));
                }
              }
              break;
            case "finalized":
              if (event.ok) {
                const storedEvent = event.events.find(
                  (eventItem: { type: string; value: { type: string } }) =>
                    eventItem.type === "TransactionStorage" && eventItem.value.type === "Stored",
                );
                const storedIndex = (
                  storedEvent?.value as { value?: { index?: { toString?: () => string } } }
                )?.value?.index?.toString?.();
                onProgress?.("finalized");
                subscription.unsubscribe();
                if (!isExternalClient) client.destroy();
                resolve({ cid: contentCid, storedIndex });
              } else {
                let errorMessage = "Transaction failed";
                if (event.dispatchError?.type === "Module") {
                  const moduleError = event.dispatchError.value as {
                    type: string;
                    value?: { type: string };
                  };
                  errorMessage = `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
                }
                subscription.unsubscribe();
                if (!isExternalClient) client.destroy();
                reject(new Error(errorMessage));
              }
              break;
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          if (!isExternalClient) client.destroy();
          reject(error);
        },
      });
  });
}

export async function storeSingleFileToBulletin(
  parameters: StoreSingleFileParameters,
): Promise<BulletinStoreResult> {
  const cidObject = createRawCid(parameters.contentBytes, HASH.SHA2_256);
  const cidString = cidObject.toString();

  return storeContentOnBulletin({
    rpc: parameters.rpc,
    signer: parameters.signer,
    contentBytes: parameters.contentBytes,
    contentCid: cidString,
    codecValue: CODEC.RAW,
    hashCodeValue: HASH.SHA2_256,
    onProgress: parameters.onProgress,
    client: parameters.client,
  });
}

export async function storeChunkedFileToBulletin(
  parameters: StoreChunkedFileParameters,
): Promise<ChunkedStoreResult> {
  const dagPbModule = await import("@ipld/dag-pb");
  const { UnixFS } = await import("ipfs-unixfs");
  const { CID } = await import("multiformats/cid");

  const storedChunks: Array<{ cid: string; length: number }> = [];
  const totalChunks = parameters.contentChunks.length;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const currentChunk = parameters.contentChunks[chunkIndex];
    if (!currentChunk) {
      throw new Error(`Chunk at index ${chunkIndex} is undefined`);
    }

    parameters.onProgress?.(chunkIndex + 1, totalChunks, "storing");

    const chunkCidObject = createRawCid(currentChunk, HASH.SHA2_256);
    const chunkCidString = chunkCidObject.toString();

    const storeResult = await storeContentOnBulletin({
      rpc: parameters.rpc,
      signer: parameters.signer,
      contentBytes: currentChunk,
      contentCid: chunkCidString,
      codecValue: CODEC.RAW,
      hashCodeValue: HASH.SHA2_256,
      client: parameters.client,
    });

    storedChunks.push({ cid: storeResult.cid, length: currentChunk.length });
  }

  parameters.onProgress?.(totalChunks, totalChunks, "building root");

  const blockSizes = storedChunks.map((chunk) => BigInt(chunk.length));
  const unixfsFileData = new UnixFS({ type: "file", blockSizes });

  const dagPbNode = dagPbModule.prepare({
    Data: unixfsFileData.marshal(),
    Links: storedChunks.map((chunk) => ({
      Name: "",
      Tsize: chunk.length,
      Hash: CID.parse(chunk.cid),
    })),
  });

  const dagPbBytes = dagPbModule.encode(dagPbNode);
  const rootCidObject = createDagPbCid(dagPbBytes, HASH.SHA2_256);
  const rootCidString = rootCidObject.toString();

  parameters.onProgress?.(totalChunks, totalChunks, "storing root");

  await storeContentOnBulletin({
    rpc: parameters.rpc,
    signer: parameters.signer,
    contentBytes: dagPbBytes,
    contentCid: rootCidString,
    codecValue: CODEC.DAG_PB,
    hashCodeValue: HASH.SHA2_256,
    client: parameters.client,
  });

  return { rootCid: rootCidString };
}

export async function storeBlockToBulletin(
  parameters: StoreBlockParameters,
): Promise<BulletinStoreResult> {
  return storeContentOnBulletin({
    rpc: parameters.rpc,
    signer: parameters.signer,
    contentBytes: parameters.contentBytes,
    contentCid: parameters.contentCid,
    codecValue: parameters.codecValue,
    hashCodeValue: parameters.hashCodeValue,
    nonce: parameters.nonce,
    client: parameters.client,
    waitForFinalization: parameters.waitForFinalization,
  });
}

export type BatchBlock = {
  contentBytes: Uint8Array;
  contentCid: string;
  codecValue: number;
  hashCodeValue: number;
};

export type StoreBatchParameters = {
  rpc: string;
  signer: Parameters<
    ReturnType<
      ReturnType<PolkadotClient["getTypedApi"]>["tx"]["Utility"]["batch_all"]
    >["signSubmitAndWatch"]
  >[0];
  blocks: BatchBlock[];
  nonce?: number;
  client?: PolkadotClient;
  waitForFinalization?: boolean;
  onProgress?: (status: string) => void;
};

export async function storeBatchedBlocksToBulletin(
  parameters: StoreBatchParameters,
): Promise<{ cids: string[] }> {
  const {
    rpc,
    signer,
    blocks,
    nonce,
    client: externalClient,
    waitForFinalization = true,
    onProgress,
  } = parameters;

  const isExternalClient = !!externalClient;
  const client = externalClient ?? createBulletinClient(rpc);
  const typedApi = client.getTypedApi(bulletin);

  const calls = blocks.map(
    (block) =>
      typedApi.tx.TransactionStorage.store_with_cid_config({
        cid: {
          codec: BigInt(block.codecValue),
          hashing: convertHashCodeToEnum(block.hashCodeValue),
        },
        data: Binary.fromBytes(block.contentBytes),
      }).decodedCall,
  );

  const batchTransaction = typedApi.tx.Utility.batch_all({ calls });

  const transactionOptions: Record<string, unknown> = {};
  if (nonce !== undefined) {
    transactionOptions.nonce = nonce;
  }

  const cids = blocks.map((b) => b.contentCid);

  return new Promise((resolve, reject) => {
    const subscription = batchTransaction
      .signSubmitAndWatch(signer as never, transactionOptions)
      .subscribe({
        next: (event) => {
          switch (event.type) {
            case "signed":
              onProgress?.("signing");
              break;
            case "broadcasted":
              onProgress?.("broadcasting");
              break;
            case "txBestBlocksState":
              onProgress?.("included");
              if (!waitForFinalization && event.found) {
                if (event.ok) {
                  subscription.unsubscribe();
                  if (!isExternalClient) client.destroy();
                  resolve({ cids });
                } else {
                  let errorMessage = "Batch transaction failed";
                  if (event.dispatchError?.type === "Module") {
                    const moduleError = event.dispatchError.value as {
                      type: string;
                      value?: { type: string };
                    };
                    errorMessage = `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
                  }
                  subscription.unsubscribe();
                  if (!isExternalClient) client.destroy();
                  reject(new Error(errorMessage));
                }
              }
              break;
            case "finalized":
              if (event.ok) {
                onProgress?.("finalized");
                subscription.unsubscribe();
                if (!isExternalClient) client.destroy();
                resolve({ cids });
              } else {
                let errorMessage = "Batch transaction failed";
                if (event.dispatchError?.type === "Module") {
                  const moduleError = event.dispatchError.value as {
                    type: string;
                    value?: { type: string };
                  };
                  errorMessage = `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
                }
                subscription.unsubscribe();
                if (!isExternalClient) client.destroy();
                reject(new Error(errorMessage));
              }
              break;
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          if (!isExternalClient) client.destroy();
          reject(error);
        },
      });
  });
}

export async function fetchAccountNonce(rpc: string, accountAddress: string): Promise<number> {
  const WebSocketConstructor = globalThis.WebSocket ?? (await import("ws")).default;

  return new Promise((resolve, reject) => {
    const websocket = new WebSocketConstructor(rpc);
    const requestId = Date.now();

    websocket.onopen = () => {
      websocket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "system_accountNextIndex",
          params: [accountAddress],
        }),
      );
    };

    websocket.onmessage = (messageEvent: { data: string | { toString: () => string } }) => {
      try {
        const messageData =
          typeof messageEvent.data === "string" ? messageEvent.data : messageEvent.data.toString();
        const response = JSON.parse(messageData);

        if (response.id === requestId) {
          websocket.close();
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result as number);
          }
        }
      } catch (parseError) {
        websocket.close();
        reject(parseError);
      }
    };

    websocket.onerror = (errorEvent: unknown) => {
      websocket.close();
      reject(errorEvent);
    };
  });
}
