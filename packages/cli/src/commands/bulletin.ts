import chalk from "chalk";
import ora from "ora";
import { encodeIpfsContenthash } from "../bulletin/cid";
import { chunkBytes, storeChunkedToBulletin, storeSingleToBulletin } from "../bulletin/store";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PolkadotClient, PolkadotSigner } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";
import { createTransactionStatusHandler } from "../utils/formatting";
import { importer } from "ipfs-unixfs-importer";
import { CarWriter } from "@ipld/car";
import { Readable } from "node:stream";

const DEFAULT_AUTH_TRANSACTIONS = 1000000;
const DEFAULT_AUTH_BYTES = BigInt(1099511627776);

export interface AuthorizeAccountOptions {
  rpc: string;
  sudoSigner: PolkadotSigner;
  targetAddress: string;
  transactions?: number;
  bytes?: bigint;
}

export interface AuthorizeAccountResult {
  txHash: string;
  blockHash: string;
}

export interface ValidatePathResult {
  bytes: Uint8Array;
  isDirectory: boolean;
  resolvedPath: string;
}

export interface StoreDirectoryResult {
  storageCid: string;
  ipfsCid: string;
}

interface Block {
  cid: any;
  bytes: Uint8Array;
}

function formatBytes(bytes: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function isLocalChain(rpcUrl: string): boolean {
  return rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
}

async function* walkDirectory(dirPath: string): AsyncGenerator<{ path: string; content: Uint8Array }> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = entry.name;

    if (entry.isDirectory()) {
      for await (const file of walkDirectory(fullPath)) {
        yield { path: `${relativePath}/${file.path}`, content: file.content };
      }
    } else if (entry.isFile()) {
      const content = new Uint8Array(await fs.readFile(fullPath));
      yield { path: relativePath, content };
    }
  }
}

async function merkleizeDirectory(dirPath: string): Promise<{ rootCid: any; carBytes: Uint8Array }> {
  const blocks: Block[] = [];
  let rootCid: any;

  const blockstore = {
    put: async (cid: any, bytes: Uint8Array) => {
      blocks.push({ cid, bytes });
    },
    get: async (cid: any) => {
      const block = blocks.find((b) => b.cid.equals(cid));
      if (!block) throw new Error(`Block not found: ${cid}`);
      return block.bytes;
    },
  };

  const files: { path: string; content: Uint8Array }[] = [];
  for await (const file of walkDirectory(dirPath)) {
    files.push(file);
  }

  const source = files.map((f) => ({
    path: f.path,
    content: Readable.from([f.content]),
  }));

  for await (const entry of importer(source, blockstore, {
    wrapWithDirectory: true,
    cidVersion: 1,
    rawLeaves: true,
  })) {
    rootCid = entry.cid;
  }

  if (!rootCid) {
    throw new Error("Failed to merkleize directory");
  }

  const { writer, out } = CarWriter.create([rootCid]);

  const carChunks: Uint8Array[] = [];
  const collectCar = (async () => {
    for await (const chunk of out) {
      carChunks.push(chunk);
    }
  })();

  for (const block of blocks) {
    await writer.put(block);
  }
  await writer.close();
  await collectCar;

  const totalLength = carChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const carBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of carChunks) {
    carBytes.set(chunk, offset);
    offset += chunk.length;
  }

  return { rootCid, carBytes };
}

export async function validateAndReadPath(inputPath: string): Promise<ValidatePathResult> {
  const spinner = ora("Validating path").start();

  try {
    const resolvedPath = path.resolve(inputPath);
    const stats = await fs.stat(resolvedPath);

    if (stats.isDirectory()) {
      spinner.succeed("Directory validated");
      return { bytes: new Uint8Array(), isDirectory: true, resolvedPath };
    }

    if (stats.isFile()) {
      spinner.text = "Reading file";
      const fileBytes = new Uint8Array(await fs.readFile(resolvedPath));
      spinner.succeed("File validated and read");
      return { bytes: fileBytes, isDirectory: false, resolvedPath };
    }

    spinner.fail("Path validation failed");
    throw new Error(`Not a file or directory: ${resolvedPath}`);
  } catch (error) {
    spinner.fail("Path validation failed");
    throw error;
  }
}

