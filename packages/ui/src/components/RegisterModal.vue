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
              v-if="wallet.transactionStatus === 'idle'"
              class="absolute top-4 right-4 text-dot-text-tertiary hover:text-dot-text-secondary transition-colors"
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
                      Please update your PoP status to
                      {{ PopStatusLabels[userPopStatus.requirement] }} to register this name.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div class="text-left mb-6">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="isReserved"
                    type="checkbox"
                    class="sr-only peer"
                    :disabled="isFetching || isRegistering"
                  />
                  <div
                    class="w-11 h-6 bg-dot-border-strong rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-dot-accent/20 transition-colors"
                  ></div>
                  <div
                    class="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-5"
                  ></div>
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-dot-text-secondary"
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
              </label>
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
                        <li>• <span class="font-medium">No Status:</span> Based on name length</li>
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
              :disabled="isFetching || isRegistering || !wallet.isConnected || !requirementMet"
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
import { ref, watch, computed } from "vue";
import { useWalletStore } from "../store/useWalletStore";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import { PopStatus, PopStatusLabels, type NameRequirement, type Registration } from "../type";
import { useDomainStore } from "@/store/useDomainStore";
import { formatEther, zeroHash, parseEther } from "viem";
import { useToast } from "vue-toastification";
import { popStatusBadgeClass } from "@/lib/uiHelpers";

const props = defineProps<{
  open: boolean;
  handle: string;
  userPopStatus: NameRequirement | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [number];
  wait: [bigint, bigint, Registration];
}>();

const toaster = useToast();
const wallet = useWalletStore();
const domainStore = useDomainStore();

const price = ref("0");
const isFetching = ref(false);
const isRegistering = ref(false);
const isReserved = ref(false);

const parsedPrice = computed(() => {
  try {
    return parseEther(price.value);
  } catch {
    return 0n;
  }
});

const requirementMet = computed(() => {
  if (!props.userPopStatus) return true;

  const required = props.userPopStatus.requirement;
  const userStatus = wallet.userPopState;

  if (required === PopStatus.Reserved) return false;
  if (required === PopStatus.NoStatus) return true;
  if (required === PopStatus.PopLite) {
    return userStatus === PopStatus.PopLite || userStatus === PopStatus.PopFull;
  }
  if (required === PopStatus.PopFull) {
    return userStatus === PopStatus.PopFull;
  }

  return false;
});

async function fetchPrice() {
  try {
    isFetching.value = true;
    const cost = await domainStore.priceWithoutCheck(props.handle);
    price.value = formatEther(cost.price);
  } catch {
    price.value = "0";
  } finally {
    isFetching.value = false;
  }
}

async function startRegistration() {
  try {
    isRegistering.value = true;

    const owner = wallet.evmAddress;
    if (!wallet.isConnected || !owner) {
      throw new Error("Wallet not connected");
    }

    if (!requirementMet.value) {
      toaster.error("Your PoP status does not meet the requirements for this name");
      isRegistering.value = false;
      return;
    }

    const { commitment, registration } = await domainStore.makeCommitment(
      props.handle,
      owner,
      isReserved.value,
    );

    const result = await domainStore.commitRegistration(commitment);
    if (result === zeroHash) {
      toaster.error("Unable to register name");
      isRegistering.value = false;
      return;
    }

    const waitTime = await domainStore.getMinCommitmentAge();
    emit("wait", parsedPrice.value, BigInt(waitTime), registration);

    isRegistering.value = false;
    emit("close");
  } catch (error) {
    console.warn("Registration error:", error);
    toaster.error(error instanceof Error ? error.message : "Registration failed");
    isRegistering.value = false;
  }
}

function closeModal() {
  if (wallet.transactionStatus === "idle") {
    emit("close");
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await fetchPrice();
      isReserved.value = false;
    }
  },
  { immediate: true },
);
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
