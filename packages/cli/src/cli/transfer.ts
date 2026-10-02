import { checksumAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read, write, ownEvmAddress } from "../core/context";
import { DOTNS_REGISTRAR_ABI, DOTNS_REGISTRY_ABI } from "../utils/constants";
import {
  validateExistingNameLabel,
  isDeviceLabel,
  isValidSubstrateAddress,
} from "../utils/validation";
import { convertWeiToNativeCeil } from "../utils/formatting";
import { inspectName } from "../commands/inspectName";
import {
  assertIsToken,
  assertNotSoulbound,
  assertIsOwner,
  assertRegistered,
} from "../commands/preflight";
import { domainNode, formatDomainName, normaliseName } from "../core/naming";

function isLabelLike(input: string): boolean {
  // A device name carries a separator and is still one label, so it is a valid
  // recipient even though it does not match the ordinary shape.
  return /^[a-z0-9-]{3,}$/.test(input) || isDeviceLabel(input);
}

// The registry answers for every name: a subname (a device name included) returns its
// stored owner, a tokenised name delegates to the registrar, and a missing one is zero.
async function ownerOfLabel(ctx: DotnsContext, label: string): Promise<Address> {
  const node = await domainNode(ctx, label);
  return read<Address>(ctx, ctx.contracts.DOTNS_REGISTRY, DOTNS_REGISTRY_ABI, "owner", [node]);
}

// Resolves a recipient identifier to its EVM address. Classify in priority order;
// an SS58 address must be matched before the label branch because its lowercased
// form is all [a-z0-9] and would pass isLabelLike.
export async function resolveTransferRecipient(
  ctx: DotnsContext,
  recipientIdentifier: string,
): Promise<Address> {
  const input = recipientIdentifier.trim();

  if (isAddress(input)) return checksumAddress(input as Address);

  if (isValidSubstrateAddress(input)) {
    return checksumAddress(await ctx.clientWrapper.getEvmAddress(input));
  }

  // A name is a label plus at most one TLD segment, and a device name carries a
  // separator of its own, so allow one segment more for `joseph.42.dot`. Reject
  // anything else here so clearly-invalid input fails without a chain read.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+){0,2}$/.test(input.toLowerCase())) {
    const label = await normaliseName(ctx, input);
    if (isLabelLike(label)) {
      const ownerAddress = await ownerOfLabel(ctx, label);
      if (ownerAddress === zeroAddress) {
        throw new Error(`Domain ${await formatDomainName(ctx, label)} has no owner`);
      }
      return checksumAddress(ownerAddress);
    }
  }

  throw new Error(
    `Unrecognised recipient "${input}": expected an EVM address, SS58 address, or domain name.`,
  );
}

export type TransferResult = {
  name: string;
  from: Address;
  to: Address;
  feeWei: bigint;
  txHash: Hex;
};

// Transfers ownership of `label` to `recipient`. The source address is derived
// internally from the caller's own (round-trip-checked) EVM address: it can never
// be supplied by the caller, so the ownership check and the transferFrom source
// always match the signing account.
export async function transferName(
  ctx: DotnsContext,
  name: string,
  recipient: Address,
): Promise<TransferResult> {
  const label = await normaliseName(ctx, name);
  validateExistingNameLabel(label);

  const from = await ownEvmAddress(ctx);
  const fromC = checksumAddress(from);
  const toC = checksumAddress(recipient);

  const inspection = await inspectName(ctx, label);
  assertRegistered(inspection, "transfer");
  assertIsToken(inspection, "transfer");
  assertNotSoulbound(inspection, "transfer");
  assertIsOwner(inspection, fromC, "transfer");
  const { domain, tokenId } = inspection;

  // Quote the transfer fee the registrar will charge: the name's own price when the
  // recipient does not meet the label's required tier or sits below the sender's tier,
  // and zero otherwise (also for self-transfers and escrow moves). Sending less than the
  // quoted amount reverts with TransferFeeRequired.
  const feeWei = await read<bigint>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "quoteTransferFee",
    [tokenId, toC],
  );
  const feeNative = convertWeiToNativeCeil(feeWei, ctx.nativeTokenDecimals);

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    feeNative,
    DOTNS_REGISTRAR_ABI,
    "transferFrom",
    [fromC, toC, tokenId],
    "Transfer",
  );

  return { name: domain, from: fromC, to: toC, feeWei, txHash };
}
