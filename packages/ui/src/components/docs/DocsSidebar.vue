<template>
  <aside class="w-64 shrink-0 border-r border-dot-border overflow-y-auto h-full bg-dot-bg">
    <nav class="p-4 space-y-4">
      <div v-for="group in docsNav" :key="group.title">
        <button
          @click="toggleGroup(group.title)"
          class="flex items-center justify-between w-full text-[10px] font-semibold uppercase tracking-wider text-dot-text-tertiary mb-1.5 px-2 py-1 rounded hover:text-dot-text-secondary transition-colors duration-150"
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

        <div
          class="grid transition-[grid-template-rows] duration-200 ease-out"
          :class="openGroups.has(group.title) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        >
          <ul class="overflow-hidden space-y-0.5">
            <li v-for="item in group.items" :key="item.path">
              <RouterLink
                :to="item.path"
                class="block px-3 py-1.5 text-sm rounded-md transition-colors duration-150"
                :class="
                  isActive(item.path)
                    ? 'text-dot-text-primary bg-dot-surface-secondary font-medium border-l-2 border-dot-accent ml-0 pl-[10px]'
                    : 'text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-surface-secondary/50'
                "
              >
                {{ item.title }}
              </RouterLink>
            </li>
          </ul>
        </div>
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
