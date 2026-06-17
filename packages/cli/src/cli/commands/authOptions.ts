import type { Command } from "commander";
import { ENV } from "../env";
import type { AuthOptionValues } from "../../types/types";

export function addAuthOptions(cmd: Command): Command {
  return cmd
    .option("--env <environment>", `DotNS environment: paseo-v2 (env: ${ENV.DOTNS_ENV})`)
    .option("--network <environment>", "Alias for --env")
    .option("--rpc <wsUrl>", `WebSocket RPC endpoint (env: ${ENV.RPC})`)
    .option("--keystore-path <path>", `Keystore path (env: ${ENV.KEYSTORE_PATH})`)
    .option("--account <name>", "Keystore account name (default: keystore default)")
    .option("--password <pw>", `Keystore password (env: ${ENV.KEYSTORE_PASSWORD})`)
    .option("-m, --mnemonic <phrase>", `BIP39 mnemonic phrase (env: ${ENV.MNEMONIC})`)
    .option("-k, --key-uri <uri>", `Substrate key URI (env: ${ENV.KEY_URI})`)
    .option(
      "--signer <kind>",
      `Signer: keystore (default) or qr [experimental] (env: ${ENV.SIGNER})`,
      "keystore",
    )
    .option("--qr-app-id <id>", `App id for QR pairing (env: ${ENV.QR_APP_ID})`)
    .option(
      "--qr-people-rpc <stageOrUrls>",
      `QR pairing relay: paseo|preview|stable or wss URLs (env: ${ENV.QR_PEOPLE_RPC})`,
    )
    .option("--qr-fresh", "Force a fresh QR pairing, ignoring any cached session");
}

export function getAuthOptions(cmd: Command): AuthOptionValues {
  const own = cmd.opts?.() ?? {};
  const parent = cmd.parent?.opts?.() ?? {};
  return { ...parent, ...own } as AuthOptionValues;
}
