<script setup lang="ts">
import { ref } from "vue";
import FileUpload from "./FileUpload.vue";
const activeTab = ref<"file" | "folder">("file");
const copiedCommand = ref<string | null>(null);
const selectedPm = ref<"npm" | "yarn" | "bun-mac" | "bun-win">("npm");

const RELEASES_URL = "https://github.com/paritytech/dotns-sdk/releases";

const installCommands = {
  npm: "npm install -g @parity/dotns-cli",
  yarn: "yarn global add @parity/dotns-cli",
  "bun-mac": "bun add -g @parity/dotns-cli",
  "bun-win": "bun add -g @parity/dotns-cli",
};

const pmLabels = {
  npm: "npm",
  yarn: "yarn",
  "bun-mac": "bun (macOS/Linux)",
  "bun-win": "bun (Windows)",
};

const commands = {
  install: installCommands[selectedPm.value],
  upload: "dotns bulletin upload ./dist",
};

type CommandKey = "install" | "upload";

function getCommand(key: CommandKey): string {
  if (key === "install") return installCommands[selectedPm.value];
  return commands[key];
}

async function copyToClipboard(key: CommandKey) {
  try {
    await navigator.clipboard.writeText(getCommand(key));
    copiedCommand.value = key;
    setTimeout(() => {
      copiedCommand.value = null;
    }, 2000);
  } catch {
    console.error("Failed to copy");
  }
}

function handleUploadComplete() {}

function handleUploadError(message: string) {
  console.error("Upload error:", message);
}
</script>

