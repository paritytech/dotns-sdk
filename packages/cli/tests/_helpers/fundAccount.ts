import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { createSubstrateSigner } from "../../src/commands/auth";
import { RPC_ENDPOINTS } from "../../src/utils/constants";
import { resolveRpc } from "../../src/cli/env";
import { ALICE_KEY_URI } from "./cliHelpers";

const FUND_AMOUNT_PLANCK = 1_000_000_000n;

export async function generateFreshMnemonic(): Promise<string> {
  await cryptoWaitReady();
  return mnemonicGenerate();
}

export async function deriveSubstrateAddress(mnemonic: string): Promise<string> {
  await cryptoWaitReady();
  return new Keyring({ type: "sr25519" }).addFromMnemonic(mnemonic).address;
}

export async function fundAccountFromAlice(recipientSubstrateAddress: string): Promise<void> {
  await cryptoWaitReady();
  const alice = new Keyring({ type: "sr25519" }).addFromUri(ALICE_KEY_URI);
  const signer = createSubstrateSigner(alice);

  const rpc = resolveRpc();
  const client = createClient(getWsProvider(rpc));
  try {
    const typedApi = client.getTypedApi(paseo);
    const transfer = typedApi.tx.Balances.transfer_keep_alive({
      dest: { type: "Id", value: recipientSubstrateAddress },
      value: FUND_AMOUNT_PLANCK,
    });

    await new Promise<void>((resolve, reject) => {
      transfer.signSubmitAndWatch(signer).subscribe({
        next: (event: any) => {
          if (event.type === "finalized") {
            if (event.dispatchError) {
              reject(new Error(`Funding transfer failed: ${JSON.stringify(event.dispatchError)}`));
              return;
            }
            resolve();
          }
        },
        error: reject,
      });
    });
  } finally {
    client.destroy();
  }
}

export { RPC_ENDPOINTS };
