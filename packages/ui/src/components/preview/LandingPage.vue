<script setup lang="ts">
import { ref } from "vue";
import FileUpload from "./FileUpload.vue";

const activeTab = ref<"file" | "folder">("file");
const copiedCommand = ref<string | null>(null);

const commands = {
  install: "bun add -g @dotns-sdk/cli",
  upload: "dotns bulletin upload ./dist",
};

async function copyToClipboard(key: "install" | "upload") {
  try {
    await navigator.clipboard.writeText(commands[key]);
    copiedCommand.value = key;
    setTimeout(() => {
      copiedCommand.value = null;
    }, 2000);
  } catch {
    console.error("Failed to copy");
  }
}

function handleUploadComplete(cid: string) {
  console.log("Upload complete:", cid);
}

function handleUploadError(message: string) {
  console.error("Upload error:", message);
}
</script>

<template>
  <div class="min-h-screen bg-dot-bg">
    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      <div class="text-center mb-8 sm:mb-12">
        <h2 class="text-3xl sm:text-4xl md:text-5xl font-serif text-dot-text-primary mb-3 sm:mb-4">
          Publish to Bulletin Chain
        </h2>
        <p class="text-dot-text-tertiary text-base sm:text-lg">
          Decentralised storage on Polkadot.
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6">
          <div class="flex items-center justify-between mb-4 sm:mb-6">
            <h3 class="text-dot-text-primary font-medium flex items-center gap-2">
              Publish from
              <span class="text-dot-text-secondary">Terminal</span>
            </h3>
            <span class="text-dot-text-tertiary text-sm">Option 1</span>
          </div>

          <div class="space-y-3">
            <div class="bg-dot-bg border border-dot-border rounded group">
              <div class="flex items-center justify-between px-3 py-2 border-b border-dot-border">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-dot-text-tertiary text-xs">bash</span>
                  <button
                    @click="copyToClipboard('install')"
                    class="p-1 rounded text-dot-text-tertiary hover:text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors"
                    title="Copy command"
                  >
                    <svg
                      v-if="copiedCommand === 'install'"
                      class="w-4 h-4 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <svg
                      v-else
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                <span class="text-dot-text-tertiary select-none">$ </span>
                <span class="text-dot-text-secondary">bun add </span>
                <span class="text-dot-text-primary">-g @dotns-sdk/cli</span>
              </div>
            </div>

            <div class="bg-dot-bg border border-dot-border rounded group">
              <div class="flex items-center justify-between px-3 py-2 border-b border-dot-border">
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                  <span class="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-dot-border"></span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-dot-text-tertiary text-xs">bash</span>
                  <button
                    @click="copyToClipboard('upload')"
                    class="p-1 rounded text-dot-text-tertiary hover:text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors"
                    title="Copy command"
                  >
                    <svg
                      v-if="copiedCommand === 'upload'"
                      class="w-4 h-4 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <svg
                      v-else
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                <span class="text-dot-text-tertiary select-none">$ </span>
                <span class="text-dot-text-secondary">dotns bulletin upload </span>
                <span class="text-dot-text-primary">./dist</span>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6">
          <div class="flex items-center justify-between mb-4 sm:mb-6">
            <h3 class="text-dot-text-primary font-medium flex items-center gap-2">
              Publish from
              <span class="text-dot-text-secondary">Browser</span>
            </h3>
            <span class="text-dot-text-tertiary text-sm">Option 2</span>
          </div>

          <div class="flex mb-4">
            <button
              @click="activeTab = 'file'"
              :class="[
                'flex-1 py-2 px-3 sm:px-4 text-sm font-medium rounded-l border transition-colors flex items-center justify-center gap-1.5 sm:gap-2',
                activeTab === 'file'
                  ? 'bg-dot-surface-secondary border-dot-border-strong text-dot-text-primary'
                  : 'bg-dot-bg border-dot-border text-dot-text-tertiary hover:text-dot-text-secondary',
              ]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>File</span>
            </button>
            <button
              @click="activeTab = 'folder'"
              :class="[
                'flex-1 py-2 px-3 sm:px-4 text-sm font-medium rounded-r border-t border-r border-b transition-colors flex items-center justify-center gap-1.5 sm:gap-2',
                activeTab === 'folder'
                  ? 'bg-dot-surface-secondary border-dot-border-strong text-dot-text-primary'
                  : 'bg-dot-bg border-dot-border text-dot-text-tertiary hover:text-dot-text-secondary',
              ]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <span>Folder</span>
            </button>
          </div>

          <FileUpload
            :mode="activeTab"
            @upload-complete="handleUploadComplete"
            @error="handleUploadError"
          />
        </div>
      </div>

      <div class="mt-12 sm:mt-16 text-center">
        <h3 class="text-xl sm:text-2xl font-serif text-dot-text-primary mb-2">Why Bulletin?</h3>
        <p class="text-dot-text-tertiary mb-6 sm:mb-8 text-sm sm:text-base">
          From folder to live in one step. No cloud configuration. No server. No maintenance.
        </p>

        <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6">
            <div
              class="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 sm:w-6 sm:h-6 text-dot-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h4 class="text-dot-text-primary font-medium mb-2">Instant Publish</h4>
            <p class="text-dot-text-tertiary text-sm">
              Upload a folder or run one command to go live instantly.
            </p>
          </div>

          <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6">
            <div
              class="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 sm:w-6 sm:h-6 text-dot-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h4 class="text-dot-text-primary font-medium mb-2">Secure & Verifiable</h4>
            <p class="text-dot-text-tertiary text-sm">
              Content integrity is cryptographically verified on Polkadot.
            </p>
          </div>

          <div
            class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6 sm:col-span-2 md:col-span-1"
          >
            <div
              class="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 sm:w-6 sm:h-6 text-dot-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            </div>
            <h4 class="text-dot-text-primary font-medium mb-2">Decentralised</h4>
            <p class="text-dot-text-tertiary text-sm">
              Stored on the Bulletin chain with IPFS compatibility.
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
