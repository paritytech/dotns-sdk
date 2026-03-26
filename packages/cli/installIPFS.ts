#!/usr/bin/env node
import ora from "ora";
import { ensureKuboInstalled, hasIpfsCli } from "./src/bulletin/ipfs";

async function main(): Promise<void> {
  const spinner = ora("Preparing IPFS (Kubo) installation").start();

  try {
    if (hasIpfsCli()) {
      spinner.succeed("IPFS (Kubo) already installed");
      return;
    }

    spinner.text = "Downloading and installing Kubo";
    const binaryPath = await ensureKuboInstalled();
    spinner.succeed(`IPFS (Kubo) installed at ${binaryPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to install IPFS: ${message}`);
    throw error;
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
