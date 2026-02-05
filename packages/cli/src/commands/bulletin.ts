import chalk from "chalk";
import ora from "ora";
import { promises as filesystem } from "node:fs";
import path from "node:path";
import type { PolkadotClient, PolkadotSigner } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";
import { importer } from "ipfs-unixfs-importer";
import { Readable } from "node:stream";
import type { CID } from "multiformats/cid";
import { encodeIpfsContenthash } from "../bulletin/cid";
import {
  hasIpfsCli,
  merkleizeWithIpfs,
  verifyMultipleCids,
  verifyCidResolution,
} from "../bulletin/ipfs";
import {
  storeSingleFileToBulletin,
  splitBytesIntoChunks,
  storeChunkedFileToBulletin,
  fetchAccountNonce,
  storeBlockToBulletin,
} from "../bulletin/store";
import type {
  ValidatePathResult,
  AuthorizeAccountOptions,
  AuthorizeAccountResult,
  StoreDirectoryOptions,
  StoreDirectoryResult,
} from "../types/types";

const DEFAULT_AUTHORIZATION_TRANSACTIONS = 1000000;
const DEFAULT_AUTHORIZATION_BYTES = BigInt(1099511627776);
const DEFAULT_VERIFICATION_GATEWAY = "https://ipfs.dotspark.app";

type MerkleizedBlock = {
  cid: CID;
  bytes: Uint8Array;
};

function formatBytesAsHumanReadable(bytesValue: bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let numericValue = Number(bytesValue);
  let unitIndex = 0;

  while (numericValue >= 1024 && unitIndex < units.length - 1) {
    numericValue /= 1024;
    unitIndex++;
  }

  return `${numericValue.toFixed(2)} ${units[unitIndex]}`;
}

function isLocalChainEndpoint(rpcUrl: string): boolean {
  return rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost");
}

async function* traverseDirectoryRecursively(
  directoryPath: string,
): AsyncGenerator<{ path: string; content: Uint8Array }> {
  const directoryEntries = await filesystem.readdir(directoryPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const fullPath = path.join(directoryPath, entry.name);
    const relativePath = entry.name;

    if (entry.isDirectory()) {
      for await (const nestedFile of traverseDirectoryRecursively(fullPath)) {
        yield { path: `${relativePath}/${nestedFile.path}`, content: nestedFile.content };
      }
    } else if (entry.isFile()) {
      const fileContent = new Uint8Array(await filesystem.readFile(fullPath));
      yield { path: relativePath, content: fileContent };
    }
  }
}

async function merkleizeDirectoryIntoBlocks(
  directoryPath: string,
): Promise<{ rootCid: CID; blocks: MerkleizedBlock[] }> {
  const collectedBlocks: MerkleizedBlock[] = [];
  let rootContentCid: CID | undefined;

  const inMemoryBlockstore = {
    put: async (contentCid: CID, contentBytes: Uint8Array): Promise<CID> => {
      collectedBlocks.push({ cid: contentCid, bytes: contentBytes });
      return contentCid;
    },
    get: async (contentCid: CID): Promise<Uint8Array> => {
      const foundBlock = collectedBlocks.find((block) => block.cid.equals(contentCid));
      if (!foundBlock) {
        throw new Error(`Block not found: ${contentCid}`);
      }
      return foundBlock.bytes;
    },
  };

  const collectedFiles: { path: string; content: Uint8Array }[] = [];
  for await (const file of traverseDirectoryRecursively(directoryPath)) {
    collectedFiles.push(file);
  }

  const importerSource = collectedFiles.map((file) => ({
    path: file.path,
    content: Readable.from([file.content]),
  }));

  for await (const importedEntry of importer(importerSource, inMemoryBlockstore, {
    wrapWithDirectory: true,
    cidVersion: 1,
    rawLeaves: true,
  })) {
    rootContentCid = importedEntry.cid;
  }

  if (!rootContentCid) {
    throw new Error("Failed to merkleize directory: no root CID produced");
  }

  return { rootCid: rootContentCid, blocks: collectedBlocks };
}

export async function validateAndReadPath(inputPath: string): Promise<ValidatePathResult> {
  const spinner = ora("Validating path").start();

  try {
    const resolvedPath = path.resolve(inputPath);
    const pathStats = await filesystem.stat(resolvedPath);

    if (pathStats.isDirectory()) {
      spinner.succeed("Directory validated");
      return { bytes: new Uint8Array(), isDirectory: true, resolvedPath };
    }

    if (pathStats.isFile()) {
      spinner.text = "Reading file";
      const fileBytes = new Uint8Array(await filesystem.readFile(resolvedPath));
      spinner.succeed("File validated");
      return { bytes: fileBytes, isDirectory: false, resolvedPath };
    }

    spinner.fail("Path validation failed");
    throw new Error(`Path is neither a file nor a directory: ${resolvedPath}`);
  } catch (error) {
    spinner.fail("Path validation failed");
    throw error;
  }
}

