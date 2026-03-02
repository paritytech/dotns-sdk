import chalk from "chalk";
import type { Ora } from "ora";
import { namehash, type Address, type Hex, zeroAddress, checksumAddress } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import { decodeIpfsContenthash, encodeIpfsContenthash } from "../bulletin/cid";

function decodeContenthashToCid(contenthash: Hex): string {
  if (contenthash === "0x" || contenthash === "0x0" || contenthash.length < 6) {
    return "No CID set";
  }

  const cid = decodeIpfsContenthash(contenthash);
  return cid ?? `Unable to decode: ${contenthash}`;
}

function encodeCidToContenthash(cidString: string): Hex {
  const encoded = encodeIpfsContenthash(cidString);
  return `0x${encoded}` as Hex;
}

export async function viewDomainContentHash(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
  spinner: Ora,
): Promise<void> {
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
    return;
  }

  const contentHashBytes = await performContractCall<Hex>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "contenthash",
    [namehashNode],
  );

  const decodedCid = decodeContenthashToCid(contentHashBytes);

  console.log(chalk.gray("  resolver:    ") + chalk.white(CONTRACTS.DOTNS_CONTENT_RESOLVER));
  console.log(chalk.gray("  contenthash: ") + chalk.white(contentHashBytes));
  console.log(chalk.gray("  cid:         ") + chalk.cyan(decodedCid));
}

export async function setDomainContentHash(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  signer: PolkadotSigner,
  label: string,
  contentId: string,
  spinner: Ora,
): Promise<void> {
  const namehashNode = namehash(`${label}.dot`);

  console.log(chalk.gray("  domain: ") + chalk.cyan(`${label}.dot`));
  console.log(chalk.gray("  node:   ") + chalk.white(namehashNode));
  console.log();

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

  const callerEvmAddress = await clientWrapper.getEvmAddress(originSubstrateAddress);

  console.log(chalk.gray("  exists:  ") + chalk.white(String(recordExists)));
  console.log(chalk.gray("  owner:   ") + chalk.white(ownerAddress));
  console.log(chalk.gray("  caller:  ") + chalk.white(callerEvmAddress));
  console.log();

  if (!recordExists || ownerAddress === zeroAddress) {
    throw new Error(`Domain ${label}.dot is not registered`);
  }

  if (checksumAddress(ownerAddress) !== checksumAddress(callerEvmAddress)) {
    throw new Error(
      `You do not own this domain. Owner is ${ownerAddress}, but you are ${callerEvmAddress}`,
    );
  }

  console.log(chalk.gray("  status: ") + chalk.green("Ownership verified"));
  console.log();

  try {
    const currentContentHash = await performContractCall<Hex>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_CONTENT_RESOLVER,
      DOTNS_CONTENT_RESOLVER_ABI,
      "contenthash",
      [namehashNode],
    );
    const currentCid = decodeContenthashToCid(currentContentHash);
    console.log(chalk.gray("  current: ") + chalk.cyan(currentCid));
  } catch {
    console.log(chalk.gray("  current: ") + chalk.yellow("Not set or error reading"));
  }
  console.log();

  const contentBytes = encodeCidToContenthash(contentId);

  console.log(chalk.gray("  resolver: ") + chalk.white(CONTRACTS.DOTNS_CONTENT_RESOLVER));
  console.log(chalk.gray("  node:     ") + chalk.white(namehashNode));
  console.log(chalk.gray("  cid:      ") + chalk.cyan(contentId));
  console.log(chalk.gray("  bytes:    ") + chalk.white(contentBytes));

  spinner.start("Submitting setContenthash");
  const transactionHash = await submitContractTransaction(
    clientWrapper,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    0n,
    DOTNS_CONTENT_RESOLVER_ABI,
    "setContenthash",
    [namehashNode, contentBytes],
    originSubstrateAddress,
    signer,
    spinner,
    "setContenthash",
  );

  console.log(chalk.gray("  tx:       ") + chalk.blue(transactionHash));

  const updatedContentHash = await performContractCall<Hex>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "contenthash",
    [namehashNode],
  );

  const updatedCid = decodeContenthashToCid(updatedContentHash);

  console.log();
  console.log(chalk.gray("  new: ") + chalk.cyan(updatedCid));
}
