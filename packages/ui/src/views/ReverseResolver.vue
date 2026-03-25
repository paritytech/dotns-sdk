<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 font-sans text-center">
    <Transition name="fade">
      <div v-if="!isNavigating" class="mb-6 animate-fade-in">
        <h1 class="text-xl sm:text-2xl font-serif font-extrabold text-dot-text-primary mb-2">
          Whois <span class="text-dot-accent">.dot</span> Lookup
        </h1>
        <p class="text-sm text-dot-text-secondary max-w-2xl mx-auto">
          Search for any
          <span class="font-semibold text-dot-accent">.dot</span> handle to see who owns it on
          Polkadot.
        </p>
      </div>
    </Transition>

    <div>
      <div
        class="relative transition-all duration-300 flex items-center rounded-xl border bg-dot-surface shadow-sm w-full"
        :class="borderClass"
      >
        <div class="flex items-center justify-center pl-4 pr-3 h-full">
          <Icon name="Search" size="md" :class="iconClass" />
        </div>

        <div class="relative flex-1 flex items-center">
          <input
            v-model="searchQuery"
            @input="handleInput"
            @keyup.enter="navigateToProfile"
            @focus="isFocused = true"
            @blur="handleBlur"
            type="text"
            placeholder="Search for a dot handle..."
            class="w-full py-2.5 pr-16 text-sm bg-transparent border-none focus:outline-none placeholder-dot-text-tertiary transition-colors duration-200"
            :class="{
              'text-dot-text-primary': !status,
              'text-success placeholder-success/60': status === 'available',
              'text-error placeholder-error/60': status === 'taken',
            }"
          />
          <span
            class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none"
            :class="{
              'text-dot-text-tertiary': !status,
              'text-success': status === 'available',
              'text-error': status === 'taken',
            }"
          >
            .dot
          </span>
        </div>

        <div class="absolute right-14 top-1/2 -translate-y-1/2">
          <Icon
            v-if="isLoading"
            name="Spinner"
            size="md"
            class="animate-spin text-dot-text-secondary"
          />
          <Icon v-else-if="status === 'available'" name="Check" size="lg" class="text-success" />
          <Icon v-else-if="status === 'taken'" name="X" size="lg" class="text-error" />
        </div>
      </div>

      <Transition name="fade">
        <div v-if="!isLoading && status" class="mt-3 text-center">
          <div
            v-if="status === 'available'"
            class="p-3 bg-success/10 border border-success/20 rounded-xl"
          >
            <p class="text-success font-medium text-sm">This handle is available!</p>
            <p class="text-success/70 mt-1 text-xs">No owner found on the registry.</p>
          </div>

          <div
            v-else-if="status === 'taken'"
            class="p-3 bg-dot-surface-secondary border border-dot-border rounded-xl cursor-pointer hover:border-dot-border-strong transition-colors duration-150 group"
            @click="navigateToProfile"
          >
            <p class="text-dot-text-primary font-medium text-sm mb-1">
              {{ searchQuery }}.dot is already taken
            </p>
            <p
              class="text-dot-text-tertiary text-xs group-hover:text-dot-text-secondary transition-colors"
            >
              Click to view {{ searchQuery }}.dot profile &rarr;
            </p>
          </div>
        </div>
      </Transition>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import type { DotNSStatus } from "@/type";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import Icon from "@/components/ui/Icon.vue";

const router = useRouter();
const storeManager = useUserStoreManager();
const searchQuery = ref("");
const status = ref<DotNSStatus | null>(null);
const isLoading = ref(false);
const isFocused = ref(false);
const isNavigating = ref(false);

let debounceTimer: number;

const iconClass = computed(() => {
  if (status.value === "taken") return "text-error";
  if (status.value === "available") return "text-success";
  return "text-dot-text-tertiary";
});

function handleInput() {
  clearTimeout(debounceTimer);
  status.value = null;
  if (!searchQuery.value.trim()) {
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  debounceTimer = window.setTimeout(checkName, 800);
}

function handleBlur() {
  isFocused.value = false;
}

async function checkName() {
  try {
    const available = await storeManager.checkHandleAvailability(searchQuery.value);
    status.value = available.available ? "available" : "taken";
    searchQuery.value = available.name ?? searchQuery.value;
  } catch (error) {
    console.warn("Whois check failed:", error);
    status.value = null;
  } finally {
    isLoading.value = false;
  }
}

async function navigateToProfile() {
  if (status.value === "taken" && searchQuery.value.trim()) {
    isNavigating.value = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    router.push(`/whois/${searchQuery.value}`);
  }
}

const borderClass = computed(() => {
  if (status.value === "available") return "border-success focus-within:border-success";
  if (status.value === "taken") return "border-error focus-within:border-error";
  return "border-dot-border focus-within:border-dot-border-strong focus-within:ring-1 focus-within:ring-dot-border-strong";
});
</script>