export async function authorizeAccount(
  options: AuthorizeAccountOptions,
): Promise<AuthorizeAccountResult> {
  const {
    rpc,
    sudoSigner,
    targetAddress,
    transactions = DEFAULT_AUTHORIZATION_TRANSACTIONS,
    bytes = DEFAULT_AUTHORIZATION_BYTES,
  } = options;

  const spinner = ora("Authorizing account").start();
  let client: PolkadotClient | undefined;
  let txHash = "";

  try {
    client = createClient(withPolkadotSdkCompat(getWsProvider(rpc)));
    const typedApi = client.getTypedApi(bulletin);

    if (!typedApi.tx.Sudo?.sudo) {
      throw new Error("Sudo pallet is not available on this chain");
    }

    const sudoTransaction = typedApi.tx.Sudo.sudo({
      call: {
        type: "TransactionStorage",
        value: {
          type: "authorize_account",
          value: { who: targetAddress, transactions, bytes },
        },
      },
    });

    return await new Promise<AuthorizeAccountResult>((resolve, reject) => {
      const subscription = sudoTransaction.signSubmitAndWatch(sudoSigner).subscribe({
        next: (event) => {
          switch (event.type) {
            case "signed":
              spinner.text = "Authorization: signing";
              break;
            case "broadcasted":
              spinner.text = "Authorization: broadcasting";
              txHash = event.txHash;
              break;
            case "txBestBlocksState":
              if (event.found) {
                spinner.text = "Authorization: included";
                subscription.unsubscribe();
                client?.destroy();
                spinner.succeed("Account authorized");
                console.log(chalk.gray("  target:       ") + chalk.cyan(targetAddress));
                console.log(
                  chalk.gray("  transactions: ") + chalk.white(transactions.toLocaleString()),
                );
                console.log(
                  chalk.gray("  bytes:        ") + chalk.white(formatBytesAsHumanReadable(bytes)),
                );
                resolve({ txHash, blockHash: event.block.hash });
              }
              break;
            case "finalized":
              if (event.ok) {
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
      throw new Error(`Authorization failed: The signer does not have sudo privileges.`);
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
    const typedApi = client.getTypedApi(bulletin);
    const authorizationState = await typedApi.query.TransactionStorage.Authorizations.getValue({
      type: "Account",
      value: accountAddress,
    });

    if (authorizationState) {
      return {
        authorized: true,
        transactions: authorizationState.extent.transactions,
        bytes: authorizationState.extent.bytes,
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
  if (!isLocalChainEndpoint(bulletinRpc)) {
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
      return;
    }

    console.log(chalk.yellow(`  Authorization warning: ${errorMessage.split("\n")[0]}`));
  }
}

export async function uploadSingleBlock(
  bulletinRpc: string,
  signer: PolkadotSigner,
  fileBytes: Uint8Array,
): Promise<string> {
  const spinner = ora("Storing to Bulletin").start();

  try {
    const storeResult = await storeSingleFileToBulletin({
      rpc: bulletinRpc,
      signer,
      contentBytes: fileBytes,
      onProgress: (status) => {
        spinner.text = `Storing: ${status}`;
      },
    });

    spinner.succeed("Stored");
    spinner.info("Verifying upload...");
    const results = await verifySingleFileCid(storeResult.cid);
    if (results.resolvable) {
      console.log(chalk.green("  ✓ CID successfully resolved via gateway"));
    } else {
      console.log(chalk.red("  ✗ CID could not be resolved via gateway"));
    }

    return storeResult.cid;
  } catch (error) {
    spinner.fail("Upload failed");

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Payment")) {
      console.log(chalk.red("\n  Account is not authorized for TransactionStorage."));
      console.log(chalk.yellow("\n  To authorize your account, run:\n"));
      console.log(chalk.gray("    dotns bulletin authorize <your-address>\n"));
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
  const contentChunks = splitBytesIntoChunks(fileBytes, chunkSizeBytes);
  const spinner = ora(`Storing chunks (0/${contentChunks.length})`).start();

  try {
    const storeResult = await storeChunkedFileToBulletin({
      rpc: bulletinRpc,
      signer,
      contentChunks,
      onProgress: (currentChunk, totalChunks, status) => {
        if (status === "storing") {
          spinner.text = `Storing chunks (${currentChunk}/${totalChunks})`;
        } else {
          spinner.text = `${status} (${currentChunk}/${totalChunks})`;
        }
      },
    });

    spinner.succeed("Stored");
    return storeResult.rootCid;
  } catch (error) {
    spinner.fail("Upload failed");

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
  options: StoreDirectoryOptions = {},
): Promise<StoreDirectoryResult> {
  const {
    parallel = false,
    concurrency = 5,
    accountAddress,
    verificationGateway = DEFAULT_VERIFICATION_GATEWAY,
  } = options;

  const merkleSpinner = ora("Merkleizing directory").start();

  try {
    const { rootCid, blocks } = await merkleizeDirectoryIntoBlocks(directoryPath);

    if (hasIpfsCli()) {
      try {
        const ipfsCliResult = merkleizeWithIpfs(directoryPath);
        if (ipfsCliResult.cid !== rootCid.toString()) {
          merkleSpinner.warn("CID mismatch detected between local merkleization and IPFS CLI");
          console.log(chalk.red("  IPFS CLI: ") + chalk.white(ipfsCliResult.cid));
          console.log(chalk.red("  Local:    ") + chalk.white(rootCid.toString()));
        }
      } catch {
        // IPFS CLI verification is optional
      }
    }

    const totalSizeBytes = blocks.reduce((sum, block) => sum + block.bytes.length, 0);
    merkleSpinner.succeed("Merkleized");
    console.log(chalk.gray("  blocks:   ") + chalk.white(blocks.length.toString()));
    console.log(
      chalk.gray("  size:     ") + chalk.white(`${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`),
    );
    console.log(chalk.gray("  root cid: ") + chalk.cyan(rootCid.toString()));

    for (const block of blocks) {
      const codecHexString = `0x${block.cid.code.toString(16)}`;
      const hashCodeHexString = `0x${block.cid.multihash.code.toString(16)}`;
      const isRootBlock = block.cid.toString() === rootCid.toString();
      console.log(
        chalk.gray("    → ") +
          chalk.white(block.cid.toString().slice(0, 20) + "...") +
          chalk.gray(
            ` codec=${codecHexString} hash=${hashCodeHexString} size=${block.bytes.length}`,
          ) +
          (isRootBlock ? chalk.green(" (root)") : ""),
      );
    }

    const storeSpinner = ora(`Storing blocks (0/${blocks.length})`).start();
    let completedBlockCount = 0;

    if (parallel && accountAddress) {
      const startingNonce = await fetchAccountNonce(bulletinRpc, accountAddress);

      const blocksWithAssignedNonces = blocks.map((block, index) => ({
        block,
        nonce: startingNonce + index,
      }));

      const processBlockUpload = async (block: MerkleizedBlock, nonce: number) => {
        const codecValue = block.cid.code;
        const hashCodeValue = block.cid.multihash.code;

        await storeBlockToBulletin({
          rpc: bulletinRpc,
          signer,
          contentBytes: block.bytes,
          contentCid: block.cid.toString(),
          codecValue,
          hashCodeValue,
          nonce,
        });

        completedBlockCount++;
        storeSpinner.text = `Storing blocks (${completedBlockCount}/${blocks.length})`;
      };

      const pendingQueue = [...blocksWithAssignedNonces];
      const executingPromises: Promise<void>[] = [];

      while (pendingQueue.length > 0 || executingPromises.length > 0) {
        while (executingPromises.length < concurrency && pendingQueue.length > 0) {
          const queueItem = pendingQueue.shift()!;
          const uploadPromise = processBlockUpload(queueItem.block, queueItem.nonce).then(() => {
            executingPromises.splice(executingPromises.indexOf(uploadPromise), 1);
          });
          executingPromises.push(uploadPromise);
        }

        if (executingPromises.length > 0) {
          await Promise.race(executingPromises);
        }
      }
    } else {
      for (const block of blocks) {
        const codecValue = block.cid.code;
        const hashCodeValue = block.cid.multihash.code;

        await storeBlockToBulletin({
          rpc: bulletinRpc,
          signer,
          contentBytes: block.bytes,
          contentCid: block.cid.toString(),
          codecValue,
          hashCodeValue,
        });

        completedBlockCount++;
        storeSpinner.text = `Storing blocks (${completedBlockCount}/${blocks.length})`;
      }
    }

    storeSpinner.succeed("Stored");

    const verifySpinner = ora("Verifying content resolution").start();
    const rootCidString = rootCid.toString();

    const blockCids = blocks.map((block) => block.cid.toString());
    const verificationResult = await verifyMultipleCids(blockCids, verificationGateway);

    if (verificationResult.missingBlocks.length === 0) {
      verifySpinner.succeed("All blocks resolvable");
    } else {
      verifySpinner.warn(
        `${verificationResult.missingBlocks.length}/${verificationResult.totalBlocks} blocks not yet resolvable`,
      );
      console.log(chalk.gray("  gateway:  ") + chalk.white(verificationGateway));
      console.log(chalk.yellow("  Content may take time to propagate through the network"));
    }

    return { storageCid: rootCidString, ipfsCid: rootCidString };
  } catch (error) {
    merkleSpinner.fail("Directory upload failed");
    throw error;
  }
}

export async function verifySingleFileCid(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<{ resolvable: boolean; gateway: string; statusCode?: number }> {
  const verificationResult = await verifyCidResolution(contentCid, gatewayBaseUrl);

  return {
    resolvable: verificationResult.resolvable,
    gateway: verificationResult.gateway,
    statusCode: verificationResult.statusCode,
  };
}

export function generateContenthash(contentCid: string): string {
  return encodeIpfsContenthash(contentCid);
}
