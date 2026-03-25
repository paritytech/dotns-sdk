import { defineStore } from "pinia";
import {
  encodeFunctionData,
  decodeFunctionResult,
  namehash,
  type Hash,
  type Address,
  zeroAddress,
  zeroHash,
} from "viem";
import { CID } from "multiformats/cid";
import { useNetworkStore } from "./useNetworkStore";
import { useTransactionStore } from "./useTransactionStore";
import { useAbiStore } from "./useAbiStore";
import { useWalletStore } from "./useWalletStore";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";
import type { TextRecord, TransactionResult, MulticallCall } from "@/type";

export const useResolverStore = defineStore("useResolverStore", () => {
  const networkStore = useNetworkStore();
  const transactionStore = useTransactionStore();
  const abiStore = useAbiStore();
  const walletStore = useWalletStore();

  async function getText(domain: string, key: string): Promise<string | null> {
    try {
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsContentResolver) throw new Error("Content resolver not configured");

      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "text",
        args: [node, key],
      });

      const client = await networkStore.getClient();
      const origin = walletStore.substrateAddress || ZERO_SUBSTRATE_ADDRESS;
      const result = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsContentResolver,
        callData,
      );

      if (!result || result === "0x") return null;

      const decoded = decodeFunctionResult({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "text",
        data: result,
      }) as any;

      return decoded && decoded !== "" && decoded !== "true" && decoded !== "false"
        ? decoded
        : null;
    } catch (error) {
      console.warn("[ResolverStore:getText]", error);
      return null;
    }
  }

  async function setText(domain: string, key: string, value: string): Promise<Hash> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsContentResolver) throw new Error("Content resolver not configured");

      const client = await networkStore.getClient();
      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "setText",
        args: [node, key, value],
      });

      return await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsContentResolver,
          data: callData,
        },
      );
    } catch (error) {
      console.warn("[ResolverStore:setText]", error);
      throw error;
    }
  }

  async function setContentHash(domain: string, ipfsCid: string): Promise<TransactionResult> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsContentResolver) throw new Error("Content resolver not configured");

      const client = await networkStore.getClient();
      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      // Parse and encode IPFS CID
      // EIP-1577 contenthash: 0xe3 (IPFS namespace) + 0x01 (version) + full CIDv1 bytes
      const cid = CID.parse(ipfsCid);
      const hex = Array.from(cid.bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const contentHash: `0x${string}` = `0xe301${hex}`;

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "setContenthash",
        args: [node, contentHash],
      });

      const hash = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsContentResolver,
          data: callData,
        },
      );

      return hash && hash !== zeroHash ? { hash, status: true } : { hash: zeroHash, status: false };
    } catch (error) {
      console.warn("[ResolverStore:setContentHash]", error);
      throw error;
    }
  }

  async function setProfileRecordsMulticall(
    domain: string,
    records: TextRecord[],
  ): Promise<TransactionResult> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsContentResolver || !network?.multiCall) {
        throw new Error("Resolver or multicall not configured");
      }

      const client = await networkStore.getClient();
      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      // Filter out empty records
      const validRecords = records.filter((r) => r.value && r.value.length > 0);
      if (validRecords.length === 0) return { status: false, hash: zeroHash };

      // Check if multicall is already approved
      const approvalData = encodeFunctionData({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "isApprovedForAll",
        args: [walletStore.evmAddress as Address, network.multiCall],
      });

      const approvedRaw = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.dotnsContentResolver,
        approvalData,
      );

      const approved = decodeFunctionResult({
        abi: abiStore.getABI("DotnsContentResolver"),
        functionName: "isApprovedForAll",
        data: approvedRaw,
      }) as boolean;

      if (!approved) {
        const setApprovalData = encodeFunctionData({
          abi: abiStore.getABI("DotnsContentResolver"),
          functionName: "setApprovalForAll",
          args: [network.multiCall, true],
        });

        await transactionStore.ethTransact(
          client,
          walletStore.getInjected(),
          walletStore.substrateAddress!,
          { to: network.dotnsContentResolver, data: setApprovalData },
        );
      }

      // Prepare multicall batch
      const calls: MulticallCall[] = validRecords.map((record) => ({
        target: network.dotnsContentResolver!,
        callData: encodeFunctionData({
          abi: abiStore.getABI("DotnsContentResolver"),
          functionName: "setText",
          args: [node, record.key, record.value],
        }),
      }));

      const multicallData = encodeFunctionData({
        abi: abiStore.getABI("MultiCall"),
        functionName: "aggregate",
        args: [calls],
      });

      // Execute multicall
      const multicallTx = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        { to: network.multiCall, data: multicallData },
      );

      // Revoke approval for security
      if (!approved) {
        const revokeApprovalData = encodeFunctionData({
          abi: abiStore.getABI("DotnsContentResolver"),
          functionName: "setApprovalForAll",
          args: [network.multiCall, false],
        });

        await transactionStore.ethTransact(
          client,
          walletStore.getInjected(),
          walletStore.substrateAddress!,
          { to: network.dotnsContentResolver, data: revokeApprovalData },
        );
      }

      return multicallTx && multicallTx !== zeroHash
        ? { hash: multicallTx, status: true }
        : { status: false, hash: zeroHash };
    } catch (error) {
      console.warn("[ResolverStore:setProfileRecordsMulticall]", error);
      return { status: false, hash: zeroHash };
    }
  }

  async function resolveNameToAddress(username: string): Promise<Address | null> {
    try {
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsResolver) {
        throw new Error("DotnsResolver not configured");
      }

      const node = namehash(`${normalizeDomainName(username)}.dot`);

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsResolver"),
        functionName: "addressOf",
        args: [node],
      });

      const client = await networkStore.getClient();
      const origin = walletStore.substrateAddress || ZERO_SUBSTRATE_ADDRESS;
      const result = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsResolver as Address,
        callData,
      );

      if (!result || result === "0x") return null;

      const resolved = decodeFunctionResult({
        abi: abiStore.getABI("DotnsResolver"),
        functionName: "addressOf",
        data: result,
      }) as Address;

      return resolved === zeroAddress ? null : resolved;
    } catch (error) {
      console.warn("[ResolverStore:resolveNameToAddress]", error);
      return null;
    }
  }

  async function getOwnerOfDomain(domain: string): Promise<Address | null> {
    try {
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrar) throw new Error("DotnsRegistrar contract not configured");

      const tokenId = computeDomainTokenId(normalizeDomainName(domain));

      const availableData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "available",
        args: [tokenId],
      });

      const client = await networkStore.getClient();
      const origin = walletStore.substrateAddress || ZERO_SUBSTRATE_ADDRESS;
      const availableRaw = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsRegistrar as Address,
        availableData,
      );

      if (!availableRaw || availableRaw === "0x") return null;

      const isAvailable = decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "available",
        data: availableRaw,
      }) as boolean;

      if (isAvailable) return null;

      const ownerOfData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "ownerOf",
        args: [tokenId],
      });

      const ownerRaw = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsRegistrar as Address,
        ownerOfData,
      );

      if (!ownerRaw || ownerRaw === "0x") return null;

      const owner = decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "ownerOf",
        data: ownerRaw,
      }) as Address;

      return owner === zeroAddress ? null : owner;
    } catch (error) {
      console.warn("[ResolverStore:getOwnerOfDomain]", error);
      return null;
    }
  }

  async function getOwnerOfSubname(fullName: string): Promise<Address | null> {
    try {
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistry) throw new Error("DotnsRegistry not configured");

      const node = namehash(fullName.endsWith(".dot") ? fullName : `${fullName}.dot`);

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistry"),
        functionName: "owner",
        args: [node],
      });

      const client = await networkStore.getClient();
      const origin = walletStore.substrateAddress || ZERO_SUBSTRATE_ADDRESS;
      const result = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsRegistry as Address,
        callData,
      );

      if (!result || result === "0x") return null;

      const owner = decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistry"),
        functionName: "owner",
        data: result,
      }) as Address;

      return owner === zeroAddress ? null : owner;
    } catch (error) {
      console.warn("[ResolverStore:getOwnerOfSubname]", error);
      return null;
    }
  }

  async function resolveAddressToName(targetAddress: Address): Promise<string | null> {
    try {
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsReverseResolver) {
        throw new Error("DotnsReverseResolver not configured");
      }

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsReverseResolver"),
        functionName: "nameOf",
        args: [targetAddress],
      });

      const client = await networkStore.getClient();
      const origin = walletStore.substrateAddress || ZERO_SUBSTRATE_ADDRESS;
      const result = await transactionStore.ethCall(
        client,
        origin,
        network.dotnsReverseResolver as Address,
        callData,
      );

      if (!result || result === "0x") return null;

      const name = decodeFunctionResult({
        abi: abiStore.getABI("DotnsReverseResolver"),
        functionName: "nameOf",
        data: result,
      }) as string;

      return name && name !== "" ? name : null;
    } catch (error) {
      console.warn("[ResolverStore:resolveAddressToName]", error);
      return null;
    }
  }

  return {
    resolveNameToAddress,
    resolveAddressToName,
    getText,
    setText,
    setContentHash,
    getOwnerOfDomain,
    getOwnerOfSubname,
    setProfileRecordsMulticall,
  };
});
