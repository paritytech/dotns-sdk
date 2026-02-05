import type { Command } from "commander";
import { ENV } from "./env";

export function addHelpFooter(cmd: Command) {
  cmd.addHelpText(
    "after",
    `
Environment variables:
  ${ENV.RPC}                WebSocket RPC endpoint (default: RPC_ENDPOINTS[0])
  ${ENV.MNEMONIC}           Mnemonic for sr25519 account (optional)
  ${ENV.KEY_URI}            Substrate key URI (optional)
  ${ENV.KEYSTORE_PATH}      Encrypted keystore path (default: ~/.dotns/keystore.json)
  ${ENV.KEYSTORE_PASSWORD}  Keystore password (optional; if unset, prompted)
  ${ENV.MIN_BALANCE_PAS}    Minimum PAS balance required (default: 5)

Auth resolution order:
  CLI flags > env > keystore(account) > DEFAULT_MNEMONIC
`,
  );
}

export function addPopHelpFooter(cmd: Command) {
  cmd.addHelpText(
    "after",
    `
Environment variables:
  ${ENV.RPC}
  ${ENV.MNEMONIC}
  ${ENV.KEY_URI}
  ${ENV.KEYSTORE_PATH}
  ${ENV.KEYSTORE_PASSWORD}
  ${ENV.MIN_BALANCE_PAS}
`,
  );
}
