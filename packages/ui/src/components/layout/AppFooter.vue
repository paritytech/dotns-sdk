<template>
  <footer
    class="w-full fixed bottom-0 left-0 border-t border-dot-surface-secondary bg-dot-surface text-dot-text-tertiary text-sm py-4 flex items-center justify-center font-sans"
  >
    © {{ currentYear }} Dotns. All rights reserved.
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>
