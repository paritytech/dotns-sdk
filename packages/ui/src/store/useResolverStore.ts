import { defineStore } from "pinia";
import { namehash, type Hash, type Address, zeroAddress, zeroHash } from "viem";
import { CID } from "multiformats/cid";
import { getContract, withContractRecovery, WRITE_TX_DEFAULTS } from "@/composables/useContracts";
import { getChainClient } from "@/composables/useTypedAPI";
import { useWalletStore } from "./useWalletStore";
import { batchSubmitAndWatch, type BatchApi, type TxStatus } from "@parity/product-sdk-tx";
import { mapTxStatus } from "@/lib/txStatus";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";
import type { TextRecord, TransactionResult } from "@/type";

export const useResolverStore = defineStore("useResolverStore", () => {
  const walletStore = useWalletStore();

  function relayStatus(s: TxStatus): void {
    walletStore.setTransactionStatus(mapTxStatus(s));
  }

  async function getText(domain: string, key: string): Promise<string | null> {
    return withContractRecovery(async () => {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);
      const result = await resolver.text!.query(node, key, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return null;
      const decoded = result.value as string;
      // Legacy filter: the content resolver can echo back the literal strings
      // "true" / "false" as placeholder values for unset records; treat those
      // the same as the empty string.
      return decoded && decoded !== "" && decoded !== "true" && decoded !== "false"
        ? decoded
        : null;
    }).catch((error) => {
      console.warn("[ResolverStore:getText]", error);
      return null;
    });
  }

  async function setText(domain: string, key: string, value: string): Promise<Hash> {
    await walletStore.ensureSignerReady();
    try {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);
      const result = await resolver.setText!.tx(node, key, value, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        throw new Error(`setText reverted: ${JSON.stringify(result.dispatchError ?? "unknown")}`);
      }
      return result.txHash as Hash;
    } catch (error) {
      console.warn("[ResolverStore:setText]", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function setContentHash(domain: string, ipfsCid: string): Promise<TransactionResult> {
    await walletStore.ensureSignerReady();
    try {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      // EIP-1577 contenthash: 0xe3 (IPFS namespace) + 0x01 (version) + full CIDv1 bytes
      const cid = CID.parse(ipfsCid);
      const hex = Array.from(cid.bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const contentHash: `0x${string}` = `0xe301${hex}`;

      const result = await resolver.setContenthash!.tx(node, contentHash, {
        ...WRITE_TX_DEFAULTS,
        onStatus: relayStatus,
      });
      if (!result.ok) {
        return { hash: zeroHash, status: false };
      }
      const hash = result.txHash as Hash;
      return hash && hash !== zeroHash ? { hash, status: true } : { hash: zeroHash, status: false };
    } catch (error) {
      console.warn("[ResolverStore:setContentHash]", error);
      throw error;
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  // Multi-record profile updates with one signing prompt: each record is
  // prepared as a Revive.call (`setText`) via `.prepare()`, then submitted
  // together in a single `Utility.batch_all` extrinsic the account signs once.
  // The calls are the user's own and batch natively, so no MultiCall3/approval
  // ceremony is needed for writes (MultiCall3 is used only for read aggregation).
  async function setProfileRecordsMulticall(
    domain: string,
    records: TextRecord[],
  ): Promise<TransactionResult> {
    await walletStore.ensureSignerReady();
    const validRecords = records.filter((r) => r.value && r.value.length > 0);
    if (validRecords.length === 0) return { status: false, hash: zeroHash };
    try {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);
      const calls = await Promise.all(
        validRecords.map((record) =>
          resolver.setText!.prepare(node, record.key, record.value, {
            storageDepositLimit: WRITE_TX_DEFAULTS.storageDepositLimit,
          }),
        ),
      );
      const chain = await getChainClient();
      const signer = walletStore.getInjected();
      const result = await batchSubmitAndWatch(
        calls,
        chain.assetHub as unknown as BatchApi,
        signer,
        { waitFor: WRITE_TX_DEFAULTS.waitFor, onStatus: relayStatus },
      );
      if (!result.ok) return { hash: zeroHash, status: false };
      const hash = result.txHash as Hash;
      return hash && hash !== zeroHash ? { hash, status: true } : { hash: zeroHash, status: false };
    } catch (error) {
      console.warn("[ResolverStore:setProfileRecordsMulticall]", error);
      return { status: false, hash: zeroHash };
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function resolveNameToAddress(username: string): Promise<Address | null> {
    return withContractRecovery(async () => {
      const resolver = await getContract("@dotns/resolver");
      const node = namehash(`${normalizeDomainName(username)}.dot`);
      const result = await resolver.addressOf!.query(node, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return null;
      const resolved = result.value as Address;
      return !resolved || resolved === zeroAddress ? null : resolved;
    }).catch((error) => {
      console.warn("[ResolverStore:resolveNameToAddress]", error);
      return null;
    });
  }

  async function getOwnerOfDomain(domain: string): Promise<Address | null> {
    return withContractRecovery(async () => {
      const registrar = await getContract("@dotns/registrar");
      const tokenId = computeDomainTokenId(normalizeDomainName(domain));
      const availableResult = await registrar.available!.query(tokenId, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!availableResult.success) return null;
      if (availableResult.value === true) return null;

      const ownerResult = await registrar.ownerOf!.query(tokenId, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!ownerResult.success) return null;
      const owner = ownerResult.value as Address;
      return !owner || owner === zeroAddress ? null : owner;
    }).catch((error) => {
      console.warn("[ResolverStore:getOwnerOfDomain]", error);
      return null;
    });
  }

  async function getOwnerOfSubname(fullName: string): Promise<Address | null> {
    return withContractRecovery(async () => {
      const registry = await getContract("@dotns/registry");
      const node = namehash(fullName.endsWith(".dot") ? fullName : `${fullName}.dot`);
      const result = await registry.owner!.query(node, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return null;
      const owner = result.value as Address;
      return !owner || owner === zeroAddress ? null : owner;
    }).catch((error) => {
      console.warn("[ResolverStore:getOwnerOfSubname]", error);
      return null;
    });
  }

  async function resolveAddressToName(targetAddress: Address): Promise<string | null> {
    return withContractRecovery(async () => {
      const reverse = await getContract("@dotns/reverse-resolver");
      const result = await reverse.nameOf!.query(targetAddress, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const name = result.value as string;
      return name && name !== "" ? name : null;
    }).catch((error) => {
      console.warn("[ResolverStore:resolveAddressToName]", error);
      return null;
    });
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
