<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 font-sans text-center">
    <div class="mb-12 animate-fade-in">
      <h1
        class="text-4xl sm:text-5xl md:text-6xl font-serif font-extrabold text-dot-text-primary mb-4"
      >
        Find Your <span class="text-dot-accent">.dot</span> Handle
      </h1>
      <p class="text-lg sm:text-xl text-dot-text-secondary max-w-2xl mx-auto">
        Search for available handles or verify existing registrations on Polkadot.
      </p>
    </div>

    <SearchInput />
  </main>
</template>

<script setup lang="ts">
import SearchInput from "../components/domain/SearchInput.vue";
</script>
