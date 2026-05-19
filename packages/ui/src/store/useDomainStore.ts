import { defineStore } from "pinia";
import {
  keccak256,
  toBytes,
  hexToBigInt,
  zeroHash,
  type Address,
  type Hash,
  zeroAddress,
} from "viem";
import { createContract, type AbiEntry } from "@parity/product-sdk-contracts";
import {
  getContract,
  getContractManager,
  withContractRecovery,
  WRITE_TX_DEFAULTS,
} from "@/composables/useContracts";
import { signerManager, useWalletStore } from "./useWalletStore";
import type { TxStatus } from "@parity/product-sdk-tx";
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

// ---------------------------------------------------------------------------
// PERSONHOOD precompile (individuality runtime)
//
// Lives at a well-known precompile address — not a deployable contract, so
// not in cdm.json. The ABI is small enough to keep inline; resolved at call
// time via createContract(runtime, address, ABI).
// ---------------------------------------------------------------------------
const PERSONHOOD_PRECOMPILE_ADDRESS = "0x000000000000000000000000000000000a010000" as const;
const PERSONHOOD_CONTEXT =
  "0x646f746e73000000000000000000000000000000000000000000000000000000" as const;
const PERSONHOOD_ABI: AbiEntry[] = [
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
];

// Map ContractManager .tx()'s TxStatus enum onto walletStore's internal
// TransactionStatus. The names differ slightly between the two: SDK uses
// "in-block"/"error", walletStore expects "included"/"failed".
function mapTxStatus(
  s: TxStatus,
): "signing" | "broadcasting" | "included" | "finalized" | "failed" {
  switch (s) {
    case "signing":
      return "signing";
    case "broadcasting":
      return "broadcasting";
    case "in-block":
      return "included";
    case "finalized":
      return "finalized";
    case "error":
      return "failed";
  }
}

