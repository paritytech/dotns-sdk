<template>
  <div class="my-6 overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-dot-border">
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-medium">Name</th>
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-medium">Type</th>
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="param in params" :key="param.name" class="border-b border-dot-border/50">
          <td class="px-4 py-2.5">
            <code
              class="text-dot-accent text-xs font-mono bg-dot-surface-secondary px-1.5 py-0.5 rounded"
              >{{ param.name }}</code
            >
            <span v-if="param.required" class="text-error text-xs ml-1">*</span>
          </td>
          <td class="px-4 py-2.5">
            <code class="text-dot-text-secondary text-xs font-mono break-all">{{
              param.type
            }}</code>
          </td>
          <td class="px-4 py-2.5 text-dot-text-secondary break-words">{{ param.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
export interface Param {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

defineProps<{
  params: Param[];
}>();
</script>
