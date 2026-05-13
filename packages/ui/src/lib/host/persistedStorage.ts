import { hostLocalStorage } from "@novasamatech/product-sdk";
import type { StorageLike } from "pinia-plugin-persistedstate";

const cache = new Map<string, string>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
let hydrated = false;

// Coalesce rapid setItem bursts (the typical pinia-plugin-persistedstate pattern
// fires one write per ref change — 4-5 in a row during connectWallet — which
// trips the host's storage rate limiter and causes writes to be dropped).
const FLUSH_DELAY_MS = 250;

// Pinia store ids that opt into persistence via `persist: { storage: hostBackedSyncStorage }`.
// Add new ids here so they're hydrated before the app mounts.
const PERSISTED_KEYS = ["useWalletStore"];

export async function hydratePersistedStorage(): Promise<void> {
  if (hydrated) return;
  await Promise.all(
    PERSISTED_KEYS.map(async (key) => {
      try {
        const value = await hostLocalStorage.readString(key);
        if (value) cache.set(key, value);
      } catch (error) {
        console.warn("[persistedStorage] hydrate failed for", key, error);
      }
    }),
  );
  hydrated = true;
}

function scheduleFlush(key: string): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      const value = cache.get(key);
      if (value !== undefined) {
        void hostLocalStorage.writeString(key, value);
      }
    }, FLUSH_DELAY_MS),
  );
}

export const hostBackedSyncStorage: StorageLike = {
  getItem(key) {
    return cache.get(key) ?? null;
  },
  setItem(key, value) {
    cache.set(key, value);
    scheduleFlush(key);
  },
};
