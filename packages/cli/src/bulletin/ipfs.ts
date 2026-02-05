import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MerkleizeResult, VerificationResult, BlockVerificationResult } from "../types/types";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const bundledIpfsBinaryPath = join(
  currentDirectory,
  "..",
  "..",
  "bin",
  process.platform === "win32" ? "ipfs.exe" : "ipfs",
);

const DEFAULT_VERIFICATION_GATEWAY = "https://ipfs.dotspark.app";
const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

export function findIpfsBinaryPath(): string | null {
  if (existsSync(bundledIpfsBinaryPath)) {
    return bundledIpfsBinaryPath;
  }

  try {
    const locateCommand = process.platform === "win32" ? "where ipfs" : "which ipfs";
    const systemIpfsBinaryPath = execSync(locateCommand, { encoding: "utf-8", stdio: "pipe" })
      .trim()
      .split("\n")[0];

    if (systemIpfsBinaryPath && existsSync(systemIpfsBinaryPath)) {
      return systemIpfsBinaryPath;
    }
  } catch {
    return null;
  }

  return null;
}

export function hasIpfsCli(): boolean {
  return findIpfsBinaryPath() !== null;
}

export function getIpfsVersion(): string | null {
  const binaryPath = findIpfsBinaryPath();
  if (!binaryPath) {
    return null;
  }

  try {
    return execSync(`"${binaryPath}" version`, { encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

export function merkleizeWithIpfs(directoryPath: string): MerkleizeResult {
  const binaryPath = findIpfsBinaryPath();

  if (!binaryPath) {
    throw new Error(
      "IPFS CLI not found. Install with: bun install\n" +
        "Or manually from: https://docs.ipfs.tech/install/",
    );
  }

  if (!existsSync(directoryPath)) {
    throw new Error(`Directory not found: ${directoryPath}`);
  }

  const pathStats = statSync(directoryPath);
  if (!pathStats.isDirectory()) {
    throw new Error(`Path is not a directory: ${directoryPath}`);
  }

  const computedCid = execSync(
    `"${binaryPath}" add -Q -r --cid-version=1 --raw-leaves --pin=false "${directoryPath}"`,
    {
      encoding: "utf-8",
      stdio: "pipe",
      maxBuffer: 50 * 1024 * 1024,
    },
  ).trim();

  if (!computedCid) {
    throw new Error("IPFS add command returned an empty CID");
  }

  return { cid: computedCid };
}

export function merkleizeSingleFileWithIpfs(filePath: string): MerkleizeResult {
  const binaryPath = findIpfsBinaryPath();

  if (!binaryPath) {
    throw new Error(
      "IPFS CLI not found. Install with: bun install\n" +
        "Or manually from: https://docs.ipfs.tech/install/",
    );
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const pathStats = statSync(filePath);
  if (!pathStats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }

  const computedCid = execSync(
    `"${binaryPath}" add -Q --cid-version=1 --raw-leaves --pin=false "${filePath}"`,
    {
      encoding: "utf-8",
      stdio: "pipe",
      maxBuffer: 50 * 1024 * 1024,
    },
  ).trim();

  if (!computedCid) {
    throw new Error("IPFS add command returned an empty CID");
  }

  return { cid: computedCid };
}

export function exportCarFile(contentCid: string, outputFilePath: string): void {
  const binaryPath = findIpfsBinaryPath();

  if (!binaryPath) {
    throw new Error("IPFS CLI not found");
  }

  execSync(`"${binaryPath}" dag export ${contentCid} > "${outputFilePath}"`, {
    encoding: "utf-8",
    stdio: "pipe",
  });
}

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const verificationUrl = `${gatewayBaseUrl}/ipfs/${contentCid}`;

  try {
    const response = await fetch(verificationUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS),
    });

    return {
      cid: contentCid,
      resolvable: response.ok,
      gateway: gatewayBaseUrl,
      statusCode: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      cid: contentCid,
      resolvable: false,
      gateway: gatewayBaseUrl,
      errorMessage,
    };
  }
}

export async function verifyMultipleCids(
  contentCids: string[],
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<BlockVerificationResult> {
  const resolvableBlocks: string[] = [];
  const missingBlocks: string[] = [];

  for (const contentCid of contentCids) {
    const verificationResult = await verifyCidResolution(contentCid, gatewayBaseUrl);

    if (verificationResult.resolvable) {
      resolvableBlocks.push(contentCid);
    } else {
      missingBlocks.push(contentCid);
    }
  }

  return {
    totalBlocks: contentCids.length,
    resolvableBlocks,
    missingBlocks,
    gateway: gatewayBaseUrl,
  };
}

export async function verifyCidWithMultipleGateways(
  contentCid: string,
  gatewayUrls: string[] = [
    "https://ipfs.dotspark.app",
    "https://dweb.link",
    "https://cloudflare-ipfs.com",
    "https://w3s.link",
  ],
): Promise<Map<string, VerificationResult>> {
  const verificationResults = new Map<string, VerificationResult>();

  for (const gatewayUrl of gatewayUrls) {
    const result = await verifyCidResolution(contentCid, gatewayUrl);
    verificationResults.set(gatewayUrl, result);
  }

  return verificationResults;
}

export function computeExpectedCidForFile(filePath: string): string | null {
  if (!hasIpfsCli()) {
    return null;
  }

  try {
    const result = merkleizeSingleFileWithIpfs(filePath);
    return result.cid;
  } catch {
    return null;
  }
}

export function computeExpectedCidForDirectory(directoryPath: string): string | null {
  if (!hasIpfsCli()) {
    return null;
  }

  try {
    const result = merkleizeWithIpfs(directoryPath);
    return result.cid;
  } catch {
    return null;
  }
}

export function validateCidMatchesExpected(computedCid: string, expectedCid: string): boolean {
  return computedCid === expectedCid;
}
