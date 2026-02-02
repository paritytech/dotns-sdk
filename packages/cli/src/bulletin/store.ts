import { Binary } from "@polkadot-api/substrate-bindings";
import { createClient as createPolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import ora, { type Ora } from "ora";
import chalk from "chalk";

import { CID_CONFIG, createCidFromData } from "./cid";
import { createTransactionStatusHandler } from "../utils/formatting";
import { bulletin } from "@polkadot-api/descriptors";

const MAX_TX_SIZE = 8 * 1024 * 1024;

export type StoredChunkResult = { rootCid: string };
export type BulletinStoreResult = { cid: string; storedIndex?: string };
export type PolkadotApiSigner = {
  signTx: (...args: any[]) => any;
};

export function chunkBytes(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) throw new Error("chunkSize must be > 0");
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push(bytes.slice(i, i + chunkSize));
  return chunks;
}

function assertSigner(signer: any): asserts signer is PolkadotApiSigner {
  if (!signer || typeof signer.signTx !== "function") {
    throw new Error(
      "Invalid signer: expected a polkadot-api signer (missing signTx). Ensure Bulletin uses getPolkadotSigner(...)",
    );
  }
}

async function store(params: {
  rpc: string;
  signer: PolkadotApiSigner;
  bytes: Uint8Array;
  codec: number;
  hashCode: number;
  spinner: Ora;
  operationName: string;
  emitStatus: boolean;
}): Promise<BulletinStoreResult> {
  const { rpc, signer, bytes, codec, hashCode, spinner, operationName, emitStatus } = params;

  assertSigner(signer);

  if (bytes.length > MAX_TX_SIZE) {
    spinner.fail(`Payload ${bytes.length} bytes exceeds 8MB tx limit`);
    throw new Error(`Payload ${bytes.length} bytes exceeds 8MB tx limit`);
  }

  const cid = await createCidFromData({ data: bytes, codec, hashCode });

  const client = createPolkadotClient(withPolkadotSdkCompat(getWsProvider(rpc)));
  const api = client.getTypedApi(bulletin);

  if (!api.tx.TransactionStorage?.store) {
    client.destroy();
    throw new Error("TransactionStorage.store is not available");
  }

  const storeTx = api.tx.TransactionStorage.store({ data: Binary.fromBytes(bytes) });

  const updateStatus = emitStatus
    ? createTransactionStatusHandler(spinner, operationName)
    : undefined;

  return await new Promise((resolve, reject) => {
    const sub = storeTx.signSubmitAndWatch(signer as any).subscribe({
      next: (event) => {
        switch (event.type) {
          case "signed":
            updateStatus?.("signing");
            break;
          case "broadcasted":
            updateStatus?.("broadcasting");
            break;
          case "txBestBlocksState":
            updateStatus?.("included");
            break;
          case "finalized":
            if (event.ok) {
              const storedEvent = event.events.find(
                (e: any) => e.type === "TransactionStorage" && e.value.type === "Stored",
              );
              const storedIndex = storedEvent?.value?.value?.index?.toString?.();

              updateStatus?.("finalized");

              sub.unsubscribe();
              client.destroy();
              resolve({ cid, storedIndex });
              return;
            } else {
              updateStatus?.("failed");

              let msg = "Transaction failed";
              if (event.dispatchError?.type === "Module") {
                const moduleError = event.dispatchError.value as {
                  type: string;
                  value?: { type: string };
                };
                msg = `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
              }

              sub.unsubscribe();
              client.destroy();
              reject(new Error(msg));
              return;
            }
        }
      },
      error: (err) => {
        updateStatus?.("failed");
        sub.unsubscribe();
        client.destroy();
        reject(err);
      },
    });
  });
}

export async function storeSingleToBulletin(params: {
  rpc: string;
  signer: PolkadotApiSigner;
  bytes: Uint8Array;
}): Promise<BulletinStoreResult> {
  const cid = await createCidFromData({
    data: params.bytes,
    codec: CID_CONFIG.codecRaw,
    hashCode: CID_CONFIG.hashCodeBlake2b256,
  });

  console.log(chalk.gray("  cid:  ") + cid);
  console.log(chalk.gray("  size: ") + `${params.bytes.length} bytes`);

  const spinner = ora("Storing to bulletin").start();

  try {
    const res = await store({
      rpc: params.rpc,
      signer: params.signer,
      bytes: params.bytes,
      codec: CID_CONFIG.codecRaw,
      hashCode: CID_CONFIG.hashCodeBlake2b256,
      spinner,
      operationName: "store",
      emitStatus: true,
    });

    return res;
  } catch (error) {
    if (spinner.isSpinning) spinner.fail("Store failed");
    throw error;
  }
}

export async function storeChunkedToBulletin(params: {
  rpc: string;
  signer: PolkadotApiSigner;
  chunks: Uint8Array[];
}): Promise<StoredChunkResult> {
  const dagPB = await import("@ipld/dag-pb");
  const { UnixFS } = await import("ipfs-unixfs");
  const { CID } = await import("multiformats/cid");

  const spinner = ora(`Storing chunks (0/${params.chunks.length})`).start();
  const stored: Array<{ cid: string; len: number }> = [];

  try {
    for (let i = 0; i < params.chunks.length; i++) {
      const chunk = params.chunks[i];
      if (!chunk) throw new Error(`Chunk ${i} is undefined`);

      spinner.text = `Storing chunks (${i + 1}/${params.chunks.length})`;

      const r = await store({
        rpc: params.rpc,
        signer: params.signer,
        bytes: chunk,
        codec: CID_CONFIG.codecRaw,
        hashCode: CID_CONFIG.hashCodeSha2_256,
        spinner,
        operationName: "store chunk",
        emitStatus: false,
      });

      stored.push({ cid: r.cid, len: chunk.length });
    }

    spinner.text = "Building root DAG-PB";
    const blockSizes = stored.map((c) => BigInt(c.len));
    const fileData = new UnixFS({ type: "file", blockSizes });

    const dagNode = dagPB.prepare({
      Data: fileData.marshal(),
      Links: stored.map((c) => ({ Name: "", Tsize: c.len, Hash: CID.parse(c.cid) })),
    });

    const dagBytes = dagPB.encode(dagNode);

    spinner.text = "Storing root";

    const root = await store({
      rpc: params.rpc,
      signer: params.signer,
      bytes: dagBytes,
      codec: CID_CONFIG.codecDagPb,
      hashCode: CID_CONFIG.hashCodeSha2_256,
      spinner,
      operationName: "store root",
      emitStatus: false,
    });

    spinner.succeed("Chunks stored");
    console.log(chalk.gray("  root cid: ") + chalk.cyan(root.cid));

    return { rootCid: root.cid };
  } catch (error) {
    if (spinner.isSpinning) spinner.fail("Chunked store failed");
    throw error;
  }
}