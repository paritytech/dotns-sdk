import type { PolkadotSigner } from "polkadot-api";
import { createAccountFromSource, createSubstrateSigner } from "../commands/auth";

export async function createKeyringSigner(opts: {
  source: string;
  isKeyUri?: boolean;
}): Promise<{ origin: string; signer: PolkadotSigner }> {
  const account = await createAccountFromSource(opts.source, opts.isKeyUri ?? false);
  return { origin: account.address, signer: createSubstrateSigner(account) };
}
