import type { Ora } from "ora";
import type { Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REVERSE_RESOLVER_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import { validateDomainLabel, asLabel } from "../utils/validation";

export type PrimaryNameResult = {
  name: string;
  txHash: string;
};

export async function setPrimaryName(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  name: string,
  spinner: Ora,
): Promise<PrimaryNameResult> {
  const label = asLabel(name);
  validateDomainLabel(label);

  const action = "Setting primary name to";
  spinner.start(`${action} ${label}.dot`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REVERSE_RESOLVER,
    0n,
    DOTNS_REVERSE_RESOLVER_ABI,
    "claimReverseRecord",
    [label],
    originSubstrateAddress,
    signer,
    spinner,
    action,
  );

  return { name: `${label}.dot`, txHash };
}

export async function getPrimaryName(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  address: Address,
  spinner: Ora,
): Promise<string | null> {
  spinner.start(`Reading primary name for ${address}`);
  const name = await performContractCall<string>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REVERSE_RESOLVER,
    DOTNS_REVERSE_RESOLVER_ABI,
    "nameOf",
    [address],
  );
  spinner.succeed(`Primary name for ${address}`);

  return name && name.length > 0 ? name : null;
}