export async function authorizeAccount(options: AuthorizeAccountOptions): Promise<AuthorizeAccountResult> {
  const {
    rpc,
    sudoSigner,
    targetAddress,
    transactions = DEFAULT_AUTH_TRANSACTIONS,
    bytes = DEFAULT_AUTH_BYTES,
  } = options;

  const spinner = ora("Authorizing account").start();
  let client: PolkadotClient | undefined;
  let txHash = "";

  try {
    client = createClient(withPolkadotSdkCompat(getWsProvider(rpc)));
    const api = client.getTypedApi(bulletin);

    if (!api.tx.Sudo?.sudo) {
      throw new Error("Sudo pallet is not available on this chain");
    }

    const sudoTx = api.tx.Sudo.sudo({
      call: {
        type: "TransactionStorage",
        value: {
          type: "authorize_account",
          value: {
            who: targetAddress,
            transactions,
            bytes,
          },
        },
      },
    });

    const updateStatus = createTransactionStatusHandler(spinner, "authorization");

    return await new Promise<AuthorizeAccountResult>((resolve, reject) => {
      const subscription = sudoTx.signSubmitAndWatch(sudoSigner).subscribe({
        next: (event) => {
          switch (event.type) {
            case "signed":
              updateStatus("signing");
              break;
            case "broadcasted":
              updateStatus("broadcasting");
              txHash = event.txHash;
              break;
            case "txBestBlocksState":
              if (event.found) {
                updateStatus("included");
                subscription.unsubscribe();
                client?.destroy();
                spinner.succeed("Account authorized");
                console.log(chalk.gray("  target:       ") + chalk.cyan(targetAddress));
                console.log(chalk.gray("  transactions: ") + chalk.white(transactions.toLocaleString()));
                console.log(chalk.gray("  bytes:        ") + chalk.white(formatBytes(bytes)));
                console.log(chalk.gray("  tx:           ") + chalk.white(txHash));
                console.log(chalk.gray("  block:        ") + chalk.white(event.block.hash));
                resolve({ txHash, blockHash: event.block.hash });
              }
              break;
            case "finalized":
              if (event.ok) {
                updateStatus("finalized");
                subscription.unsubscribe();
                client?.destroy();
                spinner.succeed("Account authorized");
                resolve({ txHash, blockHash: event.block.hash });
              } else {
                subscription.unsubscribe();
                client?.destroy();
                spinner.fail("Authorization failed");
                reject(new Error("Authorization transaction failed"));
              }
              break;
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          client?.destroy();
          spinner.fail("Authorization failed");
          reject(error);
        },
      });
    });
  } catch (error) {
    client?.destroy();
    spinner.fail("Authorization failed");

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("AlreadyAuthorized")) {
      console.log(chalk.yellow("  Account is already authorized"));
      return { txHash: "", blockHash: "" };
    }

    if (errorMessage.includes("BadOrigin")) {
      throw new Error(
        `Authorization failed: The signer does not have sudo privileges.\n` +
          `Use a sudo account like //Alice to authorize accounts.`,
      );
    }

    throw error;
  }
}

export async function checkAuthorization(
  rpc: string,
  accountAddress: string,
): Promise<{ authorized: boolean; transactions?: number; bytes?: bigint }> {
  const client = createClient(withPolkadotSdkCompat(getWsProvider(rpc)));

  try {
    const api = client.getTypedApi(bulletin);
    const authState = await api.query.TransactionStorage.Authorizations.getValue({
      type: "Account",
      value: accountAddress,
    });

    if (authState) {
      return {
        authorized: true,
        transactions: authState.extent.transactions,
        bytes: authState.extent.bytes,
      };
    }

    return { authorized: false };
  } catch {
    return { authorized: false };
  } finally {
    client.destroy();
  }
}

