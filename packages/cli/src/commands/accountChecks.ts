import chalk from "chalk";
import ora from "ora";
import { isAddress, getAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import type { IsMappedResult, IsWhitelistedResult, WhitelistResult } from "../types/types";
import { CONTRACTS, DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import { isValidSubstrateAddress } from "../utils/validation";

function resolveToEvmAddress(
  clientWrapper: ReviveClientWrapper,
  address: string,
):
  | Promise<{ evmAddress: Address; originalAddress: string }>
  | {
      evmAddress: Address;
      originalAddress: string;
    } {
  if (isAddress(address)) {
    return { evmAddress: getAddress(address), originalAddress: address };
  }
  if (!isValidSubstrateAddress(address)) {
    throw new Error(`Invalid address: not a valid EVM or Substrate address`);
  }
  return clientWrapper.getEvmAddress(address).then((evm) => ({
    evmAddress: evm,
    originalAddress: address,
  }));
}

export async function checkAccountMapped(
  clientWrapper: ReviveClientWrapper,
  originAddress: string,
  targetAddress: string,
): Promise<IsMappedResult> {
  const spinner = ora("Resolving address").start();
  const { evmAddress, originalAddress } = await resolveToEvmAddress(clientWrapper, targetAddress);

  spinner.text = "Checking account mapping";
  const isMapped = await clientWrapper.checkIfAccountMapped(originalAddress);

  spinner.succeed("Mapping check complete");
  console.log(chalk.gray("\n  address: ") + chalk.white(originalAddress));
  console.log(chalk.gray("  evm:     ") + chalk.cyan(evmAddress));
  console.log(chalk.gray("  mapped:  ") + (isMapped ? chalk.green("true") : chalk.yellow("false")));

  return { address: originalAddress, evmAddress, isMapped };
}

export async function checkWhitelisted(
  clientWrapper: ReviveClientWrapper,
  originAddress: string,
  targetAddress: string,
): Promise<IsWhitelistedResult> {
  const spinner = ora("Resolving address").start();
  const { evmAddress, originalAddress } = await resolveToEvmAddress(clientWrapper, targetAddress);

  spinner.text = "Checking whitelist status";
  const isWhitelisted = await performContractCall<boolean>(
    clientWrapper,
    originAddress,
    CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "isWhiteListed",
    [evmAddress],
  );

  spinner.succeed("Whitelist check complete");
  console.log(chalk.gray("\n  address:     ") + chalk.white(originalAddress));
  console.log(chalk.gray("  evm:         ") + chalk.cyan(evmAddress));
  console.log(
    chalk.gray("  whitelisted: ") + (isWhitelisted ? chalk.green("true") : chalk.yellow("false")),
  );

  return { address: originalAddress, evmAddress, isWhitelisted };
}

export async function whitelistAddress(
  clientWrapper: ReviveClientWrapper,
  originAddress: string,
  signer: PolkadotSigner,
  targetAddress: string,
  enable: boolean = true,
): Promise<WhitelistResult> {
  const spinner = ora("Resolving address").start();
  const { evmAddress, originalAddress } = await resolveToEvmAddress(clientWrapper, targetAddress);

  spinner.text = enable ? "Whitelisting address" : "Removing from whitelist";
  const txHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
    0n,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "whiteListAddress",
    [evmAddress, enable],
    originAddress,
    signer,
    spinner,
    enable ? "Whitelist" : "Un-whitelist",
  );

  spinner.text = "Verifying on-chain";
  const verified = await performContractCall<boolean>(
    clientWrapper,
    originAddress,
    CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "isWhiteListed",
    [evmAddress],
  );

  spinner.succeed(enable ? "Address whitelisted" : "Address removed from whitelist");
  console.log(chalk.gray("\n  address:     ") + chalk.white(originalAddress));
  console.log(chalk.gray("  evm:         ") + chalk.cyan(evmAddress));
  console.log(chalk.gray("  txHash:      ") + chalk.white(txHash));
  console.log(
    chalk.gray("  whitelisted: ") + (verified ? chalk.green("true") : chalk.yellow("false")),
  );

  return { address: originalAddress, evmAddress, whitelisted: verified, txHash };
}
