import chalk from "chalk";
import ora from "ora";
import { checksumAddress, isAddress, zeroAddress, type Address } from "viem";
import { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRAR_ABI } from "../utils/constants";
import { validateDomainLabel } from "../utils/validation";
import {
  computeDomainTokenId,
  performContractCall,
  submitContractTransaction,
} from "../utils/contractInteractions";

function toChecksummed(a: Address): Address {
  return checksumAddress(a) as Address;
}

function isLabelLike(input: string): boolean {
  return /^[a-z0-9-]{3,}$/.test(input);
}

function asDotLabel(input: string): string {
  const raw = input.trim().toLowerCase();
  if (raw.endsWith(".dot")) return raw.slice(0, -4);
  return raw;
}

async function ownerOfLabel(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
): Promise<Address> {
  const tokenId = computeDomainTokenId(label);
  return await performContractCall<Address>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "ownerOf",
    [tokenId],
  );
}

export async function resolveTransferRecipient(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  recipientIdentifier: string,
): Promise<Address> {
  const input = recipientIdentifier.trim();

  if (isAddress(input)) return toChecksummed(input as Address);

  const label = asDotLabel(input);
  if (isLabelLike(label)) {
    const spinner = ora(`Resolving ${chalk.cyan(label + ".dot")} to owner address`).start();

    const ownerAddress = await ownerOfLabel(clientWrapper, originSubstrateAddress, label);

    if (ownerAddress === zeroAddress) {
      spinner.fail(`No owner found for ${chalk.cyan(label + ".dot")} (unregistered)`);
      throw new Error(`Domain ${label}.dot has no owner`);
    }

    spinner.succeed(`${chalk.cyan(label + ".dot")} → ${chalk.white(toChecksummed(ownerAddress))}`);
    return toChecksummed(ownerAddress);
  }

  const spinner = ora(`Resolving recipient address`).start();
  const evmAddress = await clientWrapper.getEvmAddress(input);
  spinner.succeed(`${chalk.white(input)} → ${chalk.white(toChecksummed(evmAddress))}`);
  return toChecksummed(evmAddress);
}

export async function transferDomain(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: any,
  fromAddress: Address,
  toAddress: Address,
  label: string,
): Promise<void> {
  const spinner = ora().start();

  const normLabel = asDotLabel(label);
  spinner.text = `Validating ${chalk.cyan(normLabel + ".dot")}`;
  validateDomainLabel(normLabel);
  spinner.succeed(`Valid: ${chalk.cyan(normLabel + ".dot")}`);

  spinner.start(`Checking owner of ${chalk.cyan(normLabel + ".dot")}`);
  const tokenId = computeDomainTokenId(normLabel);
  const currentOwner = await ownerOfLabel(clientWrapper, originSubstrateAddress, normLabel);
  const currentOwnerC = toChecksummed(currentOwner);
  spinner.succeed(`Owner: ${chalk.cyan(normLabel + ".dot")} → ${chalk.white(currentOwnerC)}`);

  const fromC = toChecksummed(fromAddress);
  const toC = toChecksummed(toAddress);

  if (currentOwner === zeroAddress) {
    spinner.fail(`${chalk.cyan(normLabel + ".dot")} is not registered`);
    throw new Error(`Cannot transfer: ${normLabel}.dot is not registered`);
  }

  if (currentOwnerC !== fromC) {
    spinner.fail(`Not authorized to transfer ${chalk.cyan(normLabel + ".dot")}`);
    console.log(chalk.gray("  expected owner: ") + chalk.white(fromC));
    console.log(chalk.gray("  on-chain owner: ") + chalk.white(currentOwnerC));
    throw new Error(`Cannot transfer: ${normLabel}.dot owned by ${currentOwnerC}`);
  }

  spinner.start(`Submitting transfer ${chalk.cyan(normLabel + ".dot")} → ${chalk.green(toC)}`);

  const transactionHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "transferFrom",
    [fromC, toC, tokenId],
    originSubstrateAddress,
    signer,
    spinner,
    "Transfer",
  );

  spinner.succeed(`Transfer finalized`);
  console.log(chalk.gray("  tx:   ") + chalk.blue(transactionHash));
  console.log(chalk.gray("  from: ") + chalk.yellow(fromC));
  console.log(chalk.gray("  to:   ") + chalk.green(toC));
  console.log(chalk.gray("  name: ") + chalk.cyan(normLabel + ".dot"));
}
