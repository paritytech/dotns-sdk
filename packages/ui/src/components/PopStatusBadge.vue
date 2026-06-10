<template>
  <span
    v-if="status !== null"
    class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none cursor-default"
    :class="popStatusBadgeClass(status)"
    :title="tooltip"
    :aria-label="tooltip"
  >
    {{ shortLabel }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { PopStatus, type PopStatus as PopStatusValue } from "@/type";
import { popStatusBadgeClass } from "@/lib/uiHelpers";

const props = defineProps<{ status: PopStatusValue | null }>();

const LABELS: Record<PopStatusValue, string> = {
  [PopStatus.NoStatus]: "No Status",
  [PopStatus.PopLite]: "Lite Person",
  [PopStatus.PopFull]: "Full Person",
  [PopStatus.Reserved]: "Reserved",
};

const shortLabel = computed(() => (props.status === null ? "" : LABELS[props.status]));

const tooltip = computed(() =>
  props.status === null
    ? "Proof of Personhood status"
    : `Proof of Personhood: ${LABELS[props.status]}`,
);
</script>
