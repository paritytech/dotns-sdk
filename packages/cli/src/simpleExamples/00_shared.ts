import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import type { PolkadotSigner } from "polkadot-api";
import { type Address } from "viem";

import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadotClient";
import { DEFAULT_BULLETIN_RPC, DEFAULT_MNEMONIC, RPC_ENDPOINTS } from "../utils/constants";
import { createAccountFromSource, createSubstrateSigner } from "../commands/auth";
import { createDotnsContext, type DotnsContext } from "../core/context";
import { createKeyringSigner } from "../core/keyring";

export type ConnectedDotns = {
  client: PolkadotApiClient;
  clientWrapper: ReviveClientWrapper;
  ctx: DotnsContext;
  substrateAddress: string;
  evmAddress: Address;
  signer: PolkadotSigner;
};

// Builds the keyring-backed signer here only because this is a local dev example.
// A real consumer (mobile, extension, hardware) constructs its own PolkadotSigner
// and passes it straight to createDotnsContext — no keyring involved.
export async function connectDotns(): Promise<ConnectedDotns> {
  const rpc = process.env.DOTNS_RPC ?? RPC_ENDPOINTS[0];

  const source = process.env.DOTNS_KEY_URI ?? process.env.DOTNS_MNEMONIC ?? DEFAULT_MNEMONIC;
  const isKeyUri = Boolean(process.env.DOTNS_KEY_URI);

  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo) as PolkadotApiClient;
  const clientWrapper = new ReviveClientWrapper(client);

  const { origin, signer } = await createKeyringSigner({ source, isKeyUri });
  const evmAddress = await clientWrapper.getEvmAddress(origin);
  const ctx = createDotnsContext({
    clientWrapper,
    origin,
    signer,
    environment: process.env.DOTNS_ENV,
    onStatus: (status) => console.log(`  · ${status}`),
  });

  return { client, clientWrapper, ctx, substrateAddress: origin, evmAddress, signer };
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
