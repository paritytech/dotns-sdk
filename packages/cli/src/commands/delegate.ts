import type { Ora } from "ora";
import { zeroAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRAR_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import {
  computeDomainTokenId,
  performContractCall,
  submitContractTransaction,
} from "../utils/contractInteractions";
import { validateDomainLabel, asLabel } from "../utils/validation";

export type DelegateResult = {
  name: string;
  delegate: Address;
  txHash: string;
};

export type RecordDelegateResult = {
  operator: Address;
  approved: boolean;
  txHash: string;
};

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

export async function setRecordDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  operator: Address,
  approved: boolean,
  spinner: Ora,
): Promise<RecordDelegateResult> {
  const action = approved ? "Delegating record control to" : "Revoking record control from";
  spinner.start(`${action} ${operator}`);
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setApprovalForAll",
    [operator, approved],
    originSubstrateAddress,
    signer,
    spinner,
    action,
  );

  return { operator, approved, txHash };
}

export async function getRecordDelegate(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  operator: Address,
  spinner: Ora,
): Promise<boolean> {
  const owner = await clientWrapper.getEvmAddress(originSubstrateAddress);

  spinner.start(`Reading record delegation for ${operator}`);
  const approved = await performContractCall<boolean>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "isApprovedForAll",
    [owner, operator],
  );
  spinner.succeed(`Record delegation for ${operator}`);

  return approved;
}
