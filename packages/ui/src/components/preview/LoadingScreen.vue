<script setup lang="ts"></script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-6 bg-dot-bg">
    <div class="text-center">
      <h1 class="text-6xl md:text-7xl font-serif text-dot-text-primary mb-4 animate-pulse-slow">
        Dotns
      </h1>

      <div class="w-48 mx-auto mb-8">
        <div class="h-0.5 bg-dot-surface-secondary rounded-full overflow-hidden">
          <div class="h-full w-1/3 bg-dot-text-secondary rounded-full animate-loading-bar"></div>
        </div>
      </div>

      <p class="text-dot-text-tertiary text-lg">Loading your content preview</p>

      <div class="flex justify-center gap-1.5 mt-6">
        <span
          class="w-2 h-2 rounded-full bg-dot-primary animate-dot-bounce"
          style="animation-delay: -0.32s"
        ></span>
        <span
          class="w-2 h-2 rounded-full bg-dot-primary animate-dot-bounce"
          style="animation-delay: -0.16s"
        ></span>
        <span class="w-2 h-2 rounded-full bg-dot-primary animate-dot-bounce"></span>
      </div>
    </div>
  </div>
</template>
