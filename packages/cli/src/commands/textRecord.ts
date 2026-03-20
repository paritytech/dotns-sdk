import chalk from "chalk";
import type { Ora } from "ora";
import { namehash, zeroAddress } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import { getResolverNodeInfo, requireResolverAuthorization } from "./resolverAuth";

export async function viewDomainText(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  key: string,
  spinner: Ora,
): Promise<string | undefined> {
  const namehashNode = namehash(`${label}.dot`);
  spinner.start("Querying registry");

  const recordExists = await performContractCall<boolean>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "recordExists",
    [namehashNode],
  );

  const ownerAddress = await performContractCall<Address>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "owner",
    [namehashNode],
  );

  spinner.succeed("Registry read");

  console.log(chalk.gray("  registry: ") + chalk.white(CONTRACTS.DOTNS_REGISTRY));
  console.log(chalk.gray("  domain:   ") + chalk.cyan(`${label}.dot`));
  console.log(chalk.gray("  node:     ") + chalk.white(namehashNode));
  console.log(chalk.gray("  exists:   ") + chalk.white(String(recordExists)));
  console.log(chalk.gray("  owner:    ") + chalk.white(ownerAddress));
  console.log();

  if (!recordExists || ownerAddress === zeroAddress) {
    console.log(chalk.yellow("  status: Domain not registered"));
    return undefined;
  }

  const value = await performContractCall<string>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "text",
    [namehashNode, key],
  );

  console.log(chalk.gray("  resolver: ") + chalk.white(CONTRACTS.DOTNS_CONTENT_RESOLVER));
  console.log(chalk.gray("  key:      ") + chalk.white(key));
  console.log(chalk.gray("  value:    ") + chalk.cyan(value || "(not set)"));

  return value;
}

export async function setDomainText(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  label: string,
  key: string,
  value: string,
  spinner: Ora,
): Promise<void> {
  const namehashNode = namehash(`${label}.dot`);

  console.log(chalk.gray("  domain: ") + chalk.cyan(`${label}.dot`));
  console.log(chalk.gray("  node:   ") + chalk.white(namehashNode));
  console.log();

  const { exists, owner, caller } = await getResolverNodeInfo(
    clientWrapper,
    originSubstrateAddress,
    namehashNode,
  );

  console.log(chalk.gray("  exists:  ") + chalk.white(String(exists)));
  console.log(chalk.gray("  owner:   ") + chalk.white(owner));
  console.log(chalk.gray("  caller:  ") + chalk.white(caller));
  console.log();

  if (!exists) {
    throw new Error(`Domain ${label}.dot is not registered`);
  }

  await requireResolverAuthorization(clientWrapper, originSubstrateAddress, owner, caller);

  console.log(chalk.gray("  status: ") + chalk.green("Ownership verified"));
  console.log();

  try {
    const currentValue = await performContractCall<string>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_CONTENT_RESOLVER,
      DOTNS_CONTENT_RESOLVER_ABI,
      "text",
      [namehashNode, key],
    );
    console.log(chalk.gray("  current: ") + chalk.cyan(currentValue || "(not set)"));
  } catch {
    console.log(chalk.gray("  current: ") + chalk.yellow("Not set or error reading"));
  }
  console.log();

  console.log(chalk.gray("  resolver: ") + chalk.white(CONTRACTS.DOTNS_CONTENT_RESOLVER));
  console.log(chalk.gray("  node:     ") + chalk.white(namehashNode));
  console.log(chalk.gray("  key:      ") + chalk.white(key));
  console.log(chalk.gray("  value:    ") + chalk.cyan(value));

  spinner.start("Submitting setText");
  const transactionHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setText",
    [namehashNode, key, value],
    originSubstrateAddress,
    signer,
    spinner,
    "setText",
  );

  console.log(chalk.gray("  tx:       ") + chalk.blue(transactionHash));

  const updatedValue = await performContractCall<string>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "text",
    [namehashNode, key],
  );

  console.log();
  console.log(chalk.gray("  new: ") + chalk.cyan(updatedValue));
}
