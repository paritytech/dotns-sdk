import type { Paseo } from "@polkadot-api/descriptors";
import { Binary, type PolkadotSigner, type TypedApi } from "polkadot-api";
import { isAddress, type Address, type Hash } from "viem";
import type { ReviveCallResult, SubstrateWeight, TransactionStatus } from "../types/types";

export type PolkadotApiClient = TypedApi<Paseo>;

function normalizeFlags(flags: any): bigint {
  return convertToBigInt(flags, 0n);
}

function convertToBigInt(value: unknown, fallback: bigint = 0n): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string") return BigInt(value);
    if (value && typeof (value as any).toString === "function") {
      return BigInt((value as any).toString());
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function normalizeWeight(weight: any): SubstrateWeight {
  const referenceTime = weight?.ref_time ?? weight?.refTime ?? 0;
  const proofSize = weight?.proof_size ?? weight?.proofSize ?? 0;

  return {
    referenceTime: convertToBigInt(referenceTime, 0n),
    proofSize: convertToBigInt(proofSize, 0n),
  } as SubstrateWeight;
}

import { bytesToHex, isHex, toHex } from "viem";

export function convertToHexString(value: unknown): `0x${string}` {
  if (!value) return "0x";

  if (typeof (value as any)?.asHex === "function") return (value as any).asHex();

  if (typeof (value as any)?.toHex === "function") return (value as any).toHex();

  if (typeof value === "string" && isHex(value)) return value;

  if (value instanceof Uint8Array) return bytesToHex(value);

  try {
    return toHex(value as any);
  } catch {
    return "0x";
  }
}

function didExecutionRevert(flags: bigint): boolean {
  return (flags & 1n) === 1n;
}

function extractStorageDepositCharge(rawStorageDeposit: any): bigint {
  if (!rawStorageDeposit) return 0n;

  if (typeof rawStorageDeposit?.isCharge === "boolean") {
    if (rawStorageDeposit.isCharge && rawStorageDeposit.asCharge != null) {
      return convertToBigInt(rawStorageDeposit.asCharge, 0n);
    }
    return 0n;
  }

  if (rawStorageDeposit.charge != null) return convertToBigInt(rawStorageDeposit.charge, 0n);
  if (rawStorageDeposit.Charge != null) return convertToBigInt(rawStorageDeposit.Charge, 0n);
  if (rawStorageDeposit.value != null) return convertToBigInt(rawStorageDeposit.value, 0n);

  return 0n;
}

function unwrapExecutionResult(rawResult: any): {
  ok: any | null;
  err: any | null;
  successFlag: boolean | null;
} {
  if (!rawResult) return { ok: null, err: null, successFlag: null };

  if (typeof rawResult.success === "boolean") {
    return rawResult.success
      ? { ok: rawResult.value ?? null, err: null, successFlag: true }
      : { ok: null, err: rawResult.error ?? rawResult.value ?? null, successFlag: false };
  }

  if (typeof rawResult.isOk === "boolean") {
    return rawResult.isOk
      ? { ok: rawResult.value ?? null, err: null, successFlag: true }
      : { ok: null, err: rawResult.value ?? null, successFlag: false };
  }

  if (rawResult.ok != null) return { ok: rawResult.ok, err: null, successFlag: true };
  if (rawResult.err != null) return { ok: null, err: rawResult.err, successFlag: false };

  return { ok: null, err: rawResult, successFlag: null };
}

export class ReviveClientWrapper {
  public client: PolkadotApiClient;
  private mappedAccounts: Set<string> = new Set();

  private static readonly DRY_RUN_STORAGE_LIMIT: bigint = 18446744073709551615n;

  private static readonly DRY_RUN_WEIGHT_LIMIT = {
    ref_time: 18446744073709551615n,
    proof_size: 18446744073709551615n,
  };

  constructor(client: PolkadotApiClient) {
    this.client = client;
  }

  async getEvmAddress(substrateAddress: string): Promise<Address> {
    if (isAddress(substrateAddress)) return substrateAddress as Address;
    const address = await this.client.apis.ReviveApi.address(substrateAddress);
    return address.asHex() as Address;
  }

  async getSubstrateAddress(evmAddress: Address): Promise<string> {
    return await this.client.apis.ReviveApi.account_id(Binary.fromHex(evmAddress));
  }

  async performDryRunCall(
    originSubstrateAddress: string,
    contractAddress: Address,
    valueInNativeUnits: bigint,
    encodedData: `0x${string}`,
  ): Promise<ReviveCallResult> {
    if (isAddress(originSubstrateAddress)) {
      throw new Error(
        "performDryRunCall requires SS58 Substrate address for origin, not EVM H160 address",
      );
    }

    const executionResults = await this.client.apis.ReviveApi.call(
      originSubstrateAddress,
      Binary.fromHex(contractAddress),
      valueInNativeUnits,
      ReviveClientWrapper.DRY_RUN_WEIGHT_LIMIT,
      ReviveClientWrapper.DRY_RUN_STORAGE_LIMIT,
      Binary.fromHex(encodedData),
    );

    const { ok, err, successFlag } = unwrapExecutionResult((executionResults as any).result);

    const flags = normalizeFlags(ok?.flags);
    const returnData = convertToHexString(ok?.data);
    const didRevert = ok ? didExecutionRevert(flags) : true;

    const gasConsumed = normalizeWeight((executionResults as any).weight_consumed);
    const gasRequired = normalizeWeight(
      (executionResults as any).weight_required ?? (executionResults as any).weight_consumed,
    );

    const storageDepositValue = extractStorageDepositCharge(
      (executionResults as any).storage_deposit,
    );

    const isOk = !!ok && !didRevert;
    const isErr =
      !ok || didRevert || !!err || (typeof successFlag === "boolean" ? !successFlag : false);

    return {
      gasConsumed,
      gasRequired,
      storageDeposit: { value: storageDepositValue },
      result: {
        isOk,
        isErr,
        value: {
          data: ok ? returnData : "0x",
          flags: ok ? flags : 1n,
        },
      },
    };
  }

  async estimateGasForCall(
    originSubstrateAddress: string,
    contractAddress: Address,
    valueInNativeUnits: bigint,
    encodedData: `0x${string}`,
  ) {
    const result = await this.performDryRunCall(
      originSubstrateAddress,
      contractAddress,
      valueInNativeUnits,
      encodedData,
    );

    if (!result.result.isOk) {
      return {
        success: false,
        gasConsumed: result.gasConsumed,
        storageDeposit: result.storageDeposit.value,
        gasRequired: result.gasRequired,
        revertData: result.result.value.data,
        revertFlags: result.result.value.flags,
      };
    }

    return {
      success: true,
      gasConsumed: result.gasConsumed,
      storageDeposit: result.storageDeposit.value,
      gasRequired: result.gasRequired,
    };
  }

  private async checkIfAccountMapped(substrateAddress: string): Promise<boolean> {
    try {
      const evmAddress = await this.getEvmAddress(substrateAddress);
      const key = Binary.fromHex(evmAddress);
      const mappedAccount = await this.client.query.Revive.OriginalAccount.getValue(key);
      return mappedAccount !== null && mappedAccount !== undefined;
    } catch {
      return false;
    }
  }

  async ensureAccountMapped(substrateAddress: string, signer: PolkadotSigner): Promise<void> {
    if (isAddress(substrateAddress)) {
      throw new Error("ensureAccountMapped requires SS58 Substrate address, not EVM H160 address");
    }

    if (this.mappedAccounts.has(substrateAddress)) return;

    const isMapped = await this.checkIfAccountMapped(substrateAddress);
    if (isMapped) {
      this.mappedAccounts.add(substrateAddress);
      return;
    }

    const mappingExtrinsic = this.client.tx.Revive.map_account();

    try {
      await this.signAndSubmitExtrinsic(mappingExtrinsic, signer, () => {});
      this.mappedAccounts.add(substrateAddress);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes("AccountAlreadyMapped")) {
        this.mappedAccounts.add(substrateAddress);
        return;
      }
      throw error;
    }
  }

  private signAndSubmitExtrinsic(
    extrinsic: any,
    signer: PolkadotSigner,
    statusCallback: (status: TransactionStatus) => void,
  ): Promise<Hash> {
    return new Promise<Hash>((resolve, reject) => {
      try {
        extrinsic.signSubmitAndWatch(signer).subscribe({
          next: (event: any) => {
            const transactionHash = event.txHash?.toString();

            switch (event.type) {
              case "signed":
                statusCallback("signing");
                break;
              case "broadcasted":
                statusCallback("broadcasting");
                break;
              case "txBestBlocksState":
                statusCallback("included");
                break;
              case "finalized":
                if (event.dispatchError) {
                  statusCallback("failed");
                  reject(new Error(`Transaction failed: ${event.dispatchError.toString()}`));
                  return;
                }
                statusCallback("finalized");
                resolve(transactionHash as Hash);
                return;
              case "invalid":
              case "dropped":
                statusCallback("failed");
                reject(new Error(`Transaction ${event.type}`));
                return;
              default:
                break;
            }
          },
          error: (error: any) => {
            statusCallback("failed");
            reject(error);
          },
        });
      } catch (error) {
        statusCallback("failed");
        reject(error);
      }
    });
  }

  async submitTransaction(
    contractAddress: Address,
    valueInNativeUnits: bigint,
    encodedData: `0x${string}`,
    signerSubstrateAddress: string,
    signer: PolkadotSigner,
    statusCallback: (status: TransactionStatus) => void,
  ): Promise<Hash> {
    await this.ensureAccountMapped(signerSubstrateAddress, signer);

    const gasEstimate = await this.estimateGasForCall(
      signerSubstrateAddress,
      contractAddress,
      valueInNativeUnits,
      encodedData,
    );

    if (!gasEstimate.success) {
      throw new Error(`Contract execution would revert: ${gasEstimate.revertData ?? "0x"}`);
    }

    const weightLimit = {
      proof_size: gasEstimate.gasRequired.proofSize,
      ref_time: gasEstimate.gasRequired.referenceTime,
    };

    // Add 20% buffer to storage deposit, minimum 2 PAS
    const minimumStorageDeposit = 2_000_000_000_000n;
    let storageDepositLimit =
      gasEstimate.storageDeposit === 0n
        ? minimumStorageDeposit
        : (gasEstimate.storageDeposit * 120n) / 100n;

    if (storageDepositLimit < minimumStorageDeposit) {
      storageDepositLimit = minimumStorageDeposit;
    }

    const callExtrinsic = this.client.tx.Revive.call({
      dest: Binary.fromHex(contractAddress),
      value: valueInNativeUnits,
      weight_limit: weightLimit,
      storage_deposit_limit: storageDepositLimit,
      data: Binary.fromHex(encodedData),
    });

    return await this.signAndSubmitExtrinsic(callExtrinsic, signer, statusCallback);
  }
}
