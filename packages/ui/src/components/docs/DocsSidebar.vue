<template>
  <aside class="w-64 shrink-0 border-r border-dot-border overflow-y-auto h-full">
    <nav class="p-4 space-y-6">
      <div v-for="group in docsNav" :key="group.title">
        <button
          @click="toggleGroup(group.title)"
          class="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-dot-text-tertiary mb-2 px-2 hover:text-dot-text-secondary transition-colors"
        >
          {{ group.title }}
          <svg
            class="w-3 h-3 transition-transform duration-200"
            :class="{ 'rotate-90': openGroups.has(group.title) }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 max-h-0"
          enter-to-class="opacity-100 max-h-[1000px]"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 max-h-[1000px]"
          leave-to-class="opacity-0 max-h-0"
        >
          <ul v-show="openGroups.has(group.title)" class="space-y-0.5 overflow-hidden">
            <li v-for="item in group.items" :key="item.path">
              <RouterLink
                :to="item.path"
                class="block px-2 py-1.5 text-sm rounded-md transition-colors duration-150"
                :class="
                  isActive(item.path)
                    ? 'text-dot-accent bg-dot-accent-soft font-medium'
                    : 'text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-surface-secondary'
                "
              >
                {{ item.title }}
              </RouterLink>
            </li>
          </ul>
        </Transition>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import { docsNav } from "@/lib/docsNav";

const route = useRoute();

const openGroups = ref<Set<string>>(new Set(docsNav.map((g) => g.title)));

function toggleGroup(title: string) {
  if (openGroups.value.has(title)) {
    openGroups.value.delete(title);
  } else {
    openGroups.value.add(title);
  }
}

function isActive(path: string) {
  return route.path === path;
}
</script>
