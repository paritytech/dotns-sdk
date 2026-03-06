import type { Paseo } from "@polkadot-api/descriptors";
import { Binary, type PolkadotSigner, type TypedApi } from "polkadot-api";
import { bytesToHex, isAddress, isHex, toHex, type Address, type Hash, type Hex } from "viem";
import type { SpWeightsWeightV2Weight } from "@dedot/chaintypes/substrate";

/**
 * Revive Client Wrapper
 *
 * Wrapper for Polkadot API client to interact with Revive contracts
 */

export type TransactionStatus = "signing" | "broadcasting" | "included" | "finalized" | "failed";

export type PolkadotApiClient = TypedApi<Paseo>;

export interface ReviveCallResult {
  gasConsumed: SpWeightsWeightV2Weight;
  gasRequired: SpWeightsWeightV2Weight;
  storageDeposit: { value: bigint };
  result: {
    isOk: boolean;
    isErr: boolean;
    value: {
      data: `0x${string}`;
      flags: bigint;
    };
  };
}

export interface IReviveClientWrapper {
  readonly client: PolkadotApiClient;

  getEvmAddress(substrateAddress: string): Promise<Address>;
  getSubstrateAddress(evmAddress: Address): Promise<string>;

  performDryRunCall(
    originSubstrateAddress: string,
    contractAddress: Address,
    valueInNativeUnits: bigint,
    data: Hex,
  ): Promise<ReviveCallResult>;

  submitTransaction(
    contractAddress: Address,
    valueInNativeUnits: bigint,
    data: Hex,
    signerSubstrateAddress: string,
    signer: PolkadotSigner,
    statusCallback?: (status: TransactionStatus) => void,
  ): Promise<Hash>;

