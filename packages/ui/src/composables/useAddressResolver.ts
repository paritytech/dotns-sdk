import { ref, watch, type Ref } from "vue";
import { isAddress, type Address } from "viem";
import { useResolverStore } from "@/store/useResolverStore";
import { useWalletStore } from "@/store/useWalletStore";
import { isValidSubstrateAddress } from "@/utils";
import { normalizeDomainName } from "@/utils";

export interface AddressResolutionResult {
  /** The resolved EVM address */
  resolvedAddress: Ref<Address | null>;
  /** Whether the resolution is in progress */
  isResolving: Ref<boolean>;
  /** Error message if resolution failed */
  error: Ref<string>;
  /** Whether the address was resolved (true) or directly provided (false) */
  wasResolved: Ref<boolean>;
}

export interface UseAddressResolverOptions {
  /** Optional default address when input is empty */
  defaultAddress?: Address | null;
  /** Whether to watch the input for changes (default: true) */
  watch?: boolean;
}

/**
 * Composable for resolving domain names, EVM addresses, and Substrate addresses to EVM addresses.
 *
 * Handles:
 * - .dot domain names -> resolves to owner address
 * - EVM addresses (0x...) -> returns as-is
 * - Substrate addresses (5...) -> converts to EVM
 *
 * @param input - Reactive string to resolve
 * @param options - Optional configuration
 * @returns Resolution result with resolved address, loading state, and error
 */
export function useAddressResolver(
  input: Ref<string>,
  options: UseAddressResolverOptions = {},
): AddressResolutionResult {
  const resolverStore = useResolverStore();
  const walletStore = useWalletStore();

  const resolvedAddress = ref<Address | null>(options.defaultAddress ?? null);
  const isResolving = ref(false);
  const error = ref("");
  const wasResolved = ref(false);

  async function resolve(value: string) {
    // Reset state
    resolvedAddress.value = null;
    error.value = "";
    wasResolved.value = false;

    // Empty input
    if (!value) {
      isResolving.value = false;
      if (options.defaultAddress) {
        resolvedAddress.value = options.defaultAddress;
      }
      return;
    }

    isResolving.value = true;

    try {
      // Classify in priority order: EVM address, then SS58 address, then .dot label.
      // SS58 must be matched before the label branch because an SS58 string is not
      // reliably distinguishable from a label by prefix (the network prefix varies).
      if (isAddress(value)) {
        resolvedAddress.value = value as Address;
        wasResolved.value = false;
        return;
      }

      if (isValidSubstrateAddress(value)) {
        const evmAddr = await walletStore.convertToEVM(value);
        resolvedAddress.value = evmAddr;
        wasResolved.value = true;
        return;
      }

      const normalizedName = normalizeDomainName(value);
      const address = await resolverStore.getOwnerOfDomain(normalizedName);
      if (!address) {
        error.value = "Domain not found or not registered";
        return;
      }
      resolvedAddress.value = address;
      wasResolved.value = true;
    } catch (err) {
      console.warn("Address resolution error:", err);
      error.value = "Failed to resolve address";
    } finally {
      isResolving.value = false;
    }
  }

  // Watch input for changes if enabled (default behavior)
  if (options.watch !== false) {
    watch(input, resolve, { immediate: false });
  }

  return {
    resolvedAddress,
    isResolving,
    error,
    wasResolved,
  };
}
