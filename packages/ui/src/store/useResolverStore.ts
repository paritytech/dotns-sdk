import { defineStore } from "pinia";
import { namehash, type Hash, type Address, zeroAddress, zeroHash } from "viem";
import { CID } from "multiformats/cid";
import { getContract, safeRead, WRITE_TX_DEFAULTS } from "@/composables/useContracts";
import { getChainClient } from "@/composables/useTypedAPI";
import { useWalletStore } from "./useWalletStore";
import { batchSubmitAndWatch, type BatchApi } from "@parity/product-sdk-tx";
import { useContractWrite } from "@/lib/contractWrite";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";
import type { TextRecord, TransactionResult } from "@/type";

export const useResolverStore = defineStore("useResolverStore", () => {
  const walletStore = useWalletStore();
  const { txOptions, batchOptions, withWrite, submitWrite } = useContractWrite();

  async function getText(domain: string, key: string): Promise<string | null> {
    return safeRead("[ResolverStore:getText]", null, async () => {
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
    });
  }

  async function setText(domain: string, key: string, value: string): Promise<Hash> {
    return withWrite(async () => {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);
      return submitWrite(resolver.setText!.tx(node, key, value, txOptions()), "Set record");
    });
  }

  async function setContentHash(domain: string, ipfsCid: string): Promise<TransactionResult> {
    return withWrite(async () => {
      const resolver = await getContract("@dotns/content-resolver");
      const node = namehash(`${normalizeDomainName(domain)}.dot`);

      // EIP-1577 contenthash: 0xe3 (IPFS namespace) + 0x01 (version) + full CIDv1 bytes
      const cid = CID.parse(ipfsCid);
      const hex = Array.from(cid.bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const contentHash: `0x${string}` = `0xe301${hex}`;

      const hash = await submitWrite(
        resolver.setContenthash!.tx(node, contentHash, txOptions()),
        "Set content hash",
      );
      return { hash, status: true };
    });
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
    const validRecords = records.filter((r) => r.value && r.value.length > 0);
    if (validRecords.length === 0) return { status: false, hash: zeroHash };
    return withWrite(async () => {
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
      const hash = await submitWrite(
        batchSubmitAndWatch(calls, chain.assetHub as unknown as BatchApi, signer, batchOptions()),
        "Profile update",
      );
      return { hash, status: true };
    });
  }

  async function resolveNameToAddress(username: string): Promise<Address | null> {
    return safeRead("[ResolverStore:resolveNameToAddress]", null, async () => {
      const resolver = await getContract("@dotns/resolver");
      const node = namehash(`${normalizeDomainName(username)}.dot`);
      const result = await resolver.addressOf!.query(node, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return null;
      const resolved = result.value as Address;
      return !resolved || resolved === zeroAddress ? null : resolved;
    });
  }

  async function getOwnerOfDomain(domain: string): Promise<Address | null> {
    return safeRead("[ResolverStore:getOwnerOfDomain]", null, async () => {
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
    });
  }

  async function getOwnerOfSubname(fullName: string): Promise<Address | null> {
    return safeRead("[ResolverStore:getOwnerOfSubname]", null, async () => {
      const registry = await getContract("@dotns/registry");
      const node = namehash(fullName.endsWith(".dot") ? fullName : `${fullName}.dot`);
      const result = await registry.owner!.query(node, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return null;
      const owner = result.value as Address;
      return !owner || owner === zeroAddress ? null : owner;
    });
  }

  async function resolveAddressToName(targetAddress: Address): Promise<string | null> {
    return safeRead("[ResolverStore:resolveAddressToName]", null, async () => {
      const reverse = await getContract("@dotns/reverse-resolver");
      const result = await reverse.nameOf!.query(targetAddress, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const name = result.value as string;
      return name && name !== "" ? name : null;
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
