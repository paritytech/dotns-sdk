<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans text-dot-text-primary">
    <div v-if="isLoading" class="animate-fade-in">
      <div class="text-center mb-6">
        <div
          class="w-16 h-16 rounded-full bg-dot-border mx-auto mb-4 animate-shimmer"
          style="
            background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
            background-size: 1000px 100%;
          "
        ></div>
        <div
          class="h-8 bg-dot-border w-48 mx-auto mb-3 rounded animate-shimmer"
          style="
            background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
            background-size: 1000px 100%;
          "
        ></div>
        <div
          class="h-4 bg-dot-border w-64 mx-auto mb-2 rounded animate-shimmer"
          style="
            background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
            background-size: 1000px 100%;
          "
        ></div>
        <div
          class="h-4 bg-dot-border w-32 mx-auto mb-6 rounded animate-shimmer"
          style="
            background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
            background-size: 1000px 100%;
          "
        ></div>
        <div
          class="h-10 bg-dot-border w-32 mx-auto rounded-lg animate-shimmer"
          style="
            background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
            background-size: 1000px 100%;
          "
        ></div>
      </div>

      <div class="grid gap-3">
        <div class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3">
          <div
            class="h-6 bg-dot-border w-32 mb-4 rounded animate-shimmer"
            style="
              background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
              background-size: 1000px 100%;
            "
          ></div>
          <div class="flex gap-3">
            <div
              class="h-8 bg-dot-border w-24 rounded-full animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-8 bg-dot-border w-28 rounded-full animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
          </div>
        </div>

        <div class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3">
          <div
            class="h-6 bg-dot-border w-32 mb-4 rounded animate-shimmer"
            style="
              background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
              background-size: 1000px 100%;
            "
          ></div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <div
                class="h-4 bg-dot-border w-16 mb-2 rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
              <div
                class="h-4 bg-dot-border w-full rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
            </div>
            <div>
              <div
                class="h-4 bg-dot-border w-16 mb-2 rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
              <div
                class="h-4 bg-dot-border w-32 rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
            </div>
            <div>
              <div
                class="h-4 bg-dot-border w-16 mb-2 rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
              <div
                class="h-4 bg-dot-border w-20 rounded animate-shimmer"
                style="
                  background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                  background-size: 1000px 100%;
                "
              ></div>
            </div>
          </div>
        </div>

        <div class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3">
          <div
            class="h-6 bg-dot-border w-32 mb-4 rounded animate-shimmer"
            style="
              background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
              background-size: 1000px 100%;
            "
          ></div>
          <div class="flex flex-wrap gap-3">
            <div
              class="h-8 bg-dot-border w-32 rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-8 bg-dot-border w-28 rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-8 bg-dot-border w-36 rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
          </div>
        </div>

        <div class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3">
          <div
            class="h-6 bg-dot-border w-32 mb-4 rounded animate-shimmer"
            style="
              background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
              background-size: 1000px 100%;
            "
          ></div>
          <div class="space-y-3">
            <div
              class="h-12 bg-dot-border rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-12 bg-dot-border rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-12 bg-dot-border rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
            <div
              class="h-12 bg-dot-border rounded animate-shimmer"
              style="
                background: linear-gradient(to right, #292524 4%, #44403c 25%, #292524 36%);
                background-size: 1000px 100%;
              "
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="animate-fade-in text-center">
      <img
        :src="blockieSrc"
        alt="Profile Avatar"
        class="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dot-border-strong mx-auto mb-4 object-cover"
      />

      <h1 class="text-xl sm:text-2xl font-serif font-extrabold text-dot-text-primary mb-1">
        {{ name || "Unknown" }}
      </h1>

      <p v-if="description" class="text-dot-text-secondary text-sm sm:text-base mb-1">
        {{ showFullDescription ? description : truncatedDescription }}
      </p>

      <button
        v-if="isTruncated"
        @click="showFullDescription = !showFullDescription"
        class="text-dot-accent hover:text-dot-accent-hover hover:underline text-xs sm:text-sm mb-2"
      >
        {{ showFullDescription ? "View less" : "View more" }}
      </button>

      <div v-if="url">
        <a
          :href="url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-dot-accent hover:text-dot-accent-hover hover:underline text-sm block mb-2"
        >
          Personal Profile
        </a>
      </div>

      <div v-if="isOwner" class="mt-4 flex flex-col items-center gap-3">
        <div class="flex flex-wrap items-center justify-center gap-3">
          <Button @click="showEditModal = true"> Edit Profile </Button>
          <Button
            v-if="!hasStore"
            variant="secondary"
            :loading="storeWriteLoading"
            :disabled="storeWriteLoading"
            @click="handleDeployStore"
          >
            Deploy Store
          </Button>
          <Button
            v-else-if="pendingAuthCount > 0"
            variant="secondary"
            :loading="storeWriteLoading"
            :disabled="storeWriteLoading"
            @click="showAuthModal = true"
          >
            Authorize ({{ pendingAuthCount }})
          </Button>
          <Button
            v-else-if="!nameInStore"
            variant="secondary"
            :loading="storeWriteLoading"
            :disabled="storeWriteLoading"
            @click="handleWriteToStore"
          >
            Add to Store
          </Button>
          <span
            v-else
            class="inline-flex items-center gap-1.5 text-xs text-success font-medium px-3 py-2"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-success" />
            Stored
          </span>
        </div>
        <p v-if="!hasStore" class="text-xs text-dot-text-tertiary max-w-sm text-center">
          Deploy a personal Store to index your domain. This is a one-time setup.
        </p>
        <p
          v-else-if="pendingAuthCount > 0"
          class="text-xs text-dot-text-tertiary max-w-sm text-center"
        >
          {{ pendingAuthCount }} contract{{ pendingAuthCount > 1 ? "s" : "" }} need authorization on
          your Store.
        </p>
        <p v-else-if="!nameInStore" class="text-xs text-dot-text-tertiary max-w-sm text-center">
          Write this name to your Store so it can be indexed and discovered by others.
        </p>
        <p v-if="storeError" class="text-xs text-error max-w-sm text-center">
          {{ storeError }}
        </p>
      </div>
    </div>

    <div v-if="!isLoading && owner" class="mt-6 grid gap-3">
      <section class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3 text-left">
        <h2 class="text-sm font-semibold mb-2 text-dot-text-primary">Accounts</h2>
        <div class="flex flex-wrap gap-3">
          <a
            v-if="twitter"
            :href="`https://x.com/${twitter}`"
            target="_blank"
            rel="noopener noreferrer"
            class="px-3 py-1 rounded-full bg-dot-surface-secondary text-dot-text-secondary text-sm font-medium"
          >
            @{{ twitter }}
          </a>
          <a
            v-if="github"
            :href="`https://github.com/${github}`"
            target="_blank"
            rel="noopener noreferrer"
            class="px-3 py-1 rounded-full bg-dot-surface-secondary text-dot-text-secondary text-sm font-medium"
          >
            {{ github }}
          </a>
          <p v-if="!twitter && !github" class="text-dot-text-tertiary text-sm italic">
            No linked accounts.
          </p>
        </div>
      </section>

      <section class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3 text-left">
        <h2 class="text-sm font-semibold mb-2 text-dot-text-primary">Ownership</h2>
        <div class="grid sm:grid-cols-2 gap-2">
          <div>
            <p class="text-dot-text-tertiary text-xs">Owner</p>
            <a
              :href="`${explorer}/account/${owner}`"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-dot-accent hover:text-dot-accent-hover text-sm break-all mt-1 hover:underline block"
            >
              {{ owner || "Unknown" }}
            </a>
          </div>
          <div>
            <p class="text-dot-text-tertiary text-xs">Parent</p>
            <p class="text-dot-text-secondary text-xs mt-0.5">{{ parent || "dot" }}</p>
          </div>
        </div>
      </section>

      <section class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3 text-left">
        <h2 class="text-sm font-semibold mb-2 text-dot-text-primary">Other Records</h2>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="(value, key) in records"
            :key="key"
            class="px-3 py-1 rounded bg-dot-surface-secondary text-dot-text-secondary text-xs sm:text-sm font-mono truncate max-w-full"
          >
            <span class="font-semibold text-dot-accent mr-1">{{ key }}:</span>
            <template v-if="key === 'com.x'">
              <a
                :href="`https://x.com/${value}`"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-dot-accent hover:text-dot-accent-hover"
              >
                @{{ value }}
              </a>
            </template>
            <template v-else-if="key === 'com.github'">
              <a
                :href="`https://github.com/${value}`"
                target="_blank"
                rel="noopener noreferrer"
                class="underline text-dot-accent hover:text-dot-accent-hover"
              >
                {{ value }}
              </a>
            </template>
            <template v-else>
              {{ value }}
            </template>
          </div>
          <p v-if="!Object.keys(records).length" class="text-dot-text-tertiary text-sm italic">
            No records found.
          </p>
        </div>
      </section>

      <section
        v-if="allDomains.length > 0"
        class="bg-dot-surface border border-dot-border rounded-xl shadow-sm p-3 text-left"
      >
        <h2 class="text-sm font-semibold mb-2 text-dot-text-primary">Domains</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-dot-border text-sm">
            <thead class="bg-dot-surface-secondary">
              <tr>
                <th class="px-4 py-2 text-left font-semibold text-dot-text-secondary text-xs">
                  Domain
                </th>
                <th class="px-4 py-2 text-left font-semibold text-dot-text-secondary text-xs">
                  Type
                </th>
                <th class="px-4 py-2 text-left font-semibold text-dot-text-secondary text-xs">
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dot-border bg-dot-surface">
              <tr
                v-for="domain in paginatedDomains"
                :key="domain.name"
                class="hover:bg-dot-surface-secondary"
              >
                <td class="px-4 py-2.5 font-medium text-dot-text-primary text-xs">
                  {{ domain.name || "Unknown" }}
                </td>
                <td class="px-4 py-2.5">
                  <span
                    class="px-1.5 py-0.5 text-[10px] rounded-full"
                    :class="
                      domain.type === 'TLD'
                        ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                        : 'bg-dot-border text-dot-text-secondary border border-dot-border'
                    "
                  >
                    {{ domain.type || "Unknown" }}
                  </span>
                </td>
                <td class="px-4 py-2.5">
                  <span
                    class="px-1.5 py-0.5 text-[10px] rounded-full"
                    :class="
                      domain.isOwner
                        ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                        : 'bg-dot-surface-secondary text-dot-text-tertiary border border-dot-border'
                    "
                  >
                    {{ domain.isOwner ? "Active" : "Not Owner" }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <TablePagination
          v-model="whoisPage"
          :total-items="allDomains.length"
          :page-size="whoisPageSize"
          item-label="domain"
          @update:page-size="whoisPageSize = $event"
        />
      </section>
    </div>

    <EditRecordsModal
      v-if="showEditModal"
      :open="showEditModal"
      :twitter="twitter || ''"
      :github="github || ''"
      :description="description || ''"
      :url="url || ''"
      :name="name || ''"
      @close="showEditModal = false"
      @save="handleSave"
    />

    <TransactionStatus
      v-if="showTxStatus"
      :open="showTxStatus"
      :handle="name ? name + '.dot' : 'Unknown'"
      :transaction="transaction"
      @close="showTxStatus = false"
    />

    <AuthorizeStoreModal
      v-if="showAuthModal"
      :open="showAuthModal"
      :contracts="authStatuses"
      :loading="storeWriteLoading"
      :progress="storeProgress"
      :error="storeError"
      @close="showAuthModal = false"
      @submit="handleAuthChanges"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, onBeforeMount, computed } from "vue";
import { useRoute } from "vue-router";
import { useWalletStore } from "@/store/useWalletStore";
import { zeroAddress, zeroHash, getAddress, type Address } from "viem";
import makeBlockie from "ethereum-blockies-base64";
import EditRecordsModal from "../components/EditRecordsModal.vue";
import TransactionStatus from "../components/TransactionStatus.vue";
import AuthorizeStoreModal from "../components/modals/AuthorizeStoreModal.vue";
import type { ProfileRecord, TransactionResult, MyDomain, ContractAuthStatus } from "@/type";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { useResolverStore } from "@/store/useResolverStore";
import Button from "@/components/ui/Button.vue";
import TablePagination from "@/components/ui/TablePagination.vue";

const route = useRoute();
const wallet = useWalletStore();
const networkStore = useNetworkStore();
const userStore = useUserStoreManager();
const resolverStore = useResolverStore();

const name = ref((route.params.name as string) || "");
if (name.value && !name.value.includes(".dot")) {
  name.value = name.value + ".dot";
}

const isLoading = ref(true);
const owner = ref<string | null>(null);
const parent = ref("dot");
const twitter = ref<string | null>(null);
const github = ref<string | null>(null);
const url = ref<string | null>(null);
const description = ref<string | null>(null);
const records = ref<Record<string, string>>({});
const allDomains = ref<MyDomain[]>([]);
const whoisPage = ref(1);
const whoisPageSize = ref(10);

const paginatedDomains = computed(() => {
  const start = (whoisPage.value - 1) * whoisPageSize.value;
  return allDomains.value.slice(start, start + whoisPageSize.value);
});

const showEditModal = ref(false);
const showTxStatus = ref(false);
const transaction = ref<TransactionResult>({ hash: zeroHash, status: false });

const hasStore = ref(false);
const nameInStore = ref(false);
const storeWriteLoading = ref(false);
const storeError = ref("");
const storeProgress = ref("");
const showAuthModal = ref(false);
const authStatuses = ref<ContractAuthStatus[]>([]);

const pendingAuthCount = computed(() => authStatuses.value.filter((c) => !c.authorized).length);

const explorer = computed(() => networkStore.currentNetwork?.blockExplorerUrls?.[0] || "");

const isOwner = computed(() => {
  if (!wallet.evmAddress || !owner.value) return false;
  if (owner.value === zeroAddress) return false;
  try {
    return getAddress(wallet.evmAddress) === getAddress(owner.value);
  } catch {
    return false;
  }
});

const blockieSrc = computed(() => {
  if (!owner.value || owner.value === zeroAddress) {
    return "/default-avatar.svg";
  }
  try {
    return makeBlockie(owner.value);
  } catch {
    return "/default-avatar.svg";
  }
});

const showFullDescription = ref(false);
const MAX_LEN = 50;

const truncatedDescription = computed(() => {
  if (!description.value) return "";
  if (description.value.length <= MAX_LEN) return description.value;
  return description.value.slice(0, MAX_LEN) + "...";
});

const isTruncated = computed(() => {
  return !!description.value && description.value.length > MAX_LEN;
});

function parseDotName(domainName: string): { parts: string[] } {
  const normalized = (domainName || "").trim().toLowerCase();
  const withoutTld = normalized.endsWith(".dot") ? normalized.slice(0, -4) : normalized;
  const parts = withoutTld.split(".").filter(Boolean);
  return { parts };
}

function getDotLevel(domainName: string): number {
  return parseDotName(domainName).parts.length || 1;
}

function getType(domainName: string): "TLD" | "Subdomain" {
  return getDotLevel(domainName) === 1 ? "TLD" : "Subdomain";
}

async function buildDomainRow(ownerAddress: Address, domainName: string): Promise<MyDomain | null> {
  try {
    const type = getType(domainName);

    let isDomainOwner = false;
    let statusLabel = "Tied to parent";

    try {
      const resolvedOwner = await resolverStore.getOwnerOfDomain(domainName);
      if (resolvedOwner && resolvedOwner !== zeroAddress) {
        isDomainOwner = getAddress(ownerAddress) === getAddress(resolvedOwner);
        statusLabel = isDomainOwner ? "Active" : "Not Owner";
      } else {
        isDomainOwner = type === "Subdomain";
        statusLabel = type === "Subdomain" ? "Tied to parent" : "Not Owner";
      }
    } catch {
      isDomainOwner = type === "Subdomain";
      statusLabel = type === "Subdomain" ? "Tied to parent" : "Not Owner";
    }

    return {
      name: domainName,
      type,
      expiry: "",
      statusLabel,
      statusIcon: "check",
      isOwner: isDomainOwner,
      needsResolver: false,
    } as MyDomain;
  } catch (err) {
    console.warn(`Failed to process domain ${domainName}:`, err);
    return null;
  }
}

async function loadDomains(ownerAddress: Address): Promise<void> {
  try {
    const allValues = await userStore.getSubdomainsForAddress(ownerAddress);
    const names = allValues.filter((v) => v.endsWith(".dot"));

    const results = await Promise.all(names.map((n) => buildDomainRow(ownerAddress, n)));

    allDomains.value = results.filter((d): d is MyDomain => d !== null);
  } catch (error) {
    console.warn("Failed to load domains:", error);
    allDomains.value = [];
  }
}

onBeforeMount(async () => {
  try {
    isLoading.value = true;

    if (!name.value) {
      console.warn("No domain name provided");
      return;
    }

    const ownerAddress = await resolverStore.getOwnerOfDomain(name.value);
    owner.value = ownerAddress;

    if (ownerAddress && ownerAddress !== zeroAddress) {
      const keys = ["com.x", "com.github", "description", "url"];
      const values = await Promise.all(keys.map((k) => resolverStore.getText(name.value, k)));

      twitter.value = values[0] ?? null;
      github.value = values[1] ?? null;
      description.value = values[2] ?? null;
      url.value = values[3] ?? null;

      records.value = {};
      if (twitter.value) records.value["com.x"] = twitter.value;
      if (github.value) records.value["com.github"] = github.value;

      await loadDomains(ownerAddress);
    }

    await checkStoreState();
  } catch (error: unknown) {
    console.warn("onBeforeMount error:", error);
  } finally {
    isLoading.value = false;
  }
});

function domainLabel(): string {
  const raw = (name.value || "").trim().toLowerCase();
  return raw.endsWith(".dot") ? raw.slice(0, -4) : raw;
}

async function checkStoreState(): Promise<void> {
  try {
    if (!isOwner.value || !wallet.isConnected) return;

    const storeAddress = await userStore.getUserStore(wallet.evmAddress as Address);
    hasStore.value = storeAddress !== zeroAddress;
    if (!hasStore.value) return;

    authStatuses.value = await userStore.getAuthorizationStatus(storeAddress);

    const label = domainLabel();
    if (!label) return;
    nameInStore.value = await userStore.isNameInStore(label);
  } catch {
    hasStore.value = false;
    nameInStore.value = false;
  }
}

function handleStoreError(action: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : "Unknown error";
  console.warn(`${action}:`, e);
  if (msg.includes("Wallet not connected")) {
    storeError.value = "Wallet not connected. Please connect and try again.";
  } else if (msg.includes("User rejected") || msg.includes("Cancelled")) {
    storeError.value = "Transaction was cancelled.";
  } else {
    storeError.value = `${action}: ${msg}`;
  }
}

async function handleDeployStore(): Promise<void> {
  if (!isOwner.value || !wallet.isConnected) {
    storeError.value = "Connect your wallet to deploy a Store.";
    return;
  }

  storeWriteLoading.value = true;
  storeError.value = "";
  try {
    showTxStatus.value = true;
    transaction.value = { hash: zeroHash, status: undefined };

    const hash = await userStore.deployStore();
    transaction.value = { hash, status: true };
    hasStore.value = true;
    await checkStoreState();
  } catch (e) {
    handleStoreError("Store deployment failed", e);
    transaction.value = { hash: zeroHash, status: false };
  } finally {
    storeWriteLoading.value = false;
  }
}

async function handleAuthChanges(
  changes: { address: Address; authorize: boolean }[],
): Promise<void> {
  if (!isOwner.value || !wallet.isConnected) return;

  const storeAddress = await userStore.getUserStore(wallet.evmAddress as Address);
  if (storeAddress === zeroAddress) return;
  if (changes.length === 0) return;

  storeWriteLoading.value = true;
  storeError.value = "";
  storeProgress.value =
    changes.length === 1
      ? `${changes[0]!.authorize ? "Authorizing" : "Revoking"} contract…`
      : `Batching ${changes.length} authorization changes…`;
  try {
    const hash = await userStore.batchAuthChanges(storeAddress, changes);

    for (const change of changes) {
      const contract = authStatuses.value.find((c) => c.address === change.address);
      if (contract) {
        contract.authorized = change.authorize;
      }
    }

    showAuthModal.value = false;
    showTxStatus.value = true;
    transaction.value = { hash, status: true };
  } catch (e) {
    handleStoreError("Authorization change failed", e);
  } finally {
    storeWriteLoading.value = false;
    storeProgress.value = "";
  }
}

async function handleWriteToStore(): Promise<void> {
  if (!isOwner.value || !wallet.isConnected) {
    storeError.value = "Connect your wallet to write to your Store.";
    return;
  }

  const label = domainLabel();
  if (!label) return;

  storeWriteLoading.value = true;
  storeError.value = "";
  try {
    showTxStatus.value = true;
    transaction.value = { hash: zeroHash, status: undefined };

    const hash = await userStore.writeNameToStore(label);
    transaction.value = { hash, status: true };
    nameInStore.value = true;
  } catch (e) {
    handleStoreError("Failed to write name", e);
    transaction.value = { hash: zeroHash, status: false };
  } finally {
    storeWriteLoading.value = false;
  }
}

async function handleSave(updated: ProfileRecord): Promise<void> {
  if (!isOwner.value) return;

  try {
    showTxStatus.value = true;
    transaction.value = { hash: zeroHash, status: undefined };

    const data = [
      { key: "com.x", value: updated.twitter || "" },
      { key: "com.github", value: updated.github || "" },
      { key: "description", value: updated.description || "" },
      { key: "url", value: updated.url || "" },
    ];

    const tx = await resolverStore.setProfileRecordsMulticall(name.value, data);
    transaction.value = tx;

    if (tx.status && owner.value && owner.value !== zeroAddress) {
      description.value = updated.description || null;
      twitter.value = updated.twitter || null;
      github.value = updated.github || null;
      url.value = updated.url || null;

      records.value = {};
      if (twitter.value) records.value["com.x"] = twitter.value;
      if (github.value) records.value["com.github"] = github.value;

      await loadDomains(getAddress(owner.value) as Address);
    }
  } catch (e) {
    console.warn("Failed to save:", e);
    transaction.value = { hash: zeroHash, status: false };
    showTxStatus.value = true;
  } finally {
    showEditModal.value = false;
  }
}
</script>
