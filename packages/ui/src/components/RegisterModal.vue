<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        @click.self="closeModal"
      >
        <Transition
          enter-active-class="transform transition duration-300 ease-out"
          enter-from-class="scale-95 opacity-0 translate-y-4"
          enter-to-class="scale-100 opacity-100 translate-y-0"
          leave-active-class="transform transition duration-200 ease-in"
          leave-from-class="scale-100 opacity-100 translate-y-0"
          leave-to-class="scale-95 opacity-0 translate-y-4"
        >
          <div
            v-if="open"
            class="bg-dot-surface rounded-2xl shadow-2xl w-full max-w-md p-8 text-center relative"
          >
            <button
              class="absolute top-4 right-4 transition-colors"
              :class="
                isRegistering
                  ? 'text-dot-text-tertiary/30 cursor-not-allowed'
                  : 'text-dot-text-tertiary hover:text-dot-text-secondary cursor-pointer'
              "
              :disabled="isRegistering"
              @click="closeModal"
              aria-label="Close registration modal"
            >
              <Icon name="X" size="md" />
            </button>

            <h2 class="text-2xl font-bold text-dot-text-primary mb-2">{{ handle }}.dot</h2>

            <p class="text-dot-text-tertiary text-sm mb-6">
              The registration process involves two transactions.
            </p>

            <div class="text-left mb-6 space-y-3">
              <div class="bg-dot-surface-secondary rounded-lg p-4 border border-dot-border">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-dot-text-secondary"
                      >Your PoP Status</span
                    >
                    <div class="relative group/pop">
                      <Icon
                        name="Info"
                        size="sm"
                        class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                      />
                      <div
                        class="invisible group-hover/pop:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-64 z-10"
                      >
                        <p class="font-semibold mb-1">Proof of Personhood (PoP)</p>
                        <p class="mb-2">
                          A verification system that confirms unique human identity without
                          revealing personal information.
                        </p>
                        <ul class="space-y-1 text-left">
                          <li>
                            •
                            <span class="font-medium">Pop Full:</span> Complete verification
                          </li>
                          <li>• <span class="font-medium">Pop Lite:</span> Basic verification</li>
                          <li>
                            •
                            <span class="font-medium">No Status:</span>
                            Unverified
                          </li>
                        </ul>
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div class="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span
                    class="text-xs px-2 py-1 rounded-full"
                    :class="popStatusBadgeClass(wallet.userPopState)"
                  >
                    {{ PopStatusLabels[wallet.userPopState] }}
                  </span>
                </div>
              </div>

              <div
                v-if="userPopStatus"
                class="bg-dot-surface-secondary rounded-lg p-4 border"
                :class="
                  requirementMet
                    ? 'border-green-500/20 bg-green-500/10'
                    : 'border-amber-500/20 bg-amber-500/10'
                "
              >
                <div class="flex items-start gap-2">
                  <Icon
                    v-if="requirementMet"
                    name="CheckCircle"
                    size="md"
                    class="text-success mt-0.5 flex-shrink-0"
                  />
                  <Icon
                    v-else
                    name="AlertTriangle"
                    size="md"
                    class="text-amber-500 mt-0.5 flex-shrink-0"
                  />
                  <div class="flex-1">
                    <div
                      class="text-sm font-semibold"
                      :class="requirementMet ? 'text-green-400' : 'text-amber-400'"
                    >
                      Required: {{ PopStatusLabels[userPopStatus.requirement] }}
                    </div>
                    <p
                      class="text-xs mt-1"
                      :class="requirementMet ? 'text-green-500' : 'text-amber-500'"
                    >
                      {{ userPopStatus.message }}
                    </p>
                    <p v-if="!requirementMet" class="text-xs mt-2 text-amber-400 font-medium">
                      Your personhood verification must be
                      {{ PopStatusLabels[userPopStatus.requirement] }} to register this name.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="isReservedName" class="text-left mb-6">
              <div class="flex items-center gap-3">
                <Toggle
                  v-model="isGovernance"
                  :disabled="isFetching || isRegistering"
                  aria-labelledby="governance-label"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      id="governance-label"
                      class="text-sm font-semibold text-dot-text-secondary"
                      >Register via governance</span
                    >
                    <WhitelistBadge :whitelisted="whitelisted" />
                  </div>
                  <p class="text-xs text-dot-text-tertiary mt-1">
                    Reserved names are minted free through the whitelisted governance route.
                    <span v-if="!whitelisted" class="text-amber-500"
                      >Your account is not whitelisted, so this transaction will revert.</span
                    >
                  </p>
                </div>
              </div>
            </div>

            <div class="text-left mb-6">
              <div class="flex items-center gap-3">
                <Toggle
                  v-model="registerForOther"
                  :disabled="isFetching || isRegistering"
                  aria-labelledby="register-for-other-label"
                />
                <div class="flex-1">
                  <span
                    id="register-for-other-label"
                    class="text-sm font-semibold text-dot-text-secondary"
                    >Register for someone else</span
                  >
                  <p class="text-xs text-dot-text-tertiary mt-1">
                    You pay the fee; the name is owned by the address below.
                  </p>
                </div>
              </div>
              <div v-if="registerForOther" class="mt-3">
                <input
                  v-model="ownerInput"
                  type="text"
                  placeholder="Owner address (EVM, SS58, or .dot name)"
                  :disabled="isRegistering"
                  class="w-full border border-dot-border rounded-lg px-3 py-2 bg-dot-surface text-dot-text-primary placeholder:text-dot-text-tertiary focus:ring-2 focus:ring-dot-accent/20 focus:outline-none transition-colors text-sm font-mono"
                />
                <p v-if="isResolvingOwner" class="text-xs text-dot-text-tertiary mt-1">
                  Resolving…
                </p>
                <p v-else-if="ownerInput && ownerError" class="text-xs text-amber-500 mt-1">
                  {{ ownerError }}
                </p>
                <p
                  v-else-if="ownerInput && resolvedOwner"
                  class="text-xs text-dot-text-secondary mt-1 font-mono break-all"
                >
                  Owner: {{ resolvedOwner }}
                </p>
                <div
                  v-if="isCrossOwner && ownerPop !== null"
                  class="mt-2 flex items-center gap-2 text-xs"
                >
                  <span class="text-dot-text-tertiary">Owner's PoP status:</span>
                  <span class="px-2 py-0.5 rounded-full" :class="popStatusBadgeClass(ownerPop)">
                    {{ PopStatusLabels[ownerPop] }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="!registerForOther" class="text-left mb-6">
              <div class="flex items-center gap-3">
                <Toggle
                  v-model="isReserved"
                  :disabled="isFetching || isRegistering"
                  aria-labelledby="reverse-record-label"
                />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      id="reverse-record-label"
                      class="text-sm font-semibold text-dot-text-secondary"
                      >Set as Reverse Record</span
                    >
                    <div class="relative group/tooltip">
                      <Icon
                        name="Info"
                        size="sm"
                        class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                      />
                      <div
                        class="invisible group-hover/tooltip:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap z-10"
                      >
                        Makes this your default name for address resolution
                        <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div class="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p class="text-xs text-dot-text-tertiary mt-1">
                    Use this name as your primary identity when resolvers query your address
                  </p>
                </div>
              </div>
            </div>

            <div class="text-left mb-8">
              <div
                class="flex justify-between items-center text-sm font-medium text-dot-text-secondary mb-1"
              >
                <div class="flex items-center gap-2">
                  <span>Registration Fee</span>
                  <div class="relative group/pricing">
                    <Icon
                      name="Info"
                      size="sm"
                      class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                    />
                    <div
                      class="invisible group-hover/pricing:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-64 z-10"
                    >
                      <p class="font-semibold mb-1">Pricing by PoP Status:</p>
                      <ul class="space-y-1 text-left">
                        <li>• <span class="font-medium">Pop Lite/Full:</span> Free registration</li>
                        <li>
                          • <span class="font-medium">No Status:</span> Flat refundable deposit
                        </li>
                      </ul>
                      <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                        <div class="border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <span v-if="isFetching" class="text-dot-text-tertiary animate-pulse"
                  >Calculating...</span
                >
                <span
                  v-else
                  class="font-semibold"
                  :class="parsedPrice === 0n ? 'text-success' : 'text-dot-text-primary'"
                >
                  {{ parsedPrice === 0n ? "Free" : `${price} PAS` }}
                </span>
              </div>
            </div>

            <Button
              size="lg"
              variant="primary"
              full-width
              :disabled="
                isFetching ||
                isRegistering ||
                !wallet.isConnected ||
                !requirementMet ||
                (registerForOther && (isResolvingOwner || !resolvedOwner))
              "
              :loading="isRegistering"
              @click="startRegistration"
            >
              <span v-if="!isRegistering && !requirementMet">PoP Status Required</span>
              <span v-else-if="!isRegistering">Register</span>
              <span v-else>Registering...</span>
            </Button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from "vue";
import { useWalletStore } from "../store/useWalletStore";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Toggle from "@/components/ui/Toggle.vue";
import WhitelistBadge from "@/components/WhitelistBadge.vue";
import { PopStatus, PopStatusLabels, type NameRequirement, type Registration } from "../type";
import { useDomainStore } from "@/store/useDomainStore";
import { formatEther, zeroHash, parseEther, type Address } from "viem";
import { useToast } from "vue-toastification";
import { popStatusBadgeClass } from "@/lib/uiHelpers";
import { useAddressResolver } from "@/composables";
import { isSameEvmAddress } from "@/lib/address";

const props = defineProps<{
  open: boolean;
  handle: string;
  userPopStatus: NameRequirement | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [number];
  wait: [bigint, bigint, Registration, boolean];
}>();

const toaster = useToast();
const wallet = useWalletStore();
const domainStore = useDomainStore();

const price = ref("0");
const isFetching = ref(false);
const isRegistering = ref(false);
const isReserved = ref(false);
const isGovernance = ref(false);

const registerForOther = ref(false);
const ownerInput = ref("");
const ownerPop = ref<PopStatus | null>(null);
const whitelisted = ref(false);

const {
  resolvedAddress: resolvedOwner,
  isResolving: isResolvingOwner,
  error: ownerError,
} = useAddressResolver(ownerInput, { defaultAddress: wallet.evmAddress });

// The address the name is registered to: the connected wallet by default, or the
// resolved owner when registering on someone else's behalf.
const ownerEvm = computed<Address | null>(() =>
  registerForOther.value ? resolvedOwner.value : ((wallet.evmAddress as Address) ?? null),
);

const isCrossOwner = computed(
  () =>
    !!ownerEvm.value && !!wallet.evmAddress && !isSameEvmAddress(ownerEvm.value, wallet.evmAddress),
);

// Reserved names cannot be registered through the open commit-reveal path; they
// require the whitelisted governance route (registerReserved), which is free.
const isReservedName = computed(() => props.userPopStatus?.requirement === PopStatus.Reserved);

const parsedPrice = computed(() => {
  try {
    return parseEther(price.value);
  } catch {
    return 0n;
  }
});

// Eligibility is gated on the OWNER's PoP tier (the contract reverts
// OwnerStatusInsufficient otherwise), so when minting for someone else we check
// their status, not the caller's.
const effectivePop = computed<PopStatus | null>(() =>
  isCrossOwner.value ? ownerPop.value : (wallet.userPopState ?? null),
);

const requirementMet = computed(() => {
  if (!props.userPopStatus) return true;

  const required = props.userPopStatus.requirement;
  if (required === PopStatus.Reserved) return isGovernance.value;
  if (required === PopStatus.NoStatus) return true;

  const status = effectivePop.value;
  if (status == null) return false;
  if (required === PopStatus.PopLite) {
    return status === PopStatus.PopLite || status === PopStatus.PopFull;
  }
  if (required === PopStatus.PopFull) {
    return status === PopStatus.PopFull;
  }
  return false;
});

async function fetchPrice() {
  if (isGovernance.value) {
    price.value = "0";
    return;
  }
  const owner = ownerEvm.value;
  if (!owner) {
    price.value = "0";
    return;
  }
  try {
    isFetching.value = true;
    const cost = await domainStore.priceWithoutCheck(props.handle, owner);
    let total = cost.price;
    if (isCrossOwner.value && wallet.evmAddress) {
      const friction = await domainStore.quoteTransferFloor(
        props.handle,
        wallet.evmAddress as Address,
        owner,
      );
      if (friction > total) total = friction;
    }
    price.value = formatEther(total);
  } catch {
    price.value = "0";
  } finally {
    isFetching.value = false;
  }
}

// Re-price and re-check eligibility whenever the resolved owner changes.
watch([ownerEvm, isCrossOwner, isGovernance], async () => {
  ownerPop.value =
    isCrossOwner.value && ownerEvm.value ? await domainStore.userPopStatus(ownerEvm.value) : null;
  if (props.open) await fetchPrice();
});

async function startRegistration() {
  try {
    isRegistering.value = true;

    if (!wallet.isConnected || !wallet.evmAddress) {
      throw new Error("Wallet not connected");
    }

    const owner = ownerEvm.value;
    if (!owner) {
      toaster.error(ownerError.value || "Enter a valid owner address");
      isRegistering.value = false;
      return;
    }

    if (!requirementMet.value) {
      toaster.error(
        isCrossOwner.value
          ? "The owner's PoP status does not meet the requirements for this name"
          : "Your PoP status does not meet the requirements for this name",
      );
      isRegistering.value = false;
      return;
    }

    // Reverse record only applies to self-registration; never set someone else's name as ours.
    const { commitment, registration } = await domainStore.makeCommitment(
      props.handle,
      owner,
      isCrossOwner.value ? false : isReserved.value,
    );

    const result = await domainStore.commitRegistration(commitment);
    if (result === zeroHash) {
      toaster.error("Unable to register name");
      isRegistering.value = false;
      return;
    }

    const waitTime = await domainStore.getMinCommitmentAge();
    emit("wait", parsedPrice.value, BigInt(waitTime), registration, isGovernance.value);

    isRegistering.value = false;
    emit("close");
  } catch (error) {
    console.warn("Registration error:", error);
    toaster.error(error instanceof Error ? error.message : "Registration failed");
    isRegistering.value = false;
  }
}

function closeModal() {
  if (!isRegistering.value) {
    emit("close");
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === "Escape" && !isRegistering.value) {
    closeModal();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      isReserved.value = false;
      isGovernance.value = false;
      registerForOther.value = false;
      ownerInput.value = "";
      ownerPop.value = null;
      whitelisted.value = wallet.evmAddress
        ? await domainStore.isWhitelisted(wallet.evmAddress as Address)
        : false;
      await fetchPrice();
    } else {
      document.removeEventListener("keydown", handleEscape);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener("keydown", handleEscape);
});
</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
