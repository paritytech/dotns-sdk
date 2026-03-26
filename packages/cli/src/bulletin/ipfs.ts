import { execSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, chmodSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import type {
  VerificationResult,
  BlockVerificationResult,
  KuboImportResult,
  KuboDaemonResult,
  KuboPlatformInfo,
} from "../types/types";
import { formatErrorMessage } from "../utils/formatting";

const __dirname = dirname(fileURLToPath(import.meta.url));

const KUBO_VERSION = "v0.40.1";

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
const BIN_DIR = join(findPackagesDir(), "bin");
const BUNDLED_IPFS_PATH = join(BIN_DIR, IPFS_BINARY_NAME);

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
    // execSync throws when the binary is not found on PATH, which is expected
  }

  return null;
}

function getKuboPlatformInfo(): KuboPlatformInfo {
  const platformMap: Record<string, KuboPlatformInfo["os"] | undefined> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };
  const archMap: Record<string, KuboPlatformInfo["cpu"] | undefined> = {
    x64: "amd64",
    arm64: "arm64",
    arm: "arm",
  };

  const os = platformMap[process.platform];
  const cpu = archMap[process.arch];

  if (!os || !cpu) {
    throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
  }

  return {
    os,
    cpu,
    ext: process.platform === "win32" ? ".zip" : ".tar.gz",
    binName: process.platform === "win32" ? "ipfs.exe" : "ipfs",
  };
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kubo download failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Kubo download failed: empty response body");
  }
  const fileStream = createWriteStream(dest);
  await pipeline(response.body as unknown as NodeJS.ReadableStream, fileStream);
}

export async function ensureKuboInstalled(): Promise<string> {
  const existing = resolveIpfsBinaryPath();
  if (existing) return existing;

  const { os, cpu, ext, binName } = getKuboPlatformInfo();
  const binaryPath = join(BIN_DIR, binName);

  if (!existsSync(BIN_DIR)) {
    mkdirSync(BIN_DIR, { recursive: true });
  }

  const filename = `kubo_${KUBO_VERSION}_${os}-${cpu}${ext}`;
  const url = `https://dist.ipfs.tech/kubo/${KUBO_VERSION}/${filename}`;
  const archivePath = join(BIN_DIR, filename);

  await downloadFile(url, archivePath);

  if (ext === ".tar.gz") {
    execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}" --strip-components=1 kubo/ipfs`, {
      stdio: "pipe",
    });
  } else {
    execSync(
      `powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${BIN_DIR}' -Force; Move-Item -Path '${BIN_DIR}\\kubo\\ipfs.exe' -Destination '${BIN_DIR}\\ipfs.exe' -Force"`,
      { stdio: "pipe" },
    );
  }

  if (process.platform !== "win32") {
    chmodSync(binaryPath, 0o755);
  }

  if (existsSync(archivePath)) {
    unlinkSync(archivePath);
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`Kubo installation failed: binary not found at ${binaryPath}`);
  }

  return binaryPath;
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
      } catch {
        // Process may have already exited before SIGTERM
      }
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
        } catch {
          // Process may have already exited before scheduled SIGTERM
        }
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
    // Body may already be consumed or stream closed by the time we cancel
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
