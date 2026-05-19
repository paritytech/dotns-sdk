import { getContractManager } from "@/composables/useContracts";

export function normalizeNameInput(value: string): string {
  return value
    .trim()
    .replace(/\.dot$/, "")
    .toLowerCase();
}

// Ensures the ContractManager singleton (and the underlying chain client) is
// warmed before a docs interactive issues its first contract call. Doc demos
// can run before the user has navigated through a flow that warms the client
// on its own.
export async function ensureNetworkReady(): Promise<void> {
  await getContractManager();
}

export function formatNetworkError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("Client not initialized") || msg.includes("No valid network")) {
    return "Network client not ready. Please wait for the app to finish loading.";
  }
  return msg;
}

export function tierLabel(status: number): string {
  switch (status) {
    case 0:
      return "No Requirement";
    case 1:
      return "PoP Lite";
    case 2:
      return "PoP Full";
    case 3:
      return "Reserved";
    default:
      return "Unknown";
  }
}

export function tierClasses(status: number): string {
  switch (status) {
    case 0:
      return "bg-success/10 text-success";
    case 1:
      return "bg-dot-accent-soft text-dot-accent";
    case 2:
      return "bg-warning/10 text-warning";
    case 3:
      return "bg-error/10 text-error";
    default:
      return "bg-dot-surface-secondary text-dot-text-secondary";
  }
}

export function statusPanelClasses(status: string): string {
  switch (status) {
    case "error":
      return "border-error/30 bg-error/5";
    case "empty":
    case "no-address":
    case "not-set":
      return "border-warning/30 bg-warning/5";
    default:
      return "border-dot-border bg-dot-surface";
  }
}
