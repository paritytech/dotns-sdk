import { createClient } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws-provider";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { type Address } from "viem";

import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadot-client";
import { DEFAULT_MNEMONIC, RPC_ENDPOINTS } from "../utils/constants";
const DEFAULT_BULLETIN_RPC = "wss://bulletin.dotspark.app";

export type ConnectedDotns = {
  client: PolkadotApiClient;
  clientWrapper: ReviveClientWrapper;
  substrateAddress: string;
  evmAddress: Address;
  signer: ReturnType<typeof getPolkadotSigner>;
};

export async function createAccountFromSource(source: string, isKeyUri: boolean) {
  await cryptoWaitReady();
  const keyring = new Keyring({ type: "sr25519" });
  return isKeyUri ? keyring.addFromUri(source) : keyring.addFromMnemonic(source);
}

export async function connectDotns(): Promise<ConnectedDotns> {
  const rpc = process.env.DOTNS_RPC ?? RPC_ENDPOINTS[0];

  const source = process.env.DOTNS_KEY_URI ?? process.env.DOTNS_MNEMONIC ?? DEFAULT_MNEMONIC;
  const isKeyUri = Boolean(process.env.DOTNS_KEY_URI);

  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo) as PolkadotApiClient;
  const clientWrapper = new ReviveClientWrapper(client);

  const account = await createAccountFromSource(source, isKeyUri);
  const substrateAddress = account.address;
  const evmAddress = await clientWrapper.getEvmAddress(substrateAddress);

  const signer = getPolkadotSigner(account.publicKey, "Sr25519", async (input) =>
    account.sign(input),
  );

  return { client, clientWrapper, substrateAddress, evmAddress, signer };
}

export async function connectBulletin() {
  const rpc = process.env.BULLETIN_RPC ?? DEFAULT_BULLETIN_RPC;
  const mnemonic = process.env.DOTNS_MNEMONIC;
  const keyUri = process.env.DOTNS_KEY_URI ?? "//Alice";

  const account = await createAccountFromSource(mnemonic ?? keyUri, mnemonic ? false : true);

  const substrateAddress = account.address;
  const signer = getPolkadotSigner(account.publicKey, "Sr25519", async (input) =>
    account.sign(input),
  );

  const client = createClient(getWsProvider(rpc)).getTypedApi(bulletin);

  return {
    rpc,
    client,
    substrateAddress,
    signer,
  };
}
