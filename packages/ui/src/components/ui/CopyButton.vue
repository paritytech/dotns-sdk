<template>
  <button
    type="button"
    class="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-dot-text-tertiary hover:text-dot-text-primary hover:bg-dot-surface-secondary transition-colors"
    :title="copied ? 'Copied!' : label"
    :aria-label="label"
    @click.stop="handleCopy"
  >
    <Icon :name="copied ? 'CheckCircle' : 'Copy'" size="sm" :class="copied ? 'text-success' : ''" />
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Icon from "@/components/ui/Icon.vue";
import { useCopyToClipboard } from "@/composables";

const props = withDefaults(defineProps<{ value: string; label?: string }>(), {
  label: "Copy",
});

const { copy } = useCopyToClipboard();
const copied = ref(false);

async function handleCopy() {
  if (!(await copy(props.value))) return;
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>
