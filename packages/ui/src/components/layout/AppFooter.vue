<template>
  <footer
    class="w-full border-t border-dot-border bg-dot-bg/95 backdrop-blur-sm text-dot-text-tertiary text-xs py-3 flex items-center justify-center font-sans"
  >
    &copy; {{ currentYear }} Dotns
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear();
</script>
