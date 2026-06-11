import { defineStore } from "pinia";
import { zeroHash, type Address, type Hash, zeroAddress } from "viem";
import { createContract, type AbiEntry } from "@parity/product-sdk-contracts";
import {
  getContract,
  getContractManager,
  safeRead,
  withContractRecovery,
} from "@/composables/useContracts";
import { signerManager, useWalletStore } from "./useWalletStore";
import { useContractWrite } from "@/lib/contractWrite";
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
// Returned by classifyName when the on-chain classifier rejects or cannot reach
// the name (e.g. a non-canonical label). Callers must treat this as not registerable.
export const UNCLASSIFIABLE_MESSAGE = "Unable to classify name";

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
  const { withWrite, submitWrite, txOptions } = useContractWrite();

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
    return withWrite(async () => {
      const controller = await getContract("@dotns/registrar-controller");
      return submitWrite(controller.commit!.tx(commitment as Hash, txOptions()), "Commit");
    });
  }

  async function registerDomain(registration: Registration): Promise<TransactionResult> {
    if (!registration?.label || !registration?.owner) {
      throw new Error("Invalid registration data");
    }
    return withWrite(async () => {
      const controller = await getContract("@dotns/registrar-controller");
      const price = await priceWithoutCheck(registration.label);
      const bufferedPaymentWei = (price.price * 110n) / 100n;
      const bufferedPaymentNative = convertWeiToNative(bufferedPaymentWei);

      const hash = await submitWrite(
        controller.register!.tx(registration, txOptions({ value: bufferedPaymentNative })),
        "Registration",
      );
      return { hash, status: true };
    });
  }

  async function registerReserved(registration: Registration): Promise<TransactionResult> {
    if (!registration?.label || !registration?.owner) {
      throw new Error("Invalid registration data");
    }
    return withWrite(async () => {
      const controller = await getContract("@dotns/registrar-controller");
      const hash = await submitWrite(
        controller.registerReserved!.tx(registration, txOptions()),
        "Reserved registration",
      );
      return { hash, status: true };
    });
  }

  async function getMinCommitmentAge(): Promise<bigint> {
    return safeRead("[DomainStore:getMinCommitmentAge]", 60n, async () => {
      const controller = await getContract("@dotns/registrar-controller");
      const result = await controller.minCommitmentAge!.query({ origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return 60n;
      const minCommitmentAge = result.value as bigint;
      // Add 2s buffer; default to 8s if chain returned 0n (matches prior behavior).
      return minCommitmentAge === 0n ? 8n : minCommitmentAge + 2n;
    });
  }

  async function userPopStatus(user: Address): Promise<PopStatus> {
    return safeRead("[DomainStore:userPopStatus]", PopStatus.NoStatus, async () => {
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
    });
  }

  async function classifyName(name: string): Promise<NameRequirement> {
    if (!name || typeof name !== "string") throw new Error("Invalid domain name");
    const fallback = { requirement: PopStatus.NoStatus, message: UNCLASSIFIABLE_MESSAGE };
    return safeRead("[DomainStore:classifyName]", fallback, async () => {
      const popRules = await getContract("@dotns/pop-rules");
      const result = await popRules.classifyName!.query(name, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return fallback;
      // classifyName has two named outputs (requirement, message), so viem
      // decodes to an object rather than a tuple.
      const decoded = result.value as { requirement: number | bigint; message: string };
      return { requirement: Number(decoded.requirement) as PopStatus, message: decoded.message };
    });
  }

  async function priceWithoutCheck(name: string): Promise<PriceWithMeta> {
    if (!name || typeof name !== "string") throw new Error("Invalid domain name");
    walletStore.ensureWalletConnected();
    const fallback: PriceWithMeta = {
      price: 0n,
      status: PopStatus.NoStatus,
      userStatus: walletStore.userPopState ?? PopStatus.NoStatus,
      message: "Error fetching price",
    };
    return safeRead("[DomainStore:priceWithoutCheck]", fallback, async () => {
      const popRules = await getContract("@dotns/pop-rules");
      const result = await popRules.priceWithoutCheck!.query(name, walletStore.evmAddress!, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return fallback;
      return result.value as PriceWithMeta;
    });
  }

  async function transferDomain(domain: string, newOwner: Address): Promise<Hash> {
    if (!newOwner || newOwner === zeroAddress) {
      throw new Error("Invalid recipient address");
    }
    return withWrite(async () => {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const feeQuote = await registrar.quoteTransferFee!.query(tokenId, newOwner, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      const feeNative = convertWeiToNativeCeil(feeQuote.success ? (feeQuote.value as bigint) : 0n);
      return submitWrite(
        registrar.safeTransferFrom!.tx(
          walletStore.evmAddress as Address,
          newOwner,
          tokenId,
          txOptions({ value: feeNative }),
        ),
        "Transfer",
      );
    });
  }

  // Lets `delegate` manage and transfer this one name until revoked; the approval
  // also clears automatically when the name is transferred. Zero address revokes.
  async function setNameDelegate(domain: string, delegate: Address): Promise<Hash> {
    return withWrite(async () => {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      return submitWrite(registrar.approve!.tx(delegate, tokenId, txOptions()), "Delegate name");
    });
  }

  // The address currently delegated full control of `domain`, or null if none.
  async function getNameDelegate(domain: string): Promise<Address | null> {
    return safeRead("[DomainStore:getNameDelegate]", null, async () => {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const result = await registrar.getApproved!.query(tokenId, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const delegate = result.value as Address;
      return !delegate || delegate === zeroAddress ? null : delegate;
    });
  }

  // Lets `operator` edit text and contenthash records across all your names (but
  // never transfer or change ownership). Set approved=false to revoke.
  async function setRecordDelegate(operator: Address, approved: boolean): Promise<Hash> {
    return withWrite(async () => {
      const resolver = await getContract("@dotns/content-resolver");
      return submitWrite(
        resolver.setApprovalForAll!.tx(operator, approved, txOptions()),
        "Update record delegate",
      );
    });
  }

  async function registerSubDomain(
    parentName: string,
    subname: string,
    owner: Address,
  ): Promise<Hash> {
    return withWrite(async () => {
      const registry = await getContract("@dotns/registry");
      const parentLabel = normalizeDomainName(parentName).trim();
      const parentNode = computeDotLabelNode(parentLabel);
      const subLabel = subname.trim();
      return submitWrite(
        registry.setSubnodeOwner!.tx({ parentNode, subLabel, parentLabel, owner }, txOptions()),
        "Subdomain registration",
      );
    });
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
