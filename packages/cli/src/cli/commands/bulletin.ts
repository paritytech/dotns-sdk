import { Command } from "commander";
import chalk from "chalk";
import type { BulletinUploadOptions, CommandOptions } from "../../types/types";
import {
  validateAndReadPath,
  uploadSingleBlock,
  uploadChunkedBlocks,
  storeDirectory,
  generateContenthash,
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
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import {
  DEFAULT_BULLETIN_RPC,
  DEFAULT_CHUNK_SIZE_BYTES,
  MAX_SINGLE_UPLOAD_SIZE_BYTES,
} from "../../utils/constants";

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

async function withCapturedConsole<T>(callback: () => Promise<T>): Promise<T> {
  const captured: string[] = [];
  const capture = (...args: any[]) => {
    captured.push(args.map(String).join(" "));
  };
  const captureWrite = (chunk: any) => {
    captured.push(String(chunk));
    return true;
  };

  const saved = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };

  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;
  process.stdout.write = captureWrite as any;
  process.stderr.write = captureWrite as any;

  try {
    return await callback();
  } catch (error) {
    saved.error("[captured output before failure]\n" + captured.join("\n"));
    throw error;
  } finally {
    console.log = saved.log;
    console.error = saved.error;
    console.warn = saved.warn;
    console.info = saved.info;
    process.stdout.write = saved.stdoutWrite;
    process.stderr.write = saved.stderrWrite;
  }
}

/** Conditionally wraps a callback in captured-console mode when JSON output is active. */
function maybeQuiet<T>(jsonOutput: boolean, callback: () => Promise<T>): Promise<T> {
  return jsonOutput ? withCapturedConsole(callback) : callback();
}

export function attachBulletinCommands(root: Command): void {
  const bulletinCommand = root.command("bulletin").description("Bulletin storage utilities");

  addAuthOptions(bulletinCommand);

  const authorizeCommand = bulletinCommand
    .command("authorize <address>")
    .description("Authorize an account to use TransactionStorage (requires sudo)")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option(
      "--transactions <count>",
      "Number of transactions to authorize",
      String(DEFAULT_AUTH_TRANSACTIONS),
    )
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
          console.error(
            chalk.gray(`    dotns bulletin authorize ${targetAddress} --key-uri //Alice\n`),
          );
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
    .option(
      "--chunk-size <bytes>",
      "Chunk size for large uploads",
      String(DEFAULT_CHUNK_SIZE_BYTES),
    )
    .option("--force-chunked", "Force chunked upload (DAG-PB)", false)
    .option("--parallel", "Upload directory blocks in parallel (faster)", false)
    .option("--concurrency <n>", "Number of parallel uploads (default: 5)", "5")
    .option("--print-contenthash", "Also print 0x-prefixed IPFS contenthash for the CID", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .option("--no-history", "Do not save upload to history", false);

  addAuthOptions(uploadCommand).action(
    async (
      inputPath: string,
      options: BulletinUploadOptions & { history?: boolean; json?: boolean },
      command: Command,
    ) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = Boolean(mergedOptions.json);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const { bytes, isDirectory, resolvedPath } = await maybeQuiet(jsonOutput, () =>
          validateAndReadPath(inputPath),
        );

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const chunkSizeBytes = Math.max(
          1,
          Number(mergedOptions.chunkSize || DEFAULT_CHUNK_SIZE_BYTES),
        );
        const parallel = Boolean(mergedOptions.parallel);
        const concurrency = Math.max(1, Number(mergedOptions.concurrency || 5));

        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useBulletin: true }),
        );

        await maybeQuiet(jsonOutput, () =>
          ensureAccountAuthorized(bulletinRpc, context.signer, context.substrateAddress),
        );

        const performUpload = async () => {
          if (isDirectory) {
            const result = await storeDirectory(bulletinRpc, context.signer, resolvedPath, {
              parallel,
              concurrency,
              accountAddress: context.substrateAddress,
            });
            return { cid: result.storageCid, ipfsCid: result.ipfsCid, size: 0 };
          } else if (mergedOptions.forceChunked || bytes.length > MAX_SINGLE_UPLOAD_SIZE_BYTES) {
            const result = await uploadChunkedBlocks(
              bulletinRpc,
              context.signer,
              bytes,
              chunkSizeBytes,
            );
            return { cid: result, ipfsCid: result, size: bytes.length };
          } else {
            const result = await uploadSingleBlock(bulletinRpc, context.signer, bytes);
            return { cid: result, ipfsCid: result, size: bytes.length };
          }
        };

        let cid: string;
        let ipfsCid: string;
        let uploadSize: number;

        if (jsonOutput) {
          const uploadResult = await withCapturedConsole(performUpload);
          cid = uploadResult.cid;
          ipfsCid = uploadResult.ipfsCid;
          uploadSize = uploadResult.size;
        } else {
          console.log(chalk.blue("\n▶ Bulletin Upload"));
          console.log(chalk.gray("  path:     ") + chalk.white(resolvedPath));
          console.log(chalk.gray("  rpc:      ") + chalk.white(bulletinRpc));

          if (isDirectory) {
            const mode = parallel ? `directory (parallel, ${concurrency}x)` : "directory";
            console.log(chalk.gray("  mode:     ") + chalk.white(mode));
          } else if (mergedOptions.forceChunked || bytes.length > MAX_SINGLE_UPLOAD_SIZE_BYTES) {
            console.log(chalk.gray("  size:     ") + chalk.white(`${bytes.length} bytes`));
            console.log(chalk.gray("  mode:     ") + chalk.white("chunked (dag-pb)"));
          } else {
            console.log(chalk.gray("  size:     ") + chalk.white(`${bytes.length} bytes`));
            console.log(chalk.gray("  mode:     ") + chalk.white("single"));
          }

          const uploadResult = await performUpload();
          cid = uploadResult.cid;
          ipfsCid = uploadResult.ipfsCid;
          uploadSize = uploadResult.size;
        }

        const contenthash = generateContenthash(cid);

        const uploadRecord = {
          cid,
          ipfsCid,
          path: resolvedPath,
          type: (isDirectory ? "directory" : "file") as "directory" | "file",
          size: uploadSize,
          timestamp: "",
        };

        const previewUrl = getPreviewUrl(uploadRecord);

        if (jsonOutput) {
          console.log(
            JSON.stringify({
              cid: ipfsCid,
              contenthash,
              preview: previewUrl,
              path: resolvedPath,
              type: isDirectory ? "directory" : "file",
              size: uploadSize,
            }),
          );
        } else {
          console.log(chalk.gray("\n  cid:         ") + chalk.cyan(ipfsCid));
          console.log(chalk.gray("  preview:     ") + chalk.blue(previewUrl));

          if (mergedOptions.printContenthash) {
            console.log(chalk.gray("  contenthash: ") + chalk.white(`0x${contenthash}`));
          }

          console.log(chalk.green("\n✓ Upload Complete\n"));
        }

        await addUploadRecord({
          cid,
          ipfsCid,
          path: resolvedPath,
          type: isDirectory ? "directory" : "file",
          size: uploadSize,
        });

        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (Boolean((options as any).json)) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
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
        const historyPath = getHistoryPath();

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
