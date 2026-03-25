import {
  encodeFunctionData,
  decodeFunctionResult,
  namehash,
  getAddress,
  zeroAddress,
  type Address,
} from "viem";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useAbiStore } from "@/store/useAbiStore";
import { useTransactionStore } from "@/store/useTransactionStore";
import { computeDomainTokenId, normalizeDomainName } from "@/utils";
import type { Aggregate3Call, Aggregate3Result } from "@/type";

const MULTICALL_CHUNK_SIZE = 20;

function isSubname(value: string): boolean {
  const name = value.endsWith(".dot") ? value.slice(0, -4) : value;
  return name.includes(".");
}

export function useMulticallOwnership() {
  const networkStore = useNetworkStore();
  const abiStore = useAbiStore();
  const transactionStore = useTransactionStore();

  function encodeOwnerOfCall(value: string): {
    callData: `0x${string}`;
    isSubnameCall: boolean;
  } {
    if (isSubname(value)) {
      const fullName = value.endsWith(".dot") ? value : `${value}.dot`;
      const node = namehash(fullName);
      return {
        callData: encodeFunctionData({
          abi: abiStore.getABI("DotnsRegistry"),
          functionName: "owner",
          args: [node],
        }),
        isSubnameCall: true,
      };
    }

    const label = normalizeDomainName(value);
    const tokenId = computeDomainTokenId(label);
    return {
      callData: encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "ownerOf",
        args: [tokenId],
      }),
      isSubnameCall: false,
    };
  }

  async function multicallOwnerOfChunk(
    multicallAddress: Address,
    chunk: Aggregate3Call[],
    originSs58: string,
  ): Promise<Aggregate3Result[]> {
    const callData = encodeFunctionData({
      abi: abiStore.getABI("MultiCall"),
      functionName: "aggregate3",
      args: [chunk],
    });

    const client = await networkStore.getClient();
    const raw = await transactionStore.ethCall(client, originSs58, multicallAddress, callData);

    if (!raw || raw === "0x") return [];

    return decodeFunctionResult({
      abi: abiStore.getABI("MultiCall"),
      functionName: "aggregate3",
      data: raw,
    }) as Aggregate3Result[];
  }

  async function batchVerifyOwnership(
    names: string[],
    ownerAddress: Address,
  ): Promise<Map<string, boolean>> {
    const network = networkStore.currentNetwork;
    if (!network?.dotnsRegistrar || !network?.multiCall) return new Map();

    await abiStore.ensureAbis();

    const client = await networkStore.getClient();
    const originSs58 = await client.getSubstrateAddress(ownerAddress);

    const registrar = network.dotnsRegistrar as Address;
    const registry = network.dotnsRegistry as Address;
    const encodedCalls = names.map((value) => encodeOwnerOfCall(value));
    const calls: Aggregate3Call[] = encodedCalls.map((encoded) => ({
      target: encoded.isSubnameCall ? registry : registrar,
      allowFailure: true,
      callData: encoded.callData,
    }));

    const results: Aggregate3Result[] = [];
    for (let i = 0; i < calls.length; i += MULTICALL_CHUNK_SIZE) {
      const chunk = calls.slice(i, i + MULTICALL_CHUNK_SIZE);
      const chunkResults = await multicallOwnerOfChunk(network.multiCall, chunk, originSs58);
      results.push(...chunkResults);
    }

    const checksummedOwner = getAddress(ownerAddress);
    const ownershipMap = new Map<string, boolean>();

    for (let i = 0; i < names.length; i++) {
      const result = results[i];
      if (!result?.success) {
        ownershipMap.set(names[i]!, false);
        continue;
      }

      try {
        const isSubnameCall = encodedCalls[i]?.isSubnameCall ?? false;
        const decoded = decodeFunctionResult({
          abi: abiStore.getABI(isSubnameCall ? "DotnsRegistry" : "DotnsRegistrar"),
          functionName: isSubnameCall ? "owner" : "ownerOf",
          data: result.returnData,
        }) as Address;

        if (!decoded || decoded === zeroAddress) {
          ownershipMap.set(names[i]!, isSubnameCall);
          continue;
        }

        ownershipMap.set(names[i]!, getAddress(decoded) === checksummedOwner);
      } catch {
        ownershipMap.set(names[i]!, false);
      }
    }

    return ownershipMap;
  }

  return {
    encodeOwnerOfCall,
    multicallOwnerOfChunk,
    batchVerifyOwnership,
    isSubname,
  };
}
