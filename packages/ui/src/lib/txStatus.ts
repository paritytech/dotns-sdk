import type { TxStatus } from "@parity/product-sdk-tx";
import type { TransactionStatus } from "@/type";

// Single canonical mapping from the SDK's transaction lifecycle status onto the
// wallet store's UI status. Shared by every store that submits writes so the
// stores cannot drift on the naming.
export function mapTxStatus(status: TxStatus): TransactionStatus {
  switch (status) {
    case "in-block":
      return "included";
    case "error":
      return "failed";
    default:
      return status;
  }
}
