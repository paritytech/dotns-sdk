import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hex,
  concatHex,
} from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import type { TransactionStatus } from "../types/types";
import { withTimeout } from "./formatting";

// An empty-data revert has two common, unrelated causes, so the hint names both
// rather than asserting the origin is unmapped: a genuinely unmapped origin makes
// pallet-revive reject reads with empty data, but so does calling a selector the
// deployed contract does not expose, which is exactly what a stale ABI produces.
export const EMPTY_DATA_REVERT_HINT =
  "An empty-data revert usually means one of two things: the origin SS58 is not " +
  "mapped on Asset Hub Revive (run `dotns account map`, or send any signed " +
  "transaction from this account, then retry), or the deployed contract exposes no " +
  "function for this call's selector (the synced ABI may be out of date for this " +
  "deployment).";

export function isRevertFlag(flags: bigint): boolean {
  return (flags & 1n) === 1n;
}

/**
 * A revert carrying revert data: the contract ran and rejected the call, so the
 * failure is an answer rather than a failure to reach the chain.
 *
 * Deliberately not raised for the empty-data revert, whose causes are an unmapped
 * origin or a stale-ABI selector mismatch ({@link EMPTY_DATA_REVERT_HINT}) — setup
 * problems with their own remedies — nor for RPC failures, ABI mismatches or decode
 * errors. Callers that treat a revert as information must not treat those the same
 * way.
 */
export class ContractRevertError extends Error {
  constructor(revertReason: string) {
    super(`Contract reverted: ${revertReason}`);
    this.name = "ContractRevertError";
  }
}

export function buildRevertError(data: Hex, abi: Abi): Error {
  if (data === "0x") {
    return new Error(`Contract reverted with empty data. ${EMPTY_DATA_REVERT_HINT}`);
  }

  let revertReason: string = data;
  try {
    const decoded = decodeErrorResult({ abi, data });
    revertReason = decoded.args
      ? `${decoded.errorName}(${decoded.args.map(String).join(", ")})`
      : decoded.errorName;
  } catch {
    // Unknown error selector — fall back to raw hex
  }
  return new ContractRevertError(revertReason);
}

export function decodeContractRevertError(data: Hex, abi: Abi, context: string): Error {
  if (data === "0x") {
    return new Error(`${context} reverted with empty data. ${EMPTY_DATA_REVERT_HINT}`);
  }

  return buildRevertError(data, abi);
}

export async function performContractCall<T>(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  contractAddress: Address,
  abi: Abi,
  functionName: string,
  args: any[],
): Promise<T> {
  const encodedData = encodeFunctionData({
    abi,
    functionName: functionName as any,
    args,
  });

  const call = await clientWrapper.performDryRunCall(
    originSubstrateAddress,
    contractAddress,
    0n,
    encodedData,
  );

  const data = (call?.result?.value?.data ?? "0x") as `0x${string}`;
  const flags = (call?.result?.value?.flags ?? 1n) as bigint;

  if (isRevertFlag(flags)) {
    throw buildRevertError(data, abi);
  }

  if (data === "0x") {
    throw new Error(
      `Contract call ${functionName} at ${contractAddress} returned empty data ` +
        `(non-revert). The address likely has no contract deployed for the current ` +
        `environment, or the deployment was replaced. Verify the configured address ` +
        `for this environment matches the latest deployment.`,
    );
  }

  let decoded: unknown;
  try {
    decoded = decodeFunctionResult({
      abi,
      functionName: functionName as any,
      data,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to decode ${functionName} response from ${contractAddress}: ${reason}. ` +
        `Raw data: ${data.slice(0, 66)}${data.length > 66 ? "…" : ""}. ` +
        `The ABI likely does not match the deployed contract at this address.`,
    );
  }

  return (Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded) as unknown as T;
}

export async function submitContractTransaction(
  clientWrapper: ReviveClientWrapper,
  contractAddress: Address,
  valueInNativeUnits: bigint,
  contractAbi: Abi,
  functionName: string,
  functionArguments: unknown[],
  signerSubstrateAddress: string,
  signer: PolkadotSigner,
  statusCallback: (status: TransactionStatus) => void,
  operationName: string,
  opTimeoutMs: number,
  signal?: AbortSignal,
): Promise<Hex> {
  const encodedCallData = encodeFunctionData({
    abi: contractAbi,
    functionName,
    args: functionArguments,
  }) as Hex;

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  if (signal?.aborted) abortController.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await withTimeout(
      clientWrapper.submitTransaction(
        contractAddress,
        valueInNativeUnits,
        encodedCallData,
        signerSubstrateAddress,
        signer,
        statusCallback,
        abortController.signal,
      ),
      opTimeoutMs,
      operationName,
      () => abortController.abort(),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("would revert: 0x")) {
      const hexMatch = error.message.match(/0x[0-9a-fA-F]*/);
      if (hexMatch) {
        throw decodeContractRevertError(hexMatch[0] as Hex, contractAbi, operationName);
      }
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

// One EIP-137 step: the node of `label` directly under `parent`, mirroring the
// on-chain `LabelUtils.namehashUnder(parent, labelhash)`.
function namehashUnder(parent: Hex, label: string): Hex {
  return keccak256(concatHex([parent, keccak256(toBytes(label))]));
}

// EIP-137 namehash of a bare name (TLD already stripped) under `tldNode`: labels
// fold right to left, as in `DotnsRegistry._parentNamehash`. Since dotns v0.7.0
// this also covers a lite personhood name: `joseph.42` is `joseph` beneath the
// container `42` (`SubnodeUtils.liteSubnodeOf`), which is exactly this fold.
// `tldNode` is read from the protocol registry; each deployment has its own TLD.
export function deriveDomainNode(tldNode: Hex, name: string): Hex {
  return name.split(".").reduceRight<Hex>((parent, label) => namehashUnder(parent, label), tldNode);
}

// Pre-v0.7.0 deployments minted a lite name as ONE label — the whole dotted
// string hashed flat under the TLD. Names minted before an in-place upgrade
// keep living at this node, so readers fall back to it when the folded node
// has no record (see `domainNode` in core/naming.ts).
export function deriveLegacyLiteNode(tldNode: Hex, liteLabel: string): Hex {
  return namehashUnder(tldNode, liteLabel);
}

// The minted ERC721 tokenId is `uint256(node)`; only second-level names are tokenised.
export function deriveDomainTokenId(tldNode: Hex, name: string): bigint {
  return BigInt(deriveDomainNode(tldNode, name));
}
