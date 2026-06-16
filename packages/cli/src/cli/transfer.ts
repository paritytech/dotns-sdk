import { checksumAddress, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read, write, ownEvmAddress } from "../core/context";
import { DOTNS_REGISTRAR_ABI } from "../utils/constants";
import { validateDomainLabel, normaliseLabel, isValidSubstrateAddress } from "../utils/validation";
import { formatErrorMessage, convertWeiToNativeCeil } from "../utils/formatting";
import { computeDomainTokenId } from "../utils/contractInteractions";

function toChecksummed(a: Address): Address {
  return checksumAddress(a) as Address;
}

function isLabelLike(input: string): boolean {
  return /^[a-z0-9-]{3,}$/.test(input);
}

async function ownerOfLabel(ctx: DotnsContext, label: string): Promise<Address> {
  const tokenId = computeDomainTokenId(label);
  return read<Address>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "ownerOf", [
    tokenId,
  ]);
}

// Resolves a recipient identifier to its EVM address. Classify in priority order;
// an SS58 address must be matched before the label branch because its lowercased
// form is all [a-z0-9] and would pass isLabelLike.
export async function resolveTransferRecipient(
  ctx: DotnsContext,
  recipientIdentifier: string,
): Promise<Address> {
  const input = recipientIdentifier.trim();

  if (isAddress(input)) return toChecksummed(input as Address);

  if (isValidSubstrateAddress(input)) {
    return toChecksummed(await ctx.clientWrapper.getEvmAddress(input));
  }

  const label = normaliseLabel(input);
  if (isLabelLike(label)) {
    const ownerAddress = await ownerOfLabel(ctx, label);
    if (ownerAddress === zeroAddress) {
      throw new Error(`Domain ${label}.dot has no owner`);
    }
    return toChecksummed(ownerAddress);
  }

  throw new Error(
    `Unrecognised recipient "${input}" — expected an EVM address, SS58 address, or .dot label.`,
  );
}

export type TransferResult = {
  name: string;
  from: Address;
  to: Address;
  feeWei: bigint;
  txHash: Hex;
};

// The syncLabel write was a one-off migration helper that fired an extra signed
// transaction on every transfer. It must never run for an injected host signer,
// so it is gated behind an explicit CLI-only opt-in and stays off by default.
async function syncLabelWithRegistrar(
  ctx: DotnsContext,
  label: string,
  tokenId: bigint,
): Promise<void> {
  try {
    await write(
      ctx,
      ctx.contracts.DOTNS_REGISTRAR,
      0n,
      DOTNS_REGISTRAR_ABI,
      "syncLabel",
      [tokenId, label],
      "Label sync",
    );
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (!errorMessage.includes("LabelAlreadySet")) throw error;
  }
}

export type TransferNameOptions = {
  syncLabel?: boolean;
};

// Transfers ownership of `label`.dot to `recipient`. The source address is derived
// internally from the caller's own (round-trip-checked) EVM address: it can never
// be supplied by the caller, so the ownership check and the transferFrom source
// always match the signing account.
export async function transferName(
  ctx: DotnsContext,
  name: string,
  recipient: Address,
  opts: TransferNameOptions = {},
): Promise<TransferResult> {
  const label = normaliseLabel(name);
  validateDomainLabel(label);

  const tokenId = computeDomainTokenId(label);
  const from = await ownEvmAddress(ctx);
  const fromC = toChecksummed(from);
  const toC = toChecksummed(recipient);

  const currentOwner = await ownerOfLabel(ctx, label);
  if (currentOwner === zeroAddress) {
    throw new Error(`Cannot transfer: ${label}.dot is not registered`);
  }
  const currentOwnerC = toChecksummed(currentOwner);
  if (currentOwnerC !== fromC) {
    throw new Error(`Cannot transfer: ${label}.dot owned by ${currentOwnerC}`);
  }

  if (opts.syncLabel) {
    await syncLabelWithRegistrar(ctx, label, tokenId);
  }

  // Quote the friction fee the registrar will charge: zero for same-tier or upward
  // transfers, D for a downward step or a label-class reach-floor mismatch. Sending
  // less than the quoted amount reverts with TransferFeeRequired.
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

  return { name: `${label}.dot`, from: fromC, to: toC, feeWei, txHash };
}
