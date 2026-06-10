import { defineStore } from "pinia";
import { zeroHash, type Address, type Hash, zeroAddress } from "viem";
import { createContract, type AbiEntry } from "@parity/product-sdk-contracts";
import {
  getContract,
  getContractManager,
  withContractRecovery,
  WRITE_TX_DEFAULTS,
} from "@/composables/useContracts";
import { signerManager, useWalletStore } from "./useWalletStore";
import type { TxStatus } from "@parity/product-sdk-tx";
import { mapTxStatus } from "@/lib/txStatus";
import {
  computeDomainTokenId,
  computeDotLabelNode,
  computeSubnode,
  convertNativeToWei,
  convertWeiToNative,
  convertWeiToNativeCeil,
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

// PERSONHOOD precompile: lives at a well-known precompile address, not a
// deployable contract, so it is absent from cdm.json. The ABI is small enough to
// keep inline; resolved at call time via createContract(runtime, address, ABI).
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

export const useDomainStore = defineStore("useDomainStore", () => {
  const walletStore = useWalletStore();

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
    await walletStore.ensureSignerReady();
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
    await walletStore.ensureSignerReady();
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
    await walletStore.ensureSignerReady();
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
    await walletStore.ensureSignerReady();
    try {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const feeQuote = await registrar.quoteTransferFee!.query(tokenId, newOwner, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      const feeNative = convertWeiToNativeCeil(feeQuote.success ? (feeQuote.value as bigint) : 0n);
      const result = await registrar.safeTransferFrom!.tx(
        walletStore.evmAddress as Address,
        newOwner,
        tokenId,
        { ...WRITE_TX_DEFAULTS, value: feeNative, onStatus: relayStatus },
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

  // Delegate full control of a single name to `delegate` via the registrar's
  // ERC-721 single-token approval. The delegate can manage and transfer this
  // name until revoked, and ERC-721 clears the approval automatically on any
  // transfer. Pass the zero address to revoke.
  async function setNameDelegate(domain: string, delegate: Address): Promise<Hash> {
    await walletStore.ensureSignerReady();
    try {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const result = await registrar.approve!.tx(delegate, tokenId, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(`approve reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      return result.txHash as Hash;
    } catch (error) {
      console.warn("[DomainStore:setNameDelegate]", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  // The address currently delegated full control of `domain`, or null if none.
  async function getNameDelegate(domain: string): Promise<Address | null> {
    return withContractRecovery(async () => {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const result = await registrar.getApproved!.query(tokenId, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const delegate = result.value as Address;
      return !delegate || delegate === zeroAddress ? null : delegate;
    }).catch(() => null);
  }

  // Delegate (or revoke) record editing across ALL your names via the content
  // resolver's operator approval. Account-wide and record-scoped: the operator
  // can set text and contenthash but cannot transfer or change ownership.
  async function setRecordDelegate(operator: Address, approved: boolean): Promise<Hash> {
    await walletStore.ensureSignerReady();
    try {
      const resolver = await getContract("@dotns/content-resolver");
      const result = await resolver.setApprovalForAll!.tx(operator, approved, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(
          `setApprovalForAll reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`,
        );
      }
      return result.txHash as Hash;
    } catch (error) {
      console.warn("[DomainStore:setRecordDelegate]", error);
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
    await walletStore.ensureSignerReady();
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
    getMinCommitmentAge,
    registerSubDomain,
    priceWithoutCheck,
    userPopStatus,
    classifyName,
    recordExists,
    transferDomain,
    setNameDelegate,
    getNameDelegate,
    setRecordDelegate,
    formatNativeBalance,
    formatWeiAsEther,
    convertWeiToNative,
    convertNativeToWei,
  };
});
