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
        @click.self="handleBackdropClick"
      >
        <Transition
          enter-active-class="transform transition duration-300 ease-out"
          enter-from-class="scale-95 opacity-0 translate-y-4"
          enter-to-class="scale-100 opacity-100 translate-y-0"
          leave-active-class="transform transition duration-200 ease-in"
          leave-from-class="scale-100 opacity-100 translate-y-0"
          leave-to-class="scale-95 opacity-0 translate-y-4"
        >
          <div v-if="open" :class="computedClass">
            <button
              v-if="showClose"
              class="absolute top-4 right-4 text-dot-text-tertiary hover:text-dot-text-secondary transition-colors"
              @click="emit('close')"
              :aria-label="closeLabel"
            >
              <Icon name="X" size="md" />
            </button>

            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";
import Icon from "./Icon.vue";

interface ModalProps {
  open: boolean;
  showClose?: boolean;
  closeOnBackdrop?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  class?: string;
  closeLabel?: string;
}

const props = withDefaults(defineProps<ModalProps>(), {
  showClose: true,
  closeOnBackdrop: true,
  size: "md",
  closeLabel: "Close modal",
});

const emit = defineEmits<{
  close: [];
}>();

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

const computedClass = computed(() =>
  cn(
    "bg-dot-surface rounded-2xl shadow-2xl w-full p-8 relative",
    sizeClasses[props.size],
    props.class,
  ),
);

function handleBackdropClick() {
  if (props.closeOnBackdrop) {
    emit("close");
  }
}
</script>