export async function ensureAccountAuthorized(
  bulletinRpc: string,
  signer: PolkadotSigner,
  accountAddress: string,
): Promise<void> {
  if (!isLocalChain(bulletinRpc)) {
    return;
  }

  try {
    await authorizeAccount({
      rpc: bulletinRpc,
      sudoSigner: signer,
      targetAddress: accountAddress,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("AlreadyAuthorized") || errorMessage.includes("Sudid")) {
      console.log(chalk.gray("  Already authorized"));
      return;
    }

    console.log(chalk.yellow(`  Authorization warning: ${errorMessage.split("\n")[0]}`));
    console.log(chalk.gray("  Proceeding - storage may fail with Payment error"));
  }
}

export async function uploadSingleBlock(
  bulletinRpc: string,
  signer: PolkadotSigner,
  fileBytes: Uint8Array,
): Promise<string> {
  const spinner = ora("Uploading to Bulletin").start();

  try {
    const result = await storeSingleToBulletin({
      rpc: bulletinRpc,
      signer,
      bytes: fileBytes,
    });

    spinner.succeed("Upload complete");

    console.log(chalk.gray("  stored:   ") + chalk.green("ok"));
    if (result.storedIndex !== undefined && result.storedIndex !== null) {
      console.log(chalk.gray("  index:    ") + chalk.white(String(result.storedIndex)));
    }

    return result.cid;
  } catch (error) {
    spinner.fail("Upload failed");

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Payment")) {
      console.log(chalk.red("\n  Account is not authorized for TransactionStorage."));
      console.log(chalk.yellow("\n  To authorize your account, run:\n"));
      console.log(chalk.gray("    dotns bulletin authorize <your-address> --key-uri //Alice\n"));
      console.log(chalk.gray("  Or upload directly with a pre-authorized account:\n"));
      console.log(chalk.gray("    dotns bulletin upload <file> --key-uri //Alice\n"));
    }

    throw error;
  }
}

export async function uploadChunkedBlocks(
  bulletinRpc: string,
  signer: PolkadotSigner,
  fileBytes: Uint8Array,
  chunkSizeBytes: number,
): Promise<string> {
  const chunks = chunkBytes(fileBytes, chunkSizeBytes);
  console.log(chalk.gray("  chunks:   ") + chalk.white(String(chunks.length)));

  const spinner = ora("Uploading chunks to Bulletin").start();

  try {
    const result = await storeChunkedToBulletin({
      rpc: bulletinRpc,
      signer,
      chunks,
    });

    spinner.succeed("Chunks uploaded");
    console.log(chalk.gray("  stored:   ") + chalk.green("ok (dag-pb root)"));

    return result.rootCid;
  } catch (error) {
    spinner.fail("Chunked upload failed");

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Payment")) {
      console.log(chalk.red("\n  Account is not authorized for TransactionStorage."));
      console.log(chalk.yellow("\n  To authorize your account, run:\n"));
      console.log(chalk.gray("    dotns bulletin authorize <your-address> --key-uri //Alice\n"));
    }

    throw error;
  }
}

export async function storeDirectory(
  bulletinRpc: string,
  signer: PolkadotSigner,
  directoryPath: string,
  chunkSizeBytes: number,
): Promise<StoreDirectoryResult> {
  const spinner = ora("Merkleizing directory").start();

  try {
    const { rootCid, carBytes } = await merkleizeDirectory(directoryPath);
    const ipfsCid = rootCid.toString();

    spinner.succeed(`CAR file created (${(carBytes.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(chalk.gray("  ipfs cid: ") + chalk.cyan(ipfsCid));

    const storageCid = await uploadChunkedBlocks(bulletinRpc, signer, carBytes, chunkSizeBytes);

    return { storageCid, ipfsCid };
  } catch (error) {
    spinner.fail("Directory upload failed");
    throw error;
  }
}

export async function generateAndDisplayContenthash(cid: string): Promise<void> {
  const spinner = ora("Generating contenthash").start();

  try {
    const contenthash = await encodeIpfsContenthash(cid);
    spinner.succeed("Contenthash generated");
    console.log(chalk.gray("  contenthash: ") + chalk.cyan(contenthash));
  } catch (error) {
    spinner.fail("Contenthash generation failed");
    throw error;
  }
}