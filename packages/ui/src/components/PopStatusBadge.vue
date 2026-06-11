<template>
  <span
    v-if="status !== null"
    ref="anchor"
    class="relative inline-flex"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <button
      type="button"
      class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none cursor-help"
      :class="popStatusBadgeClass(status)"
      :aria-label="`Proof of Personhood: ${LABELS[status]}`"
      :aria-expanded="open || hovered"
      @click.stop="open = !open"
    >
      {{ LABELS[status] }}
    </button>

    <div
      v-if="open || hovered"
      class="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-dot-border bg-dot-surface p-3 text-left shadow-lg cursor-default"
    >
      <p class="text-xs font-semibold text-dot-text-primary mb-1.5">Proof of Personhood</p>
      <p class="text-xs text-dot-text-secondary mb-2">
        How strongly an account has proven it is a unique person. It gates which names you can
        register.
      </p>
      <ul class="space-y-1 text-xs text-dot-text-secondary mb-2">
        <li>
          <span class="font-medium text-dot-text-primary">Full Person</span>: strongest proof.
        </li>
        <li>
          <span class="font-medium text-dot-text-primary">Lite Person</span>: lightweight proof.
        </li>
        <li><span class="font-medium text-dot-text-primary">No Status</span>: not yet verified.</li>
      </ul>
      <RouterLink
        to="/docs/protocol/proof-of-personhood"
        class="text-xs text-dot-accent hover:text-dot-accent-hover"
      >
        How to get verified →
      </RouterLink>
    </div>
  </span>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import { PopStatus, type PopStatus as PopStatusValue } from "@/type";
import { popStatusBadgeClass } from "@/lib/uiHelpers";

defineProps<{ status: PopStatusValue | null }>();

const LABELS: Record<PopStatusValue, string> = {
  [PopStatus.NoStatus]: "No Status",
  [PopStatus.PopLite]: "Lite Person",
  [PopStatus.PopFull]: "Full Person",
  [PopStatus.Reserved]: "Reserved",
};

const anchor = ref<HTMLElement | null>(null);
const hovered = ref(false);
const open = ref(false);

function onDocumentClick(event: MouseEvent): void {
  if (open.value && anchor.value && !anchor.value.contains(event.target as Node)) {
    open.value = false;
  }
}

document.addEventListener("click", onDocumentClick);
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>
