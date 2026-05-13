import { defineStore } from "pinia";
import {
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  toBytes,
  hexToBigInt,
  zeroHash,
  type Address,
  type Hash,
  zeroAddress,
} from "viem";
import { useNetworkStore } from "./useNetworkStore";
import { useTransactionStore } from "./useTransactionStore";
import { useAbiStore } from "./useAbiStore";
import { useWalletStore } from "./useWalletStore";
import {
  computeDomainTokenId,
  computeDotLabelNode,
  computeSubnode,
  convertNativeToWei,
  convertWeiToNative,
  formatNativeBalance,
  formatWeiAsEther,
  normalizeDomainName,
  ZERO_SUBSTRATE_ADDRESS,
} from "../utils";
import {
  type Commitment,
  type Registration,
  type TransactionResult,
  PopStatus,
  type NameRequirement,
  type PriceWithMeta,
} from "@/type";

const PERSONHOOD_PRECOMPILE_ADDRESS = "0x000000000000000000000000000000000a010000" as const;
const PERSONHOOD_CONTEXT =
  "0x646f746e73000000000000000000000000000000000000000000000000000000" as const;
const PERSONHOOD_ABI = [
  {
    type: "function",
    name: "personhoodStatus",
    inputs: [
      { name: "account", type: "address" },
      { name: "context", type: "bytes32" },
    ],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "contextAlias", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "personhoodInfoByProof",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "expectedStatus", type: "uint8" },
          { name: "proof", type: "bytes" },
          { name: "expectedAlias", type: "bytes32" },
          { name: "ringIndex", type: "uint32" },
          { name: "context", type: "bytes32" },
          { name: "revision", type: "uint32" },
          { name: "message", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "ok", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const useDomainStore = defineStore("useDomainStore", () => {
  const networkStore = useNetworkStore();
  const transactionStore = useTransactionStore();
  const abiStore = useAbiStore();
  const walletStore = useWalletStore();

  function extractLabel(domain: string): string {
    try {
      return domain.replace(".dot", "").split(".")[0] ?? "";
    } catch (error) {
      console.warn("[DomainStore:extractLabel]", error);
      throw new Error("Failed to extract label from domain");
    }
  }

  function calculateTokenId(label: string): bigint {
    try {
      if (!label || typeof label !== "string") throw new Error("Invalid label");
      return hexToBigInt(keccak256(toBytes(label)));
    } catch (error) {
      console.warn("[DomainStore:calculateTokenId]", error);
      throw new Error("Failed to calculate token ID");
    }
  }

  async function makeCommitment(
    name: string,
    ownerEvm: Address,
    reserved: boolean,
  ): Promise<Commitment> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrarController)
        throw new Error("Registrar controller not configured");

      name = normalizeDomainName(name);

      const secretBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const secret: Hash = `0x${Array.from(secretBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;

      const registration: Registration = {
        label: name,
        owner: ownerEvm,
        secret,
        reserved,
      };

      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "makeCommitment",
        args: [registration],
      });

      const client = await networkStore.getClient();

      const resultData = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.dotnsRegistrarController,
        data,
      );

      const commitment = decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "makeCommitment",
        data: resultData,
      }) as Hash;

      if (!commitment || commitment === zeroHash)
        throw new Error("Invalid commitment hash generated");

      return { commitment, registration };
    } catch (error) {
      console.warn("[DomainStore:makeCommitment]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to create commitment");
    }
  }

  async function commitRegistration(commitment: string): Promise<Hash> {
    try {
      if (!commitment || typeof commitment !== "string" || !commitment.startsWith("0x")) {
        throw new Error("Invalid commitment hash");
      }

      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrarController)
        throw new Error("Registrar controller not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "commit",
        args: [commitment],
      });

      const client = await networkStore.getClient();

      const hash = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsRegistrarController,
          data,
        },
      );

      if (!hash || hash === zeroHash) throw new Error("Transaction failed to submit");
      return hash;
    } catch (error) {
      console.warn("[DomainStore:commitRegistration]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to commit registration");
    }
  }

  async function registerDomain(registration: Registration): Promise<TransactionResult> {
    try {
      if (!registration || !registration.label || !registration.owner) {
        throw new Error("Invalid registration data");
      }

      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrarController)
        throw new Error("Registrar controller not configured");
      const price = await priceWithoutCheck(registration.label);
      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "register",
        args: [registration],
      });

      const bufferedPaymentWei = (price.price * 110n) / 100n;

      const bufferedPaymentNative = convertWeiToNative(bufferedPaymentWei);

      const client = await networkStore.getClient();

      const hash = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsRegistrarController,
          data,
          value: bufferedPaymentNative,
        },
      );

      if (!hash || hash === zeroHash) throw new Error("Registration transaction failed");
      return { hash, status: true };
    } catch (error) {
      console.warn("[DomainStore:registerDomain]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to register domain");
    }
  }

  async function registerReserved(registration: Registration): Promise<TransactionResult> {
    try {
      if (!registration || !registration.label || !registration.owner) {
        throw new Error("Invalid registration data");
      }

      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrarController)
        throw new Error("Registrar controller not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "registerReserved",
        args: [registration],
      });

      const client = await networkStore.getClient();

      const hash = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsRegistrarController,
          data,
        },
      );

      if (!hash || hash === zeroHash) throw new Error("Reserved registration transaction failed");
      return { hash, status: true };
    } catch (error) {
      console.warn("[DomainStore:registerReserved]", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to register reserved domain",
      );
    }
  }

  async function isAvailable(domain: string): Promise<boolean> {
    try {
      if (!domain || typeof domain !== "string") throw new Error("Invalid domain name");

      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrar) throw new Error("Registrar not configured");

      const label = extractLabel(domain);
      const tokenId = calculateTokenId(label);

      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "available",
        args: [tokenId],
      });

      const client = await networkStore.getClient();

      const result = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.dotnsRegistrar,
        data,
      );

      const decoded = decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "available",
        data: result,
      }) as boolean;

      return decoded;
    } catch (error) {
      console.warn("[DomainStore:isAvailable]", error);
      throw new Error("Failed to check domain availability");
    }
  }

  async function getMinCommitmentAge(): Promise<bigint> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrarController)
        throw new Error("Registrar controller not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrarController"),
        functionName: "minCommitmentAge",
        args: [],
      });

      const client = await networkStore.getClient();

      const result = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.dotnsRegistrarController,
        data,
      );

      const minCommitmentAge = decodeFunctionResult({
        functionName: "minCommitmentAge",
        abi: abiStore.getABI("DotnsRegistrarController"),
        data: result,
      }) as bigint;

      return minCommitmentAge === 0n ? 8n : minCommitmentAge + 2n;
    } catch (error) {
      console.warn("[DomainStore:getMinCommitmentAge]", error);
      return 60n;
    }
  }

  async function userPopStatus(user: Address): Promise<PopStatus> {
    try {
      networkStore.ensureClient();
      walletStore.ensureWalletConnected();

      const data = encodeFunctionData({
        abi: PERSONHOOD_ABI,
        functionName: "personhoodStatus",
        args: [user, PERSONHOOD_CONTEXT],
      });
      const client = await networkStore.getClient();

      const result = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        PERSONHOOD_PRECOMPILE_ADDRESS,
        data,
      );

      const info = decodeFunctionResult({
        abi: PERSONHOOD_ABI,
        functionName: "personhoodStatus",
        data: result,
      });

      return Number(info.status) as PopStatus;
    } catch (error) {
      console.warn("[DomainStore:userPopStatus]", error);
      return PopStatus.NoStatus;
    }
  }

  async function classifyName(name: string): Promise<NameRequirement> {
    try {
      if (!name || typeof name !== "string") throw new Error("Invalid domain name");

      networkStore.ensureClient();
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.popOracle) throw new Error("PopOracle not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("PopRules"),
        functionName: "classifyName",
        args: [name],
      });

      const client = await networkStore.getClient();

      const result = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress ?? ZERO_SUBSTRATE_ADDRESS,
        network.popOracle,
        data,
      );
      const decoded = decodeFunctionResult({
        abi: abiStore.getABI("PopRules"),
        functionName: "classifyName",
        data: result,
      }) as [PopStatus, string];

      return { requirement: decoded[0], message: decoded[1] };
    } catch (error) {
      console.warn("[DomainStore:classifyName]", error);
      return {
        requirement: PopStatus.NoStatus,
        message: "Unable to classify name",
      };
    }
  }

  async function priceWithoutCheck(name: string): Promise<PriceWithMeta> {
    try {
      if (!name || typeof name !== "string") throw new Error("Invalid domain name");

      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.popOracle) throw new Error("PopOracle not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("PopRules"),
        functionName: "priceWithoutCheck",
        args: [name, walletStore.evmAddress!],
      });

      const client = await networkStore.getClient();

      const result = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.popOracle,
        data,
      );

      const decoded = decodeFunctionResult({
        abi: abiStore.getABI("PopRules"),
        functionName: "priceWithoutCheck",
        data: result,
      }) as PriceWithMeta;

      return decoded;
    } catch (error) {
      console.warn("[DomainStore:priceWithoutCheck]", error);
      return {
        price: 0n,
        status: PopStatus.NoStatus,
        userStatus: walletStore.userPopState ?? PopStatus.NoStatus,
        message: "Error fetching price",
      };
    }
  }

  async function transferDomain(domain: string, newOwner: Address): Promise<Hash> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistrar) {
        throw new Error("DotnsRegistrar not configured");
      }

      if (!newOwner || newOwner === zeroAddress) {
        throw new Error("Invalid recipient address");
      }

      const client = await networkStore.getClient();
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistrar"),
        functionName: "safeTransferFrom",
        args: [walletStore.evmAddress as Address, newOwner, tokenId],
      });

      return await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsRegistrar,
          data: callData,
        },
      );
    } catch (error) {
      console.warn("[ResolverStore:transferDomain]", error);
      throw error;
    }
  }
  async function registerSubDomain(
    parentName: string,
    subname: string,
    owner: Address,
  ): Promise<Hash> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistry) throw new Error("DotnsRegistry not configured");

      const client = await networkStore.getClient();

      const parentLabel = normalizeDomainName(parentName).trim();
      const parentNode = computeDotLabelNode(parentLabel);
      const subLabel = subname.trim();

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistry"),
        functionName: "setSubnodeOwner",
        args: [
          {
            parentNode,
            subLabel,
            parentLabel,
            owner,
          },
        ],
      });

      return await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        {
          to: network.dotnsRegistry,
          data: callData,
        },
      );
    } catch (error) {
      console.warn("[ResolverStore:registerSubDomain]", error);
      throw error;
    }
  }

  async function recordExists(parentName: string, subname: string): Promise<boolean> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.dotnsRegistry) throw new Error("DotnsRegistry not configured");

      const client = await networkStore.getClient();

      const parentLabel = normalizeDomainName(parentName).trim();
      const parentNode = computeDotLabelNode(parentLabel);
      const subLabel = subname.trim();

      const subnode = computeSubnode(parentNode, subLabel);

      const callData = encodeFunctionData({
        abi: abiStore.getABI("DotnsRegistry"),
        functionName: "recordExists",
        args: [subnode],
      });

      const data = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.dotnsRegistry,
        callData,
      );

      return decodeFunctionResult({
        abi: abiStore.getABI("DotnsRegistry"),
        functionName: "recordExists",
        data,
      }) as boolean;
    } catch (error) {
      console.warn("[ResolverStore:recordExists]", error);
      throw error;
    }
  }
  return {
    makeCommitment,
    commitRegistration,
    registerDomain,
    registerReserved,
    isAvailable,
    getMinCommitmentAge,
    registerSubDomain,
    priceWithoutCheck,
    userPopStatus,
    classifyName,
    recordExists,
    extractLabel,
    calculateTokenId,
    transferDomain,
    formatNativeBalance,
    formatWeiAsEther,
    convertWeiToNative,
    convertNativeToWei,
  };
});
