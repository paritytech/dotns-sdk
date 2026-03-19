import * as fs from "node:fs";
import * as path from "node:path";
import { connectBulletin } from "./00_shared";
import {
  validateAndReadPath,
  uploadSingleBlock,
  uploadChunkedBlocks,
  generateContenthash,
  ensureAccountAuthorized,
} from "../commands/bulletin";

const MAX_SINGLE_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE_BYTES = 512 * 1024;

async function main() {
  const filePath = process.env.BULLETIN_FILE ?? "./01_info.ts";
  if (!filePath) {
    throw new Error("BULLETIN_FILE environment variable is required");
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const forceChunked = process.env.BULLETIN_FORCE_CHUNKED === "true";
  const chunkSize = process.env.BULLETIN_CHUNK_SIZE
    ? parseInt(process.env.BULLETIN_CHUNK_SIZE, 10)
    : DEFAULT_CHUNK_SIZE_BYTES;
  const maxRetries = process.env.BULLETIN_MAX_RETRIES
    ? parseInt(process.env.BULLETIN_MAX_RETRIES, 10)
    : undefined;
  const printContenthash = process.env.BULLETIN_PRINT_CONTENTHASH === "true";

  const { rpc, substrateAddress, signer } = await connectBulletin();

  const validated = await validateAndReadPath(resolvedPath);

  console.log("\n▶ Bulletin Upload\n");
  console.log("  file:     ", resolvedPath);
  console.log("  size:     ", validated.fileSize ?? validated.bytes.length, "bytes");
  console.log("  rpc:      ", rpc);
  console.log("  mode:     ", forceChunked ? "chunked (dag-pb)" : "auto");
  console.log("  retries:  ", maxRetries ?? "default");

  await ensureAccountAuthorized(rpc, signer, substrateAddress);

  let cid: string;

  if (!forceChunked && !validated.deferredRead && validated.bytes.length <= MAX_SINGLE_UPLOAD_SIZE_BYTES) {
    cid = await uploadSingleBlock(rpc, signer, validated.bytes, { maxRetries });
  } else {
    const fileSize = validated.fileSize ?? validated.bytes.length;
    cid = await uploadChunkedBlocks(rpc, signer, resolvedPath, chunkSize, fileSize, substrateAddress, {
      maxRetries,
    });
  }

  console.log("\n  cid:      ", cid);

  if (printContenthash) {
    generateContenthash(cid);
  }

  console.log("\n✓ Upload Complete\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
