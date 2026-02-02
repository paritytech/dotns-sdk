import {
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hex,
  concatHex,
} from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { Ora } from "ora";
import type { ReviveClientWrapper } from "../client/polkadot-client";
import { DOT_NODE, OPERATION_TIMEOUT_MILLISECONDS } from "./constants";
import { createTransactionStatusHandler, withTimeout } from "./formatting";

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

  if ((flags & 1n) === 1n) {
    throw new Error(`Contract reverted (flags=${flags}) with data: ${data}`);
  }

  const decoded = decodeFunctionResult({
    abi,
    functionName: functionName as any,
    data,
  });

  return ((Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded) as unknown) as T;
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
  spinner?: Ora,
  operationName?: string,
): Promise<Hex> {
  await clientWrapper.ensureAccountMapped(signerSubstrateAddress, signer);

  const encodedCallData = encodeFunctionData({
    abi: contractAbi,
    functionName,
    args: functionArguments,
  }) as Hex;

  return await withTimeout(
    clientWrapper.submitTransaction(
      contractAddress,
      valueInNativeUnits,
      encodedCallData,
      signerSubstrateAddress,
      signer,
      createTransactionStatusHandler(spinner, operationName),
    ),
    OPERATION_TIMEOUT_MILLISECONDS,
    operationName || "Transaction",
  );
}

export function computeDomainTokenId(label: string): bigint {
  const labelhash = keccak256(toBytes(label));              
  const node = keccak256(concatHex([DOT_NODE, labelhash])); 
  return BigInt(node);
}
