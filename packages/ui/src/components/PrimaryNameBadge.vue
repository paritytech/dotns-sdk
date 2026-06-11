<template>
  <span
    v-if="isSameDotName(name, primaryName)"
    class="px-1.5 py-0.5 text-[10px] rounded-full bg-dot-text-primary text-dot-bg font-semibold"
  >
    Primary
  </span>
</template>

<script setup lang="ts">
import { isSameDotName } from "@/lib/domain";

// Renders the "Primary" pill only when `name` is the account's reverse record
// (its one resolvable name). Any other name renders nothing.
defineProps<{ name: string; primaryName: string | null }>();
</script>
