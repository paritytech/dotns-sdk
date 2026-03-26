import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  VerificationResult,
  BlockVerificationResult,
  KuboImportResult,
  KuboDaemonResult,
} from "../types/types";
import { formatErrorMessage } from "../utils/formatting";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackagesDir(): string {
  let dir = __dirname;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "src"))) {
      return dirname(dir);
    }
    dir = dirname(dir);
  }
  return dirname(__dirname);
}

const IPFS_BINARY_NAME = process.platform === "win32" ? "ipfs.exe" : "ipfs";
const BUNDLED_IPFS_PATH = join(findPackagesDir(), "bin", IPFS_BINARY_NAME);

function resolveIpfsBinaryPath(): string | null {
  if (existsSync(BUNDLED_IPFS_PATH)) {
    return BUNDLED_IPFS_PATH;
  }

  const whichCommand = process.platform === "win32" ? "where" : "which";
  try {
    const systemPath = execSync(`${whichCommand} ${IPFS_BINARY_NAME}`, {
      encoding: "utf-8",
      stdio: "pipe",
    })
      .trim()
      .split("\n")[0];
    if (systemPath && existsSync(systemPath)) return systemPath;
  } catch {
    /* not on PATH */
  }

  return null;
}

function runIpfsCommand(args: string): KuboImportResult {
  const binaryPath = resolveIpfsBinaryPath();
  if (!binaryPath) {
    return { success: false, error: "ipfs binary not found" };
  }

  try {
    const output = execSync(`"${binaryPath}" ${args}`, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 120_000,
    }).trim();

    return { success: true, output };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

export function hasIpfsCli(): boolean {
  return resolveIpfsBinaryPath() !== null;
}

export function ensureIpfsRepo(): KuboImportResult {
  const statResult = runIpfsCommand("repo stat");
  if (statResult.success) return { success: true, output: "repo already initialized" };
  return runIpfsCommand("init");
}

const IPFS_ADD_ARGS = "add -Q -r --cid-version=1 --raw-leaves --pin=true";

export function addDirectoryToIpfs(directoryPath: string): KuboImportResult {
  const repoResult = ensureIpfsRepo();
  if (!repoResult.success) return repoResult;

  return runIpfsCommand(`${IPFS_ADD_ARGS} "${directoryPath}"`);
}

function isDaemonRunning(): boolean {
  const binaryPath = resolveIpfsBinaryPath();
  if (!binaryPath) return false;
  try {
    execSync(`"${binaryPath}" swarm peers`, { encoding: "utf-8", stdio: "pipe", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function addDirectoryWithDaemon(
  directoryPath: string,
  daemonTtlSeconds: number = 0,
): Promise<KuboDaemonResult> {
  const binaryPath = resolveIpfsBinaryPath();
  if (!binaryPath) return { success: false, error: "ipfs binary not found", daemonStarted: false };

  const repoResult = ensureIpfsRepo();
  if (!repoResult.success) return { ...repoResult, daemonStarted: false };

  const existingDaemon = isDaemonRunning();

  if (!existingDaemon) {
    const { spawn } = await import("node:child_process");

    const daemon = spawn(binaryPath, ["daemon", "--init=false"], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const daemonReady = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 30_000);
      const onData = (data: Buffer) => {
        if (data.toString().includes("Daemon is ready")) {
          clearTimeout(timeout);
          resolve(true);
        }
      };
      daemon.stdout?.on("data", onData);
      daemon.stderr?.on("data", onData);
    });

    if (!daemonReady) {
      try {
        daemon.kill("SIGTERM");
      } catch {}
      return {
        success: false,
        error: "IPFS daemon failed to start within 30 seconds",
        daemonStarted: false,
      };
    }

    daemon.unref();

    if (daemonTtlSeconds > 0) {
      setTimeout(() => {
        try {
          daemon.kill("SIGTERM");
        } catch {}
      }, daemonTtlSeconds * 1_000).unref();
    }
  }

  const addResult = runIpfsCommand(`${IPFS_ADD_ARGS} "${directoryPath}"`);

  if (!addResult.success) {
    return { ...addResult, daemonStarted: !existingDaemon };
  }

  const rootCid = addResult.output?.trim();
  if (rootCid) {
    runIpfsCommand(`routing provide ${rootCid}`);
  }

  return { success: true, output: addResult.output, daemonStarted: !existingDaemon };
}

export function importCarToIpfs(carFilePath: string): KuboImportResult {
  const repoResult = ensureIpfsRepo();
  if (!repoResult.success) return repoResult;

  return runIpfsCommand(`dag import --pin-roots=true "${carFilePath}"`);
}

export function exportCidToCar(cid: string, outputPath: string): KuboImportResult {
  const binaryPath = resolveIpfsBinaryPath();
  if (!binaryPath) return { success: false, error: "ipfs binary not found" };

  try {
    execSync(`"${binaryPath}" dag export ${cid} > "${outputPath}"`, {
      timeout: 120_000,
      shell: "/bin/sh",
    });
    return { success: true, output: outputPath };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

export function provideRootCid(cid: string): KuboImportResult {
  return runIpfsCommand(`routing provide ${cid}`);
}

async function loadHeliaClient() {
  const { getSharedHeliaClient } = await import("./heliaClient");
  return getSharedHeliaClient();
}

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;
const FALLBACK_GATEWAYS: string[] = [
  "https://paseo-ipfs.polkadot.io",
  "https://dweb.link",
  "https://cloudflare-ipfs.com",
  "https://w3s.link",
  "https://ipfs.io",
];
const DEFAULT_VERIFICATION_GATEWAY = FALLBACK_GATEWAYS[0]!;

function isResolvableStatus(statusCode: number): boolean {
  return statusCode === 200;
}

async function safelyCancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Body may already be consumed or stream closed
  }
}

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const candidateUrls = [
    `${gatewayBaseUrl}/ipfs/${contentCid}`,
    `${gatewayBaseUrl}/ipfs/${contentCid}/`,
  ];

  let lastError: string | undefined;

  for (const verificationUrl of candidateUrls) {
    try {
      const response = await fetch(verificationUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS),
      });

      if (isResolvableStatus(response.status)) {
        await safelyCancelBody(response);
        return {
          cid: contentCid,
          resolvable: true,
          gateway: gatewayBaseUrl,
          statusCode: response.status,
        };
      }

      lastError = `HTTP ${response.status} from ${verificationUrl}`;
      await safelyCancelBody(response);
    } catch (error) {
      lastError = formatErrorMessage(error);
    }
  }

  return {
    cid: contentCid,
    resolvable: false,
    gateway: gatewayBaseUrl,
    errorMessage: lastError ?? "Content not retrievable from gateway",
  };
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
  gatewayUrls: string[] = FALLBACK_GATEWAYS,
): Promise<Map<string, VerificationResult>> {
  const results = await Promise.all(
    gatewayUrls.map(async (gatewayUrl) => {
      const result = await verifyCidResolution(contentCid, gatewayUrl);
      return [gatewayUrl, result] as const;
    }),
  );

  return new Map(results);
}

export async function verifyCidViaP2P(cidString: string): Promise<VerificationResult> {
  try {
    const heliaClient = await loadHeliaClient();
    const fetchResult = await heliaClient.fetchBlock(cidString);
    return {
      cid: cidString,
      resolvable: fetchResult.size > 0,
      gateway: "p2p/bitswap",
    };
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    return {
      cid: cidString,
      resolvable: false,
      gateway: "p2p/bitswap",
      errorMessage,
    };
  }
}

export async function verifySingleFileCid(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const p2pResult = await verifyCidViaP2P(contentCid);
  if (p2pResult.resolvable) {
    return p2pResult;
  }

  return verifyCidResolution(contentCid, gatewayBaseUrl);
}
