import chalk from "chalk";
import ora from "ora";
import { namehash, type Address, type Hex, zeroAddress, checksumAddress } from "viem";
import { CID } from "multiformats/cid";
import * as digest from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";

const IPFS_NAMESPACE = 0xe3;
const IPFS_CIDV1_RAW = 0x55;

function hexToBytes(hex: Hex): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

async function decodeContenthashToCid(contenthash: Hex): Promise<string> {
  if (contenthash === "0x" || contenthash === "0x0" || contenthash.length < 6) {
    return "No CID set";
  }

  try {
    const contenthashBytes = hexToBytes(contenthash);
    let cidDataBytes: Uint8Array;

    if (contenthashBytes[0] === IPFS_NAMESPACE) {
      cidDataBytes = contenthashBytes.slice(1);
    } else {
      cidDataBytes = contenthashBytes;
    }

    try {
      const decodedCid = CID.decode(cidDataBytes);
      return decodedCid.toString();
    } catch {
      // Continue to fallback parsing
    }

    if (cidDataBytes[0] === 0x01 && cidDataBytes[1] === 0x12 && cidDataBytes[2] === 0x20) {
      const multihashBytes = cidDataBytes.slice(1);
      const hashBytes = multihashBytes.slice(2);
      const multihashDigest = digest.create(sha256.code, hashBytes);
      const reconstructedCid = CID.createV1(IPFS_CIDV1_RAW, multihashDigest);
      return reconstructedCid.toString();
    }

    if (cidDataBytes[0] === 0x12 && cidDataBytes[1] === 0x20) {
      const hashBytes = cidDataBytes.slice(2);
      const multihashDigest = digest.create(sha256.code, hashBytes);
      const reconstructedCid = CID.createV0(multihashDigest);
      return reconstructedCid.toString();
    }

    return `Unable to decode: ${contenthash}`;
  } catch (error) {
    console.error("Error decoding contenthash:", error);
    return `Unable to decode: ${contenthash}`;
  }
}

function encodeCidToContenthash(cidString: string): Hex {
  try {
    const cid = CID.parse(cidString);
    const cidBytes = cid.bytes;
    const contenthash = new Uint8Array(1 + cidBytes.length);
    contenthash[0] = IPFS_NAMESPACE;
    contenthash.set(cidBytes, 1);
    return bytesToHex(contenthash);
  } catch (error) {
    console.error("Error encoding CID to contenthash:", error);
    throw new Error(`Invalid CID: ${cidString}`);
  }
}

export async function viewDomainContentHash(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  label: string,
): Promise<void> {
  const namehashNode = namehash(`${label}.dot`);
  const spinner = ora("Querying registry").start();

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

  const decodedCid = await decodeContenthashToCid(contentHashBytes);

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
    console.log(chalk.red("  Domain is not registered"));
    return;
  }

  if (checksumAddress(ownerAddress) !== checksumAddress(callerEvmAddress)) {
    console.log(
      chalk.red(
        `  You do not own this domain. Owner is ${ownerAddress}, but you are ${callerEvmAddress}`,
      ),
    );
    return;
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
    const currentCid = await decodeContenthashToCid(currentContentHash);
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

  const spinner = ora("Submitting setContenthash").start();
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

  const updatedCid = await decodeContenthashToCid(updatedContentHash);

  console.log();
  console.log(chalk.gray("  new: ") + chalk.cyan(updatedCid));
}
