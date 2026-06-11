import type { Ora } from "ora";
import { zeroAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRAR_ABI } from "../utils/constants";
import {
  computeDomainTokenId,
  performContractCall,
  submitContractTransaction,
} from "../utils/contractInteractions";
import { validateDomainLabel } from "../utils/validation";

export type DelegateResult = {
  name: string;
  delegate: Address;
  txHash: string;
};

function asLabel(name: string): string {
  const raw = name.trim().toLowerCase();
  return raw.endsWith(".dot") ? raw.slice(0, -4) : raw;
}

async function approveDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  name: string,
  delegate: Address,
  spinner: Ora,
  action: string,
): Promise<DelegateResult> {
  const label = asLabel(name);
  validateDomainLabel(label);
  const tokenId = computeDomainTokenId(label);

  spinner.start(`${action} ${label}.dot`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "approve",
    [delegate, tokenId],
    originSubstrateAddress,
    signer,
    spinner,
    action,
  );

  return { name: `${label}.dot`, delegate, txHash };
}

export async function setNameDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  name: string,
  delegate: Address,
  spinner: Ora,
): Promise<DelegateResult> {
  return approveDelegate(
    clientWrapper,
    originSubstrateAddress,
    signer,
    name,
    delegate,
    spinner,
    "Delegating",
  );
}

export async function revokeNameDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  name: string,
  spinner: Ora,
): Promise<DelegateResult> {
  return approveDelegate(
    clientWrapper,
    originSubstrateAddress,
    signer,
    name,
    zeroAddress as Address,
    spinner,
    "Revoking delegate on",
  );
}

export async function getNameDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  name: string,
  spinner: Ora,
): Promise<Address | null> {
  const label = asLabel(name);
  validateDomainLabel(label);
  const tokenId = computeDomainTokenId(label);

  spinner.start(`Reading delegate for ${label}.dot`);
  const delegate = await performContractCall<Address>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "getApproved",
    [tokenId],
  );
  spinner.succeed(`Delegate for ${label}.dot`);

  return !delegate || delegate === zeroAddress ? null : delegate;
}
