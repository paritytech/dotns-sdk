<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        @click="$emit('close')"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed left-0 top-0 bottom-0 w-72 bg-dot-bg border-r border-dot-border shadow-2xl z-50 md:hidden"
      >
        <div class="flex flex-col h-full">
          <div class="flex items-center justify-between p-4 border-b border-dot-border">
            <span class="text-sm font-semibold text-dot-text-primary">Documentation</span>
            <button
              @click="$emit('close')"
              class="p-2 rounded-lg text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors"
              aria-label="Close docs menu"
            >
              <Icon name="X" size="lg" />
            </button>
          </div>

          <nav class="flex-1 overflow-y-auto p-4 space-y-4">
            <div v-for="group in docsNav" :key="group.title">
              <p
                class="text-[10px] font-semibold uppercase tracking-wider text-dot-text-tertiary mb-1.5 px-2"
              >
                {{ group.title }}
              </p>
              <ul class="space-y-0.5">
                <li v-for="item in group.items" :key="item.path">
                  <RouterLink
                    :to="item.path"
                    class="block px-3 py-1.5 text-sm rounded-md transition-colors duration-150"
                    :class="
                      isActive(item.path)
                        ? 'text-dot-text-primary bg-dot-surface-secondary font-medium border-l-2 border-dot-accent pl-[10px]'
                        : 'text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-surface-secondary/50'
                    "
                    @click="$emit('close')"
                  >
                    {{ item.title }}
                  </RouterLink>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { docsNav } from "@/lib/docsNav";
import Icon from "@/components/ui/Icon.vue";

defineProps<{ isOpen: boolean }>();
defineEmits<{ close: [] }>();

const route = useRoute();

function isActive(path: string) {
  return route.path === path;
}
</script>
