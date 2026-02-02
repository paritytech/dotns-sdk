import { checksumAddress, zeroAddress, type Address } from "viem";
import { connectDotns } from "./00_shared";

import { setDomainContentHash } from "../commands/content-hash";
import {
  performContractCall,
  submitContractTransaction,
  computeDomainTokenId,
} from "../utils/contract-interactions";
import { CONTRACTS, DOTNS_REGISTRAR_ABI } from "../utils/constants";
import { validateDomainLabel } from "../utils/validation";

async function resolveRecipient(
  clientWrapper: any,
  originSubstrateAddress: string,
  recipientIdentifier: string,
): Promise<Address> {
  if (recipientIdentifier.startsWith("0x")) return recipientIdentifier as Address;

  // If it's a label like "alice", resolve alice.dot → owner EVM address
  if (/^[a-z0-9-]{3,}$/.test(recipientIdentifier)) {
    const tokenId = computeDomainTokenId(recipientIdentifier);
    const ownerAddress = await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRAR,
      DOTNS_REGISTRAR_ABI,
      "ownerOf",
      [tokenId],
    );

    if (ownerAddress === zeroAddress)
      throw new Error(`Domain ${recipientIdentifier}.dot has no owner`);
    return ownerAddress;
  }

  // Otherwise treat as SS58 and map to EVM
  return clientWrapper.getEvmAddress(recipientIdentifier);
}

async function main() {
  const { clientWrapper, substrateAddress, evmAddress, signer } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  validateDomainLabel(label);

  // 1) Set content hash
  const cid = process.env.DOTNS_CID ?? "bafybeigdyr...replace_me";
  await setDomainContentHash(clientWrapper, substrateAddress, signer, `${label}.dot`, cid);
  console.log("Set content hash:", `${label}.dot -> ${cid}`);

  // 2) Transfer (optional)
  const transferTo = process.env.DOTNS_TO;
  if (!transferTo) return;

  const toAddress = await resolveRecipient(clientWrapper, substrateAddress, transferTo);
  const tokenId = computeDomainTokenId(label);

  const currentOwner = await performContractCall<Address>(
    clientWrapper,
    substrateAddress,
    CONTRACTS.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "ownerOf",
    [tokenId],
  );

  if (checksumAddress(currentOwner) !== checksumAddress(evmAddress)) {
    throw new Error(`Not owner. ownerOf(${label})=${currentOwner}, me=${evmAddress}`);
  }

  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "transferFrom",
    [evmAddress, toAddress, tokenId],
    substrateAddress,
    signer,
    undefined,
    "Transfer",
  );

  console.log("Transfer tx:", txHash);
  console.log("From:       ", evmAddress);
  console.log("To:         ", toAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
