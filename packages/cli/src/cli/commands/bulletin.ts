import { Command } from "commander";
import chalk from "chalk";
import type { BulletinUploadOptions, CommandOptions } from "../../types/types";
import {
  validateAndReadPath,
  uploadSingleBlock,
  uploadChunkedBlocks,
  storeDirectory,
  generateAndDisplayContenthash,
  ensureAccountAuthorized,
  authorizeAccount,
} from "../../commands/bulletin";
import {
  addUploadRecord,
  readHistory,
  removeUploadRecord,
  clearHistory,
  getHistoryPath,
  formatRecordTimestamp,
  getPreviewUrl,
} from "../../bulletin/cidHistory";
import { addAuthOptions } from "./auth-options";
import { prepareContext } from "../context";

export const DEFAULT_BULLETIN_RPC = "wss://bulletin.dotspark.app";
export const DEFAULT_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_SINGLE_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_AUTH_TRANSACTIONS = 1000000;
const DEFAULT_AUTH_BYTES = BigInt(1099511627776);

function getMergedOptions(
  command: Command | undefined,
  fallback: BulletinUploadOptions,
): CommandOptions & BulletinUploadOptions {
  const mergedOptions: any = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts();
      for (const key in parentOptions) {
        if (!(key in mergedOptions) && parentOptions[key] !== undefined) {
          mergedOptions[key] = parentOptions[key];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}

function formatBytes(bytes: bigint | number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function attachBulletinCommands(root: Command): void {
  const bulletinCommand = root.command("bulletin").description("Bulletin storage utilities");

  addAuthOptions(bulletinCommand);

  const authorizeCommand = bulletinCommand
    .command("authorize <address>")
    .description("Authorize an account to use TransactionStorage (requires sudo)")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option("--transactions <count>", "Number of transactions to authorize", String(DEFAULT_AUTH_TRANSACTIONS))
    .option("--bytes <count>", "Number of bytes to authorize", String(DEFAULT_AUTH_BYTES));

  addAuthOptions(authorizeCommand).action(
    async (targetAddress: string, options: any, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const transactions = Number(mergedOptions.transactions || DEFAULT_AUTH_TRANSACTIONS);
        const bytes = BigInt(mergedOptions.bytes || DEFAULT_AUTH_BYTES);

        const context = await prepareContext({ ...mergedOptions, useBulletin: true });

        console.log(chalk.blue("\n▶ Bulletin Authorize"));
        console.log(chalk.gray("  target:       ") + chalk.cyan(targetAddress));
        console.log(chalk.gray("  rpc:          ") + chalk.white(bulletinRpc));
        console.log(chalk.gray("  transactions: ") + chalk.white(transactions.toLocaleString()));
        console.log(chalk.gray("  bytes:        ") + chalk.white(formatBytes(bytes)));
        console.log(chalk.gray("  sudo:         ") + chalk.white(context.substrateAddress));

        await authorizeAccount({
          rpc: bulletinRpc,
          sudoSigner: context.signer,
          targetAddress,
          transactions,
          bytes,
        });

        console.log(chalk.green("\n✓ Authorization Complete"));
        console.log(chalk.gray("  The account can now upload to Bulletin.\n"));
        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("AlreadyAuthorized")) {
          console.log(chalk.yellow("\n⚠ Account is already authorized\n"));
          process.exit(0);
        }

        if (errorMessage.includes("BadOrigin")) {
          console.error(chalk.red("\n✗ Authorization failed - insufficient privileges"));
          console.error(chalk.yellow("  The signer does not have sudo privileges."));
          console.error(chalk.gray("  Use a sudo account like //Alice:\n"));
          console.error(chalk.gray(`    dotns bulletin authorize ${targetAddress} --key-uri //Alice\n`));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  const uploadCommand = bulletinCommand
    .command("upload <path>")
    .description("Upload a file or directory to Bulletin and print the resulting CID")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option("--chunk-size <bytes>", "Chunk size for large uploads", String(DEFAULT_CHUNK_SIZE_BYTES))
    .option("--force-chunked", "Force chunked upload (DAG-PB)", false)
    .option("--print-contenthash", "Also print 0x-prefixed IPFS contenthash for the CID", false)
    .option("--no-history", "Do not save upload to history", false);

  addAuthOptions(uploadCommand).action(
    async (inputPath: string, options: BulletinUploadOptions & { history?: boolean }, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const { bytes, isDirectory, resolvedPath } = await validateAndReadPath(inputPath);

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const chunkSizeBytes = Math.max(1, Number(mergedOptions.chunkSize || DEFAULT_CHUNK_SIZE_BYTES));

        const context = await prepareContext({ ...mergedOptions, useBulletin: true });
        await ensureAccountAuthorized(bulletinRpc, context.signer, context.substrateAddress);

        console.log(chalk.blue("\n▶ Bulletin Upload"));
        console.log(chalk.gray("  path:     ") + chalk.white(resolvedPath));
        console.log(chalk.gray("  rpc:      ") + chalk.white(bulletinRpc));

        let cid: string;
        let ipfsCid: string | undefined;
        let uploadSize: number;

        if (isDirectory) {
          console.log(chalk.gray("  mode:     ") + chalk.white("directory (car)"));
          const result = await storeDirectory(bulletinRpc, context.signer, resolvedPath, chunkSizeBytes);
          cid = result.storageCid;
          ipfsCid = result.ipfsCid;
          uploadSize = 0;
        } else if (mergedOptions.forceChunked || bytes.length > MAX_SINGLE_UPLOAD_SIZE_BYTES) {
          console.log(chalk.gray("  size:     ") + chalk.white(`${bytes.length} bytes`));
          console.log(chalk.gray("  mode:     ") + chalk.white("chunked (dag-pb)"));
          cid = await uploadChunkedBlocks(bulletinRpc, context.signer, bytes, chunkSizeBytes);
          uploadSize = bytes.length;
        } else {
          console.log(chalk.gray("  size:     ") + chalk.white(`${bytes.length} bytes`));
          console.log(chalk.gray("  mode:     ") + chalk.white("single"));
          cid = await uploadSingleBlock(bulletinRpc, context.signer, bytes);
          uploadSize = bytes.length;
        }

        console.log(chalk.gray("\n  cid:      ") + chalk.cyan(cid));
        if (ipfsCid) {
          console.log(chalk.gray("  ipfs:     ") + chalk.cyan(ipfsCid));
        }

        const previewUrl = getPreviewUrl({ cid, ipfsCid, path: resolvedPath, type: isDirectory ? "directory" : "file", size: uploadSize, timestamp: "" });
        console.log(chalk.gray("  preview:  ") + chalk.blue(previewUrl));

        if (mergedOptions.printContenthash) {
          await generateAndDisplayContenthash(cid);
        }

        if (options.history !== false) {
          await addUploadRecord({
            cid,
            ipfsCid,
            path: resolvedPath,
            type: isDirectory ? "directory" : "file",
            size: uploadSize,
          });
        }

        console.log(chalk.green("\n✓ Upload Complete\n"));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    },
  );

  bulletinCommand
    .command("history")
    .alias("list")
    .description("List all uploaded CIDs")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json?: boolean }) => {
      try {
        const history = await readHistory();

        if (options.json) {
          console.log(JSON.stringify(history, null, 2));
          process.exit(0);
        }

        if (history.length === 0) {
          console.log(chalk.yellow("\n  No uploads in history.\n"));
          console.log(chalk.gray("  Upload files with: dotns bulletin upload <path>\n"));
          process.exit(0);
        }

        console.log(chalk.blue("\n▶ Upload History\n"));
        console.log(chalk.gray(`  ${history.length} upload(s) found\n`));

        history.forEach((record, index) => {
          const num = (index + 1).toString().padStart(2, " ");
          console.log(chalk.yellow(`  ${num}.`) + chalk.white(` ${formatRecordTimestamp(record)}`));
          console.log(chalk.gray("      cid:     ") + chalk.cyan(record.cid));
          if (record.ipfsCid) {
            console.log(chalk.gray("      ipfs:    ") + chalk.cyan(record.ipfsCid));
          }
          console.log(chalk.gray("      path:    ") + chalk.white(record.path));
          console.log(chalk.gray("      type:    ") + chalk.white(record.type));
          if (record.size > 0) {
            console.log(chalk.gray("      size:    ") + chalk.white(formatBytes(record.size)));
          }
          console.log(chalk.gray("      preview: ") + chalk.blue(getPreviewUrl(record)));
          console.log();
        });

        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  bulletinCommand
    .command("history:remove <cid>")
    .description("Remove an upload from history by CID")
    .action(async (cid: string) => {
      try {
        const removed = await removeUploadRecord(cid);

        if (removed) {
          console.log(chalk.green(`\n✓ Removed ${cid} from history\n`));
        } else {
          console.log(chalk.yellow(`\n⚠ CID not found in history: ${cid}\n`));
        }

        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });

  bulletinCommand
    .command("history:clear")
    .description("Clear all upload history")
    .action(async () => {
      try {
        const count = await clearHistory();
        const historyPath = await getHistoryPath();

        console.log(chalk.green(`\n✓ Cleared ${count} upload(s) from history`));
        console.log(chalk.gray(`  ${historyPath}\n`));

        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    });
}