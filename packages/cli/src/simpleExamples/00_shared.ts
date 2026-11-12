import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { chain } from "@parity/trinity-stack/reader";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import type { PolkadotSigner } from "polkadot-api";
import { type Address } from "viem";

import {
  getChainTokenInfo,
  ReviveClientWrapper,
  type PolkadotApiClient,
} from "../client/polkadotClient";
import { DEFAULT_MNEMONIC } from "../utils/constants";
import { resolveDotnsEnvironment, type DotnsEnvironmentConfig } from "../utils/environments";
import { assertExpectedChain } from "../cli/context";
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

// These examples sign with the shared dev account, so they default to a testnet.
// The RPCs come from the selected environment, so its address book always meets
// the chain it was recorded for.
function exampleEnvironment(): DotnsEnvironmentConfig {
  return resolveDotnsEnvironment(process.env.DOTNS_ENV ?? "paseo-v2");
}

// Builds the keyring-backed signer here only because this is a local dev example.
// A real consumer (mobile, extension, hardware) constructs its own PolkadotSigner
// and passes it straight to createDotnsContext without a keyring.
export async function connectDotns(): Promise<ConnectedDotns> {
  const environment = exampleEnvironment();
  const rpc = process.env.DOTNS_RPC ?? environment.rpc;

  const source = process.env.DOTNS_KEY_URI ?? process.env.DOTNS_MNEMONIC ?? DEFAULT_MNEMONIC;
  const isKeyUri = Boolean(process.env.DOTNS_KEY_URI);

  const rawClient = createClient(getWsProvider(rpc));
  await assertExpectedChain(rawClient, "asset-hub", environment);
  const client = rawClient.getTypedApi(paseo) as PolkadotApiClient;
  const clientWrapper = new ReviveClientWrapper(client, await getChainTokenInfo(rawClient));

  const { origin, signer } = await createKeyringSigner({ source, isKeyUri });
  const evmAddress = await clientWrapper.getEvmAddress(origin);
  const ctx = createDotnsContext({
    clientWrapper,
    origin,
    signer,
    environment,
    onStatus: (status) => console.log(`  · ${status}`),
  });

  return { client, clientWrapper, ctx, substrateAddress: origin, evmAddress, signer };
}

export async function connectBulletin() {
  const environment = exampleEnvironment();
  const rpc = process.env.BULLETIN_RPC ?? chain(environment.descriptor, "Bulletin").rpc[0]!;
  const mnemonic = process.env.DOTNS_MNEMONIC;
  const keyUri = process.env.DOTNS_KEY_URI ?? "//Alice";

  const account = await createAccountFromSource(mnemonic ?? keyUri, mnemonic ? false : true);

  const substrateAddress = account.address;
  const signer = createSubstrateSigner(account);

  const rawClient = createClient(getWsProvider(rpc));
  await assertExpectedChain(rawClient, "bulletin", environment);
  const client = rawClient.getTypedApi(bulletin);

  return {
    rpc,
    client,
    rawClient,
    substrateAddress,
    signer,
  };
}
