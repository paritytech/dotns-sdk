<template>
  <nav class="flex items-center gap-1 font-sans">
    <RouterLink
      v-for="item in navItems"
      :key="item.name"
      :to="item.path"
      class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
      :class="
        isActive(item.path)
          ? 'bg-dot-surface-secondary text-dot-text-primary'
          : 'text-dot-text-tertiary hover:bg-dot-surface-secondary hover:text-dot-text-primary'
      "
    >
      {{ item.name }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useWalletStore } from "@/store/useWalletStore";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const wallet = useWalletStore();

const navItems = ref(
  wallet.isConnected
    ? [
        { name: "Search", path: "/" },
        { name: "Lookup", path: "/lookup" },
        { name: "Profile", path: "/profile" },
        { name: "Docs", path: "/docs" },
      ]
    : [
        { name: "Search", path: "/" },
        { name: "Lookup", path: "/lookup" },
        { name: "Docs", path: "/docs" },
      ],
);
watch(
  () => wallet.isConnected,
  (isConnected) => {
    navItems.value = isConnected
      ? [
          { name: "Search", path: "/" },
          { name: "Lookup", path: "/lookup" },
          { name: "Profile", path: "/profile" },
          { name: "Docs", path: "/docs" },
        ]
      : [
          { name: "Search", path: "/" },
          { name: "Lookup", path: "/lookup" },
          { name: "Docs", path: "/docs" },
        ];
  },
);
const isActive = (path: string) => {
  if (path === "/docs") return route.path.startsWith("/docs");
  return route.path === path;
};
</script>
