import type { KeystorePayload, StoredAuth } from "./types";

/**
 * Normalize and validate account name.
 * Rejects names that could cause issues.
 *
 * Invalid patterns:
 * - Empty or whitespace-only names
 * - Names containing path separators (/ or \)
 * - Names that are just dots (. or ..)
 * - Names longer than 255 characters
 * - Names with control characters or null bytes
 * - Names with leading/trailing dots or spaces
 */
export function normalizeAccountName(input: any): string {
  const trimmedName = String(input ?? "default").trim();

  if (!trimmedName) return "default";

  if (trimmedName.length > 255) {
    throw new Error("Account name too long (max 255 characters)");
  }

  if (trimmedName.includes("/") || trimmedName.includes("\\")) {
    throw new Error("Account name cannot contain path separators (/ or \\)");
  }

  if (trimmedName === "." || trimmedName === "..") {
    throw new Error("Account name cannot be '.' or '..'");
  }

  if (/[\x00-\x1F\x7F]/.test(trimmedName)) {
    throw new Error("Account name cannot contain control characters");
  }

  if (trimmedName.startsWith(".") || trimmedName.endsWith(".")) {
    throw new Error("Account name cannot start or end with a dot");
  }

  // No Windows-reserved characters
  if (/[<>:"|?*]/.test(trimmedName)) {
    throw new Error('Account name cannot contain special characters: < > : " | ? *');
  }

  // Starting-from-scratch invariant: filename is `${account}.json`,
  // so name must be filename-safe
  // Allowed: letters, numbers, underscore, dot, dash
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmedName)) {
    throw new Error("Account name must match /^[A-Za-z0-9_.-]+$/ (no spaces)");
  }

  return trimmedName;
}

function isStoredAuthLike(value: any): value is StoredAuth {
  if (!value || typeof value !== "object") return false;
  const hasMnemonic = typeof value.mnemonic === "string" && value.mnemonic.length > 0;
  const hasKeyUri = typeof value.keyUri === "string" && value.keyUri.length > 0;
  return hasMnemonic || hasKeyUri;
}

export function normalizePayload(payload: any): KeystorePayload {
  if (
    payload &&
    typeof payload === "object" &&
    payload.version === 2 &&
    payload.accounts &&
    typeof payload.accounts === "object"
  ) {
    const validatedAccounts: Record<string, StoredAuth> = {};

    for (const [accountName, accountData] of Object.entries(payload.accounts)) {
      if (isStoredAuthLike(accountData)) {
        try {
          const normalizedAccountName = normalizeAccountName(accountName);
          validatedAccounts[normalizedAccountName] = accountData as StoredAuth;
        } catch {
          console.warn(`Skipping invalid account name: ${accountName}`);
        }
      }
    }

    let resolvedDefaultAccount: string;
    try {
      resolvedDefaultAccount = normalizeAccountName(payload.defaultAccount);
    } catch {
      resolvedDefaultAccount = Object.keys(validatedAccounts)[0] ?? "default";
    }

    if (!validatedAccounts[resolvedDefaultAccount]) {
      const firstValidAccount = Object.keys(validatedAccounts)[0];
      if (firstValidAccount) {
        resolvedDefaultAccount = firstValidAccount;
      } else {
        resolvedDefaultAccount = "default";
      }
    }

    return {
      version: 2,
      defaultAccount: resolvedDefaultAccount,
      accounts: validatedAccounts,
      updatedAtIso:
        typeof payload.updatedAtIso === "string" ? payload.updatedAtIso : new Date().toISOString(),
    };
  }

  if (isStoredAuthLike(payload)) {
    return {
      version: 2,
      defaultAccount: "default",
      accounts: { default: payload },
      updatedAtIso: new Date().toISOString(),
    };
  }

  return {
    version: 2,
    defaultAccount: "default",
    accounts: {},
    updatedAtIso: new Date().toISOString(),
  };
}
