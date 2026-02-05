import type { Command } from "commander";
import { ENV } from "../env";
import type { AuthOptionValues } from "../../types/types";

export function addAuthOptions(cmd: Command): Command {
  return cmd
    .option("--rpc <wsUrl>", `WebSocket RPC endpoint (env: ${ENV.RPC})`)
    .option("--keystore-path <path>", `Keystore path (env: ${ENV.KEYSTORE_PATH})`)
    .option("--min-balance <pas>", `Minimum balance in PAS (env: ${ENV.MIN_BALANCE_PAS})`)
    .option("--account <name>", "Keystore account name (default: keystore default)")
    .option("--password <pw>", `Keystore password (env: ${ENV.KEYSTORE_PASSWORD})`)
    .option("-m, --mnemonic <phrase>", `BIP39 mnemonic phrase (env: ${ENV.MNEMONIC})`)
    .option("-k, --key-uri <uri>", `Substrate key URI (env: ${ENV.KEY_URI})`);
}

export function getAuthOptions(cmd: Command): AuthOptionValues {
  const own = cmd.opts?.() ?? {};
  const parent = cmd.parent?.opts?.() ?? {};
  return { ...parent, ...own } as AuthOptionValues;
}
