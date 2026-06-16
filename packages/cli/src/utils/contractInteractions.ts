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
import { DOT_NODE } from "./constants";
import { withTimeout } from "./formatting";

export const UNMAPPED_ORIGIN_REVERT_HINT =
  "Contract reverted with empty data. The origin SS58 is likely not mapped on " +
  "Asset Hub Revive. Run `dotns account map` (or any signed transaction from " +
  "this account), then retry.";

export function isRevertFlag(flags: bigint): boolean {
  return (flags & 1n) === 1n;
}

export function buildRevertError(data: Hex, abi: Abi): Error {
  if (data === "0x") {
    return new Error(UNMAPPED_ORIGIN_REVERT_HINT);
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
  return new Error(`Contract reverted: ${revertReason}`);
}

export function decodeContractRevertError(data: Hex, abi: Abi, context: string): Error {
  if (data === "0x") {
    return new Error(`${context} reverted with empty data. ${UNMAPPED_ORIGIN_REVERT_HINT}`);
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

export function computeDomainTokenId(label: string): bigint {
  const labelhash = keccak256(toBytes(label));
  const node = keccak256(concatHex([DOT_NODE, labelhash]));
  return BigInt(node);
}