  ensureAccountMapped(substrateAddress: string, signer: PolkadotSigner): Promise<void>;
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

function normalizeWeight(weight: any): SpWeightsWeightV2Weight {
  const refTime = weight?.ref_time ?? weight?.refTime ?? 0;
  const proofSize = weight?.proof_size ?? weight?.proofSize ?? 0;

  return {
    refTime: convertToBigInt(refTime, 0n),
    proofSize: convertToBigInt(proofSize, 0n),
  } as SpWeightsWeightV2Weight;
}

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

function normalizeFlags(flags: any): bigint {
  return convertToBigInt(flags, 0n);
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
      : {
          ok: null,
          err: rawResult.error ?? rawResult.value ?? null,
          successFlag: false,
        };
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

class ClientWrapper {
  private client: PolkadotApiClient;
  private mappedAccounts: Set<string> = new Set();

  /// We set these values to high, for some reason if we set them to low dry runs fail
  /// But this behavior is inconsistent and a work around was setting high values
  private static readonly DRY_RUN_STORAGE_LIMIT: bigint = 18446744073709551615n;
  private static readonly DRY_RUN_WEIGHT_LIMIT = {
    ref_time: 18446744073709551615n,
    proof_size: 18446744073709551615n,
  };

  constructor(client: PolkadotApiClient) {
    this.client = client;
  }

  async evmAddress(accountSs58: string): Promise<Address> {
    if (isAddress(accountSs58)) return accountSs58 as Address;
    const addr = await this.client.apis.ReviveApi.address(accountSs58);
    return addr.asHex() as Address;
  }

  async substrateAddress(evm: Address): Promise<string> {
    return await this.client.apis.ReviveApi.account_id(Binary.fromHex(evm));
  }

  async reviveCall(
    originSs58: string,
    to: Address,
    value: bigint,
    data: `0x${string}`,
  ): Promise<ReviveCallResult> {
    if (isAddress(originSs58)) {
      throw new Error("reviveCall origin must be SS58 (AccountId32), not an EVM address");
    }

    const executionResults = await this.client.apis.ReviveApi.call(
      originSs58,
      Binary.fromHex(to),
      value,
      ClientWrapper.DRY_RUN_WEIGHT_LIMIT,
      ClientWrapper.DRY_RUN_STORAGE_LIMIT,
      Binary.fromHex(data),
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

  async estimateGas(originSs58: string, to: Address, value: bigint, data: `0x${string}`) {
    const result = await this.reviveCall(originSs58, to, value, data);

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

  private async checkIfMapped(accountSs58: string): Promise<boolean> {
    try {
      const evm = await this.evmAddress(accountSs58);
      const key = Binary.fromHex(evm);
      const mapped = await this.client.query.Revive.OriginalAccount.getValue(key);
      return mapped !== null && mapped !== undefined;
    } catch {
      return false;
    }
  }

  async ensureAccountMapped(accountSs58: string, signer: PolkadotSigner): Promise<void> {
    if (isAddress(accountSs58)) {
      throw new Error("ensureAccountMapped expects SS58 (AccountId32), not an EVM address");
    }

    if (this.mappedAccounts.has(accountSs58)) return;

    const mapped = await this.checkIfMapped(accountSs58);
    if (mapped) {
      this.mappedAccounts.add(accountSs58);
      return;
    }

    const extrinsic = this.client.tx.Revive.map_account();

    try {
      await this.signExtrinsic(extrinsic, signer, () => {});
      this.mappedAccounts.add(accountSs58);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes("AccountAlreadyMapped")) {
        this.mappedAccounts.add(accountSs58);
        return;
      }
      throw error;
    }
  }

  private signExtrinsic(
    extrinsic: any,
    signer: PolkadotSigner,
    setTransactionStatus: (status: TransactionStatus) => void,
  ): Promise<Hash> {
    return new Promise<Hash>((resolve, reject) => {
      try {
        extrinsic.signSubmitAndWatch(signer).subscribe({
          next: (event: any) => {
            const txHash = event.txHash?.toString();

            switch (event.type) {
              case "signed":
                setTransactionStatus("signing");
                break;
              case "broadcasted":
                setTransactionStatus("broadcasting");
                break;
              case "txBestBlocksState":
                setTransactionStatus("included");
                break;
              case "finalized":
                if (event.dispatchError) {
                  setTransactionStatus("failed");
                  reject(new Error(`Transaction failed: ${event.dispatchError.toString()}`));
                  return;
                }
                setTransactionStatus("finalized");
                resolve(txHash as Hash);
                return;
              case "invalid":
              case "dropped":
                setTransactionStatus("failed");
                reject(new Error(`Transaction ${event.type}`));
                return;
            }
          },
          error: (error: any) => {
            setTransactionStatus("failed");
            reject(error);
          },
        });
      } catch (error) {
        setTransactionStatus("failed");
        reject(error);
      }
    });
  }

  async reviveTx(
    dest: Address,
    value: bigint,
    data: `0x${string}`,
    originSs58: string,
    signer: PolkadotSigner,
    setTransactionStatus: (status: TransactionStatus) => void,
  ): Promise<Hash> {
    await this.ensureAccountMapped(originSs58, signer);

    const gasEstimate = await this.estimateGas(originSs58, dest, value, data);

    if (!gasEstimate.success) {
      throw new Error(`Contract execution would revert: ${gasEstimate.revertData ?? "0x"}`);
    }

    const weightLimit = {
      proof_size: gasEstimate.gasRequired.proofSize,
      ref_time: gasEstimate.gasRequired.refTime,
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

    const extrinsic = this.client.tx.Revive.call({
      dest: Binary.fromHex(dest),
      value,
      weight_limit: weightLimit,
      storage_deposit_limit: storageDepositLimit,
      data: Binary.fromHex(data),
    });

    return await this.signExtrinsic(extrinsic, signer, setTransactionStatus);
  }

  getClient(): PolkadotApiClient {
    return this.client;
  }
}

export class ReviveClientWrapper implements IReviveClientWrapper {
  private wrapper: ClientWrapper;
  public readonly client: PolkadotApiClient;

  constructor(client: PolkadotApiClient) {
    this.client = client;
    this.wrapper = new ClientWrapper(client);
  }

  async getEvmAddress(substrateAddress: string): Promise<Address> {
    return await this.wrapper.evmAddress(substrateAddress);
  }

  async getSubstrateAddress(evmAddress: Address): Promise<string> {
    return await this.wrapper.substrateAddress(evmAddress);
  }

  async performDryRunCall(
    originSubstrateAddress: string,
    contractAddress: Address,
    valueInNativeUnits: bigint,
    data: Hex,
  ): Promise<ReviveCallResult> {
    return await this.wrapper.reviveCall(
      originSubstrateAddress,
      contractAddress,
      valueInNativeUnits,
      data,
    );
  }

  async submitTransaction(
    contractAddress: Address,
    valueInNativeUnits: bigint,
    data: Hex,
    signerSubstrateAddress: string,
    signer: PolkadotSigner,
    statusCallback?: (status: TransactionStatus) => void,
  ): Promise<Hash> {
    return await this.wrapper.reviveTx(
      contractAddress,
      valueInNativeUnits,
      data,
      signerSubstrateAddress,
      signer,
      statusCallback ?? (() => {}),
    );
  }

  async ensureAccountMapped(substrateAddress: string, signer: PolkadotSigner): Promise<void> {
    await this.wrapper.ensureAccountMapped(substrateAddress, signer);
  }
}