export const useDomainStore = defineStore("useDomainStore", () => {
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

  // Common onStatus relay for tx writes. Forwarded to walletStore so the
  // existing TransactionTimeline UI ticks through signing/broadcast/included/finalized
  // exactly as before.
  function relayStatus(s: TxStatus): void {
    walletStore.setTransactionStatus(mapTxStatus(s));
  }

  async function makeCommitment(
    name: string,
    ownerEvm: Address,
    reserved: boolean,
  ): Promise<Commitment> {
    return withContractRecovery(async () => {
      walletStore.ensureWalletConnected();
      const controller = await getContract("@dotns/registrar-controller");

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

      const result = await controller.makeCommitment!.query(registration, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) throw new Error("Failed to compute commitment");
      const commitment = result.value as Hash;
      if (!commitment || commitment === zeroHash) {
        throw new Error("Invalid commitment hash generated");
      }
      return { commitment, registration };
    }).catch((error) => {
      console.warn("[DomainStore:makeCommitment]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to create commitment");
    });
  }

  async function commitRegistration(commitment: string): Promise<Hash> {
    if (!commitment || typeof commitment !== "string" || !commitment.startsWith("0x")) {
      throw new Error("Invalid commitment hash");
    }
    walletStore.ensureWalletConnected();
    try {
      const controller = await getContract("@dotns/registrar-controller");
      const result = await controller.commit!.tx(commitment as Hash, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(`Commit reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      const hash = result.txHash as Hash;
      if (!hash || hash === zeroHash) throw new Error("Transaction failed to submit");
      return hash;
    } catch (error) {
      console.warn("[DomainStore:commitRegistration]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to commit registration");
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function registerDomain(registration: Registration): Promise<TransactionResult> {
    if (!registration?.label || !registration?.owner) {
      throw new Error("Invalid registration data");
    }
    walletStore.ensureWalletConnected();
    try {
      const controller = await getContract("@dotns/registrar-controller");
      const price = await priceWithoutCheck(registration.label);
      const bufferedPaymentWei = (price.price * 110n) / 100n;
      const bufferedPaymentNative = convertWeiToNative(bufferedPaymentWei);

      const result = await controller.register!.tx(registration, {
        ...WRITE_TX_DEFAULTS,
        value: bufferedPaymentNative,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(`Register reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      const hash = result.txHash as Hash;
      if (!hash || hash === zeroHash) throw new Error("Registration transaction failed");
      return { hash, status: true };
    } catch (error) {
      console.warn("[DomainStore:registerDomain]", error);
      throw new Error(error instanceof Error ? error.message : "Failed to register domain");
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function registerReserved(registration: Registration): Promise<TransactionResult> {
    if (!registration?.label || !registration?.owner) {
      throw new Error("Invalid registration data");
    }
    walletStore.ensureWalletConnected();
    try {
      const controller = await getContract("@dotns/registrar-controller");
      const result = await controller.registerReserved!.tx(registration, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(
          `RegisterReserved reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`,
        );
      }
      const hash = result.txHash as Hash;
      if (!hash || hash === zeroHash) throw new Error("Reserved registration transaction failed");
      return { hash, status: true };
    } catch (error) {
      console.warn("[DomainStore:registerReserved]", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to register reserved domain",
      );
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function isAvailable(domain: string): Promise<boolean> {
    if (!domain || typeof domain !== "string") throw new Error("Invalid domain name");
    return withContractRecovery(async () => {
      const registrar = await getContract("@dotns/registrar");
      const label = extractLabel(domain);
      const tokenId = calculateTokenId(label);
      const result = await registrar.available!.query(tokenId, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return false;
      return Boolean(result.value);
    }).catch((error) => {
      console.warn("[DomainStore:isAvailable]", error);
      throw new Error("Failed to check domain availability");
    });
  }

  async function getMinCommitmentAge(): Promise<bigint> {
    return withContractRecovery(async () => {
      const controller = await getContract("@dotns/registrar-controller");
      const result = await controller.minCommitmentAge!.query({ origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return 60n;
      const minCommitmentAge = result.value as bigint;
      // Add 2s buffer; default to 8s if chain returned 0n (matches prior behavior).
      return minCommitmentAge === 0n ? 8n : minCommitmentAge + 2n;
    }).catch((error) => {
      console.warn("[DomainStore:getMinCommitmentAge]", error);
      return 60n;
    });
  }

  async function userPopStatus(user: Address): Promise<PopStatus> {
    return withContractRecovery(async () => {
      const m = await getContractManager();
      const personhood = createContract(
        m.getRuntime(),
        PERSONHOOD_PRECOMPILE_ADDRESS,
        PERSONHOOD_ABI,
        { signerManager },
      );
      const result = await personhood.personhoodStatus!.query(user, PERSONHOOD_CONTEXT, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return PopStatus.NoStatus;
      const info = result.value as { status: number | bigint };
      return Number(info.status) as PopStatus;
    }).catch((error) => {
      console.warn("[DomainStore:userPopStatus]", error);
      return PopStatus.NoStatus;
    });
  }

  async function classifyName(name: string): Promise<NameRequirement> {
    if (!name || typeof name !== "string") throw new Error("Invalid domain name");
    return withContractRecovery(async () => {
      const popRules = await getContract("@dotns/pop-rules");
      const result = await popRules.classifyName!.query(name, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) {
        return { requirement: PopStatus.NoStatus, message: "Unable to classify name" };
      }
      // classifyName has two named outputs (requirement, message), so viem
      // decodes to an object rather than a tuple.
      const decoded = result.value as { requirement: number | bigint; message: string };
      return { requirement: Number(decoded.requirement) as PopStatus, message: decoded.message };
    }).catch((error) => {
      console.warn("[DomainStore:classifyName]", error);
      return { requirement: PopStatus.NoStatus, message: "Unable to classify name" };
    });
  }

  async function priceWithoutCheck(name: string): Promise<PriceWithMeta> {
    if (!name || typeof name !== "string") throw new Error("Invalid domain name");
    walletStore.ensureWalletConnected();
    return withContractRecovery(async () => {
      const popRules = await getContract("@dotns/pop-rules");
      const result = await popRules.priceWithoutCheck!.query(name, walletStore.evmAddress!, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) {
        return {
          price: 0n,
          status: PopStatus.NoStatus,
          userStatus: walletStore.userPopState ?? PopStatus.NoStatus,
          message: "Error fetching price",
        };
      }
      return result.value as PriceWithMeta;
    }).catch((error) => {
      console.warn("[DomainStore:priceWithoutCheck]", error);
      return {
        price: 0n,
        status: PopStatus.NoStatus,
        userStatus: walletStore.userPopState ?? PopStatus.NoStatus,
        message: "Error fetching price",
      };
    });
  }

  async function transferDomain(domain: string, newOwner: Address): Promise<Hash> {
    if (!newOwner || newOwner === zeroAddress) {
      throw new Error("Invalid recipient address");
    }
    walletStore.ensureWalletConnected();
    try {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const result = await registrar.safeTransferFrom!.tx(
        walletStore.evmAddress as Address,
        newOwner,
        tokenId,
        { ...WRITE_TX_DEFAULTS, onStatus: relayStatus },
      );
      if (!result.ok) {
        throw new Error(`Transfer reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      return result.txHash as Hash;
    } catch (error) {
      console.warn("[DomainStore:transferDomain]", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function registerSubDomain(
    parentName: string,
    subname: string,
    owner: Address,
  ): Promise<Hash> {
    walletStore.ensureWalletConnected();
    try {
      const registry = await getContract("@dotns/registry");
      const parentLabel = normalizeDomainName(parentName).trim();
      const parentNode = computeDotLabelNode(parentLabel);
      const subLabel = subname.trim();
      const result = await registry.setSubnodeOwner!.tx(
        { parentNode, subLabel, parentLabel, owner },
        { ...WRITE_TX_DEFAULTS, onStatus: relayStatus },
      );
      if (!result.ok) {
        throw new Error(
          `setSubnodeOwner reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`,
        );
      }
      return result.txHash as Hash;
    } catch (error) {
      console.warn("[DomainStore:registerSubDomain]", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function recordExists(parentName: string, subname: string): Promise<boolean> {
    return withContractRecovery(async () => {
      const registry = await getContract("@dotns/registry");
      const parentLabel = normalizeDomainName(parentName).trim();
      const parentNode = computeDotLabelNode(parentLabel);
      const subLabel = subname.trim();
      const subnode = computeSubnode(parentNode, subLabel);
      const result = await registry.recordExists!.query(subnode, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return false;
      return Boolean(result.value);
    }).catch((error) => {
      console.warn("[DomainStore:recordExists]", error);
      throw error;
    });
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
