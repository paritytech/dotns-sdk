<template>
  <nav class="flex items-center gap-1 font-sans">
    <RouterLink
      v-for="item in navItems"
      :key="item.name"
      :to="item.path"
      class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/20 focus-visible:ring-offset-2 focus-visible:ring-offset-dot-bg"
      :class="
        isActive(item.path)
          ? 'bg-dot-surface-secondary text-dot-accent'
          : 'text-dot-text-tertiary hover:bg-dot-surface-secondary hover:text-dot-text-primary'
      "
    >
      {{ item.name }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useWalletStore } from "@/store/useWalletStore";

const route = useRoute();
const wallet = useWalletStore();

const baseItems = [
  { name: "Search", path: "/" },
  { name: "Lookup", path: "/lookup" },
  { name: "Upload", path: "/upload" },
];

const navItems = computed(() => [
  ...baseItems,
  ...(wallet.isConnected ? [{ name: "Profile", path: "/profile" }] : []),
  { name: "Docs", path: "/docs" },
]);

const isActive = (path: string) => {
  if (path === "/docs") return route.path.startsWith("/docs");
  return route.path === path;
};
</script>
