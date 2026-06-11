import type { Hash, Hex } from "viem";
import { ContractRevertedError, ContractDryRunFailedError } from "@parity/product-sdk-contracts";
import type { TxStatus } from "@parity/product-sdk-tx";
import { mapTxStatus } from "@/lib/txStatus";
import { decodeRevertReason } from "@/lib/contractErrors";
import { WRITE_TX_DEFAULTS } from "@/composables/useContracts";
import { useWalletStore } from "@/store/useWalletStore";

type WriteResult = { ok: boolean; txHash: string; dispatchError?: unknown };
type SubstrateError = { type?: string; value?: { type?: string } };

function failure(action: string, detail: string | undefined): string {
  return `${action} failed: ${detail ?? "unknown error"}`;
}

function extractRevertData(dispatchError: unknown): Hex | undefined {
  const error = dispatchError as { data?: unknown; value?: { data?: unknown } };
  const data = error?.value?.data ?? error?.data;
  return typeof data === "string" && data.startsWith("0x") ? (data as Hex) : undefined;
}

function describeSubstrateError(error: SubstrateError): string {
  if (error.type === "Module" && error.value?.type) return `Module error: ${error.value.type}`;
  if (error.type) return error.type;
  return JSON.stringify(error);
}

function describeDispatchError(dispatchError: unknown): string {
  if (!dispatchError) return "unknown error";
  if (typeof dispatchError === "string") return dispatchError;
  return (
    decodeRevertReason(extractRevertData(dispatchError)) ??
    describeSubstrateError(dispatchError as SubstrateError)
  );
}

// Turns an SDK contract error into a short, human-readable message, decoding the
// revert bytes against the contract ABIs (viem) before any fallback.
export function describeContractError(error: unknown, action: string): string {
  if (error instanceof ContractRevertedError) {
    const reason =
      decodeRevertReason(error.data as Hex) ?? error.decoded?.errorName ?? error.reason;
    return failure(action, reason ?? error.data);
  }
  if (error instanceof ContractDryRunFailedError) {
    return failure(action, describeDispatchError(error.dispatchError));
  }
  if (error instanceof Error) return failure(action, error.message);
  return failure(action, describeDispatchError(error));
}

// Shared write lifecycle for state-changing contract calls: ensures the signer,
// shows the global transaction timeline immediately, and always resets it.
export function useContractWrite() {
  const walletStore = useWalletStore();

  function relayStatus(status: TxStatus): void {
    walletStore.setTransactionStatus(mapTxStatus(status));
  }

  function txOptions(extra?: Record<string, unknown>) {
    return { ...WRITE_TX_DEFAULTS, onStatus: relayStatus, ...extra };
  }

  // Options for native batch extrinsics (Utility.batch_all): per-call deposits are
  // set on each prepared call, so the batch only relays status and a wait target.
  function batchOptions() {
    return { waitFor: WRITE_TX_DEFAULTS.waitFor, onStatus: relayStatus };
  }

  async function withWrite<T>(run: () => Promise<T>): Promise<T> {
    await walletStore.ensureSignerReady();
    walletStore.setTransactionStatus("signing");
    try {
      return await run();
    } finally {
      walletStore.setTransactionStatus("idle");
    }
  }

  async function submitWrite(tx: Promise<WriteResult>, action: string): Promise<Hash> {
    let result: WriteResult;
    try {
      result = await tx;
    } catch (error) {
      throw new Error(describeContractError(error, action));
    }
    if (!result.ok) {
      throw new Error(failure(action, describeDispatchError(result.dispatchError)));
    }
    return result.txHash as Hash;
  }

  return { txOptions, batchOptions, withWrite, submitWrite };
}
