#!/usr/bin/env node
import ora from "ora";
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, "..", "bin");
const KUBO_VERSION = "v0.39.0";
function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;
  const platformMap = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };
  const archMap = {
    x64: "amd64",
    arm64: "arm64",
    arm: "arm",
  };
  const os = platformMap[platform];
  const cpu = archMap[arch];
  if (!os || !cpu) {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
  const ext = platform === "win32" ? ".zip" : ".tar.gz";
  const binName = platform === "win32" ? "ipfs.exe" : "ipfs";
  return { os, cpu, ext, binName };
}
function runCommand(command) {
  return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
}
async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Download failed: empty response body");
  }
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
}
function extractTarGz(archivePath, destDir) {
  runCommand(`tar -xzf "${archivePath}" -C "${destDir}" --strip-components=1 kubo/ipfs`);
}
function extractZip(archivePath, destDir) {
  const ps = [
    "powershell",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `"Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force; ` +
      `Move-Item -Path '${destDir}\\kubo\\ipfs.exe' -Destination '${destDir}\\ipfs.exe' -Force"`,
  ].join(" ");
  runCommand(ps);
}
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function makeExecutableIfNeeded(filePath) {
  if (process.platform !== "win32") {
    chmodSync(filePath, 0o755);
  }
}
function tryGetVersion(binaryPath) {
  try {
    const v = runCommand(`"${binaryPath}" --version`);
    return v || null;
  } catch {
    return null;
  }
}
function failSpinner(spinner, message, error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  spinner.fail(message);
  throw new Error(errMsg);
}
async function main() {
  const spinner = ora("Preparing IPFS (kubo) installation").start();
  try {
    const { os, cpu, ext, binName } = getPlatformInfo();
    const binaryPath = join(BIN_DIR, binName);
    ensureDir(BIN_DIR);
    if (existsSync(binaryPath)) {
      const version = tryGetVersion(binaryPath);
      spinner.succeed(version ? `IPFS already installed (${version})` : "IPFS already installed");
      return;
    }
    const filename = `kubo_${KUBO_VERSION}_${os}-${cpu}${ext}`;
    const url = `https://dist.ipfs.tech/kubo/${KUBO_VERSION}/${filename}`;
    const archivePath = join(BIN_DIR, filename);
    spinner.text = `Downloading ${filename}`;
    await downloadFile(url, archivePath);
    spinner.text = "Extracting binary";
    if (ext === ".tar.gz") {
      extractTarGz(archivePath, BIN_DIR);
    } else {
      extractZip(archivePath, BIN_DIR);
    }
    spinner.text = "Finalizing installation";
    makeExecutableIfNeeded(binaryPath);
    if (existsSync(archivePath)) {
      unlinkSync(archivePath);
    }
    const version = tryGetVersion(binaryPath);
    spinner.succeed(version ? `IPFS installed (${version})` : "IPFS installed");
  } catch (error) {
    failSpinner(ora().start(), "Failed to install IPFS", error);
  }
}
main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