<template>
  <div class="min-h-screen bg-dot-bg">
    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div class="text-center mb-6 sm:mb-8">
        <h2 class="text-2xl sm:text-3xl font-serif text-dot-text-primary mb-1.5">
          Publish to Bulletin Chain
        </h2>
        <p class="text-dot-text-tertiary text-sm">Decentralised storage on Polkadot.</p>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-dot-surface border border-dot-border rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-dot-text-primary font-medium flex items-center gap-2">
              Publish from
              <span class="text-dot-text-secondary">Terminal</span>
            </h3>
            <span class="text-dot-text-tertiary text-sm">Option 1</span>
          </div>

          <div class="space-y-2">
            <div class="bg-dot-bg border border-dot-border rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-1.5 border-b border-dot-border">
                <div class="flex items-center gap-2 overflow-x-auto">
                  <span class="text-dot-text-tertiary text-xs shrink-0">1. Install</span>
                  <div class="flex gap-1">
                    <button
                      v-for="(label, key) in pmLabels"
                      :key="key"
                      @click="selectedPm = key"
                      class="px-2 py-1 rounded-md text-[10px] transition-colors duration-200 ease-out whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40"
                      :class="[
                        selectedPm === key
                          ? 'bg-dot-surface-secondary text-dot-text-primary'
                          : 'text-dot-text-tertiary hover:text-dot-text-secondary',
                      ]"
                    >
                      {{ label }}
                    </button>
                  </div>
                </div>
                <button
                  @click="copyToClipboard('install')"
                  class="min-h-11 min-w-11 -mr-1.5 inline-flex items-center justify-center rounded-lg text-dot-text-tertiary hover:text-dot-text-secondary transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 shrink-0"
                  title="Copy"
                >
                  <svg
                    v-if="copiedCommand === 'install'"
                    class="w-4 h-4 text-success"
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
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
              <div class="px-3 py-2 font-mono text-xs overflow-x-auto">
                <span class="text-dot-text-tertiary select-none">$ </span>
                <span class="text-dot-text-secondary">{{ installCommands[selectedPm] }}</span>
              </div>
            </div>

            <div class="bg-dot-bg border border-dot-border rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-1.5 border-b border-dot-border">
                <span class="text-dot-text-tertiary text-xs">2. Upload</span>
                <button
                  @click="copyToClipboard('upload')"
                  class="min-h-11 min-w-11 -mr-1.5 inline-flex items-center justify-center rounded-lg text-dot-text-tertiary hover:text-dot-text-secondary transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 shrink-0"
                  title="Copy"
                >
                  <svg
                    v-if="copiedCommand === 'upload'"
                    class="w-4 h-4 text-success"
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
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
              <div class="px-3 py-2 font-mono text-xs overflow-x-auto">
                <span class="text-dot-text-tertiary select-none">$ </span>
                <span class="text-dot-text-secondary">dotns bulletin upload </span>
                <span class="text-dot-text-primary">./dist</span>
              </div>
            </div>
          </div>

          <a
            :href="RELEASES_URL"
            target="_blank"
            rel="noopener"
            class="block text-center text-dot-accent text-xs hover:text-dot-accent-hover hover:underline transition-colors duration-200 mt-4"
          >
            View all releases on GitHub
          </a>
        </div>

        <div class="bg-dot-surface border border-dot-border rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-dot-text-primary font-medium flex items-center gap-2">
              Publish from
              <span class="text-dot-text-secondary">Browser</span>
            </h3>
            <span class="text-dot-text-tertiary text-sm">Option 2</span>
          </div>

          <div class="flex mb-3">
            <button
              @click="activeTab = 'file'"
              :class="[
                'flex-1 min-h-9 px-3 text-xs font-medium rounded-l-lg border transition-colors duration-200 ease-out flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 focus-visible:ring-inset',
                activeTab === 'file'
                  ? 'bg-dot-surface-secondary border-dot-border-strong text-dot-text-primary'
                  : 'bg-dot-bg border-dot-border text-dot-text-tertiary hover:text-dot-text-secondary',
              ]"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                'flex-1 min-h-9 px-3 text-xs font-medium rounded-r-lg border-t border-r border-b transition-colors duration-200 ease-out flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 focus-visible:ring-inset',
                activeTab === 'folder'
                  ? 'bg-dot-surface-secondary border-dot-border-strong text-dot-text-primary'
                  : 'bg-dot-bg border-dot-border text-dot-text-tertiary hover:text-dot-text-secondary',
              ]"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            v-if="activeTab === 'file'"
            @upload-complete="handleUploadComplete"
            @error="handleUploadError"
          />

          <div v-else class="rounded-lg border border-dot-border bg-dot-surface p-5 space-y-4">
            <p class="text-sm text-dot-text-secondary">
              Folder uploads require the CLI so content can be announced on the IPFS network after
              storage.
            </p>

            <div
              class="bg-dot-bg border border-dot-border rounded-md p-3 font-mono text-xs text-dot-text-primary"
            >
              $ dotns bulletin upload &lt;file/dir&gt;
            </div>

            <a
              :href="RELEASES_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-xs text-dot-accent hover:underline"
            >
              Install the CLI from GitHub Releases
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div class="mt-10 sm:mt-12 text-center">
        <h3 class="text-lg sm:text-xl font-serif text-dot-text-primary mb-1.5">Why Bulletin?</h3>
        <p class="text-dot-text-tertiary mb-5 sm:mb-6 text-sm">
          From folder to live in one step. No cloud configuration. No server. No maintenance.
        </p>

        <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-dot-surface border border-dot-border rounded-lg p-4">
            <div
              class="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-4 h-4 text-dot-text-secondary"
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
            <h4 class="text-dot-text-primary text-sm font-medium mb-1">Instant Publish</h4>
            <p class="text-dot-text-tertiary text-xs">
              Upload a folder or run one command to go live instantly.
            </p>
          </div>

          <div class="bg-dot-surface border border-dot-border rounded-lg p-4">
            <div
              class="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-4 h-4 text-dot-text-secondary"
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
            <h4 class="text-dot-text-primary text-sm font-medium mb-1">Secure & Verifiable</h4>
            <p class="text-dot-text-tertiary text-xs">
              Content integrity is cryptographically verified on Polkadot.
            </p>
          </div>

          <div
            class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:col-span-2 md:col-span-1"
          >
            <div
              class="w-9 h-9 mx-auto mb-2.5 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-4 h-4 text-dot-text-secondary"
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
            <h4 class="text-dot-text-primary text-sm font-medium mb-1">Decentralised</h4>
            <p class="text-dot-text-tertiary text-xs">
              Stored on the Bulletin chain with IPFS compatibility.
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
