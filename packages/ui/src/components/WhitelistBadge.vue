<template>
  <span
    v-if="whitelisted"
    class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-dot-accent/15 text-dot-accent font-semibold"
    title="Authorised to register governance-reserved names"
  >
    <Icon name="CheckCircle" size="xs" />
    Whitelisted
  </span>
</template>

<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";

// Renders the "Whitelisted" pill only when the account is authorised for
// governance registration. Whitelist eligibility is separate from PoP tier.
defineProps<{ whitelisted: boolean }>();
</script>
