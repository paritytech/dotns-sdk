import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import type { PolkadotSigner } from "polkadot-api";
import { type Address } from "viem";

import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadotClient";
import { DEFAULT_BULLETIN_RPC, DEFAULT_MNEMONIC, RPC_ENDPOINTS } from "../utils/constants";
import { createAccountFromSource, createSubstrateSigner } from "../commands/auth";

export type ConnectedDotns = {
  client: PolkadotApiClient;
  clientWrapper: ReviveClientWrapper;
  substrateAddress: string;
  evmAddress: Address;
  signer: PolkadotSigner;
};

export async function connectDotns(): Promise<ConnectedDotns> {
  const rpc = process.env.DOTNS_RPC ?? RPC_ENDPOINTS[0];

  const source = process.env.DOTNS_KEY_URI ?? process.env.DOTNS_MNEMONIC ?? DEFAULT_MNEMONIC;
  const isKeyUri = Boolean(process.env.DOTNS_KEY_URI);

  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo) as PolkadotApiClient;
  const clientWrapper = new ReviveClientWrapper(client);

  const account = await createAccountFromSource(source, isKeyUri);
  const substrateAddress = account.address;
  const evmAddress = await clientWrapper.getEvmAddress(substrateAddress);

  const signer = createSubstrateSigner(account);

  return { client, clientWrapper, substrateAddress, evmAddress, signer };
}

export async function connectBulletin() {
  const rpc = process.env.BULLETIN_RPC ?? DEFAULT_BULLETIN_RPC;
  const mnemonic = process.env.DOTNS_MNEMONIC;
  const keyUri = process.env.DOTNS_KEY_URI ?? "//Alice";

  const account = await createAccountFromSource(mnemonic ?? keyUri, mnemonic ? false : true);

  const substrateAddress = account.address;
  const signer = createSubstrateSigner(account);

  const rawClient = createClient(getWsProvider(rpc));
  const client = rawClient.getTypedApi(bulletin);

  return {
    rpc,
    client,
    rawClient,
    substrateAddress,
    signer,
  };
}
