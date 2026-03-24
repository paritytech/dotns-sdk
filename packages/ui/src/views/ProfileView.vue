<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 font-sans text-dot-text-primary">
    <div class="mb-8 text-center">
      <h1 class="text-4xl font-serif font-extrabold text-dot-text-primary mb-4">Profile</h1>
    </div>

    <div class="mb-8 flex border-b border-dot-border">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="px-6 py-3 text-sm font-medium transition-colors relative"
        :class="
          activeTab === tab.id
            ? 'text-dot-accent'
            : 'text-dot-text-tertiary hover:text-dot-text-secondary'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <div
          v-if="activeTab === tab.id"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-dot-accent"
        />
      </button>
    </div>

    <div v-show="activeTab === 'domains'">
      <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search domains..."
          class="border border-dot-border rounded-lg px-4 py-2 w-full sm:w-1/3 bg-dot-surface text-dot-text-primary focus:ring-2 focus:ring-dot-accent/20 focus:outline-none"
          :disabled="isLoading"
        />
        <div class="flex gap-3" v-if="tlds.length > 0">
          <Button @click="openAddSubdomains" :disabled="isLoading"> Add Subdomain </Button>
          <Button
            variant="secondary"
            @click="openTransferModal"
            :disabled="isLoading || transferableTlds.length === 0"
          >
            Transfer Domain
          </Button>
        </div>
      </div>

      <div
        v-if="isLoading"
        class="overflow-x-auto border border-dot-border rounded-xl shadow-sm animate-pulse"
      >
        <table class="min-w-full divide-y divide-dot-border text-sm">
          <thead class="bg-dot-surface-secondary">
            <tr>
              <th v-for="i in 6" :key="i" class="px-6 py-3 text-left">
                <div class="h-4 bg-dot-border rounded w-24"></div>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border bg-dot-surface">
            <tr v-for="i in 5" :key="i" class="animate-pulse">
              <td v-for="j in 6" :key="j" class="px-6 py-3">
                <div class="h-4 bg-dot-border rounded w-20"></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-else-if="allDomains.length === 0"
        class="border border-dot-border rounded-xl shadow-sm p-16 text-center"
      >
        <svg
          class="w-16 h-16 mx-auto mb-4 text-dot-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 class="text-lg font-medium text-dot-text-primary mb-2">No domains found</h3>
        <p class="text-dot-text-tertiary mb-6">Register your first domain to get started</p>
        <Button @click="router.replace('/')">Register Domain</Button>
      </div>

      <div v-else class="overflow-x-auto border border-dot-border rounded-xl shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-dot-border text-sm">
            <thead class="bg-dot-surface-secondary">
              <tr>
                <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Domain</th>
                <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Type</th>
                <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">
                  <div class="flex items-center gap-2">
                    <span>PoP Requirement</span>

                    <div class="relative inline-flex items-center">
                      <button
                        ref="headerInfoButton"
                        type="button"
                        class="inline-flex items-center"
                        aria-label="Proof of Personhood info"
                        @mouseenter="showHeaderTooltip"
                        @mouseleave="hideHeaderTooltip"
                        @focus="showHeaderTooltip"
                        @blur="hideHeaderTooltip"
                      >
                        <Icon
                          name="Info"
                          size="sm"
                          class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                        />
                      </button>

                      <Teleport to="body">
                        <div
                          v-if="headerTooltipVisible"
                          ref="headerTooltipRef"
                          class="fixed z-[99999] pointer-events-none"
                          :style="headerTooltipStyle"
                        >
                          <div
                            class="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg max-w-xs"
                          >
                            <p class="font-semibold mb-1">Proof of Personhood (PoP)</p>
                            <p class="mb-2">
                              Verification system that confirms unique human identity without
                              revealing personal information.
                            </p>
                            <ul class="space-y-1 text-left">
                              <li>
                                • <span class="font-medium">Pop Full:</span>
                                Complete verification
                              </li>
                              <li>
                                • <span class="font-medium">Pop Lite:</span> Basic verification
                              </li>
                              <li>
                                • <span class="font-medium">No Status:</span>
                                Unverified
                              </li>
                              <li>
                                • <span class="font-medium">Reserved:</span>
                                Governance only
                              </li>
                            </ul>
                          </div>
                        </div>
                      </Teleport>
                    </div>
                  </div>
                </th>
                <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Status</th>
                <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Actions</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-dot-border bg-dot-surface">
              <tr
                v-for="domain in paginatedDomains"
                :key="domain.name"
                class="hover:bg-dot-surface-secondary"
              >
                <td class="px-6 py-4 font-medium text-dot-text-primary">
                  {{ domain.name }}
                </td>

                <td class="px-6 py-4">
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="
                      domain.type === 'TLD'
                        ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                        : 'bg-dot-border text-dot-text-secondary border border-dot-border'
                    "
                  >
                    {{ domain.type }}
                  </span>
                </td>

                <td class="px-6 py-4">
                  <div v-if="domain.popRequirement" class="flex items-center gap-2">
                    <span
                      class="text-xs px-2 py-1 rounded-full"
                      :class="popStatusBadgeClass(domain.popRequirement.requirement)"
                    >
                      {{ PopStatusLabels[domain.popRequirement.requirement] }}
                    </span>

                    <div class="relative inline-flex items-center">
                      <button
                        :ref="(el) => setRowInfoButton(domain.name, el)"
                        type="button"
                        class="inline-flex items-center"
                        aria-label="PoP requirement details"
                        @mouseenter="showRowTooltip(domain.name)"
                        @mouseleave="hideRowTooltip(domain.name)"
                        @focus="showRowTooltip(domain.name)"
                        @blur="hideRowTooltip(domain.name)"
                      >
                        <svg
                          class="w-4 h-4 text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </button>

                      <Teleport to="body">
                        <div
                          v-if="activeRowTooltip === domain.name"
                          :ref="(el) => setRowTooltipRef(domain.name, el)"
                          class="fixed z-[99999] pointer-events-none"
                          :style="rowTooltipStyles[domain.name] || {}"
                        >
                          <div
                            class="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-normal max-w-xs"
                          >
                            <p class="font-semibold mb-1">
                              {{ PopStatusLabels[domain.popRequirement.requirement] }}
                            </p>
                            <p>{{ domain.popRequirement.message }}</p>
                          </div>
                        </div>
                      </Teleport>
                    </div>
                  </div>

                  <span v-else class="text-xs text-dot-text-tertiary">Loading...</span>
                </td>

                <td class="px-6 py-4">
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="
                      domain.isOwner
                        ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                        : 'bg-dot-surface-secondary text-dot-text-tertiary border border-dot-border'
                    "
                  >
                    {{ domain.isOwner ? "Active" : "Not Owner" }}
                  </span>
                </td>

                <td class="px-6 py-4">
                  <div class="flex gap-2">
                    <Button size="sm" @click="openRecordEditor(domain.name)"> Edit </Button>
                    <Button size="sm" variant="secondary" @click="openResolve(domain.name)">
                      Resolve
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePagination
          v-model="currentPage"
          :total-items="filteredDomains.length"
          :page-size="itemsPerPage"
          item-label="domain"
          @update:page-size="itemsPerPage = $event"
        />
      </div>
    </div>

    <div v-show="activeTab === 'bulletin'">
      <div class="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <p class="text-dot-text-tertiary text-sm">Content you've uploaded to the Bulletin chain</p>
        <div class="flex gap-2">
          <Button size="sm" variant="secondary" @click="showAddCidForm = !showAddCidForm">
            Add CID
          </Button>
          <Button size="sm" @click="router.push('/upload')">Upload</Button>
        </div>
      </div>

      <div
        v-if="showAddCidForm"
        class="mb-4 rounded-xl border border-dot-border bg-dot-surface p-4"
      >
        <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="handleAddCid">
          <input
            v-model="addCidInput"
            type="text"
            placeholder="Enter a CID (e.g. bafybeif2uy...)"
            class="flex-1 bg-dot-bg border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-1 focus:ring-dot-accent/30"
          />
          <div class="flex gap-2">
            <Button size="sm" type="submit" :disabled="!isValidCid(addCidInput) || isAddingCid">
              {{ isAddingCid ? "Saving..." : "Save to Store" }}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              @click="
                showAddCidForm = false;
                addCidInput = '';
              "
            >
              Cancel
            </Button>
          </div>
        </form>
        <p v-if="addCidInput && !isValidCid(addCidInput)" class="text-xs text-error mt-2">
          Enter a valid CID starting with "baf"
        </p>
      </div>

      <div v-if="isLoadingUploads" class="border border-dot-border rounded-xl shadow-sm p-8">
        <div class="animate-pulse space-y-3">
          <div class="h-4 bg-dot-border rounded w-1/3"></div>
          <div class="h-4 bg-dot-border rounded w-1/2"></div>
        </div>
      </div>

      <div
        v-else-if="bulletinUploads.length === 0"
        class="border border-dot-border rounded-xl shadow-sm p-12 text-center"
      >
        <svg
          class="w-12 h-12 mx-auto mb-3 text-dot-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p class="text-dot-text-tertiary mb-4">No uploads yet</p>
        <Button @click="router.push('/upload')">Upload Content</Button>
      </div>

      <div v-else class="border border-dot-border rounded-xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-dot-border text-sm">
            <thead class="bg-dot-surface-secondary">
              <tr>
                <th class="px-4 sm:px-6 py-3 text-left font-semibold text-dot-text-secondary">
                  CID
                </th>
                <th class="px-4 sm:px-6 py-3 text-left font-semibold text-dot-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dot-border bg-dot-surface">
              <tr v-for="cid in paginatedUploads" :key="cid" class="hover:bg-dot-surface-secondary">
                <td class="px-4 sm:px-6 py-4">
                  <div class="flex items-center gap-2">
                    <span
                      class="font-mono text-xs text-dot-text-primary hidden sm:inline"
                      :title="cid"
                    >
                      {{ cid.slice(0, 20) }}...{{ cid.slice(-8) }}
                    </span>
                    <span class="font-mono text-xs text-dot-text-primary sm:hidden" :title="cid">
                      {{ cid.slice(0, 12) }}...{{ cid.slice(-4) }}
                    </span>
                    <button
                      class="text-dot-text-tertiary hover:text-dot-text-primary transition-colors cursor-pointer shrink-0"
                      :title="cidCopied === cid ? 'Copied!' : 'Copy CID'"
                      @click="copyCid(cid)"
                    >
                      <svg
                        v-if="cidCopied !== cid"
                        class="w-3.5 h-3.5"
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
                      <svg
                        v-else
                        class="w-3.5 h-3.5 text-success"
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
                    </button>
                  </div>
                </td>
                <td class="px-4 sm:px-6 py-4">
                  <div class="flex gap-2">
                    <Button size="sm" @click="router.push(`/preview/${encodeForPreview(cid)}`)">
                      Preview
                    </Button>
                    <Button size="sm" variant="secondary" as-child>
                      <a
                        :href="`https://paseo-ipfs.polkadot.io/ipfs/${cid}`"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        IPFS
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      :disabled="deletingCid === cid"
                      @click="handleDeleteCid(cid)"
                    >
                      {{ deletingCid === cid ? "Removing..." : "Remove" }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePagination
          v-model="bulletinPage"
          :total-items="bulletinUploads.length"
          :page-size="bulletinPageSize"
          item-label="upload"
          @update:page-size="bulletinPageSize = $event"
        />
      </div>
    </div>

    <AddSubdomainModal
      :open="showAddModal?.open || false"
      @close="showAddModal = undefined"
      :tlds="tlds"
      @registered="handleSubdomainRegistered"
    />

    <TransferDomainModal
      :open="showTransferModal"
      @close="showTransferModal = false"
      :domains="transferableTlds"
      @transferred="handleDomainTransferred"
    />

    <TransactionStatus
      :open="showTransaction"
      :handle="selectedHandle"
      :transaction="transaction"
      @close="showTransaction = false"
    />

    <ResolveIPFSModal
      :open="showResolveModal"
      :name="selectedDomain"
      @close="showResolveModal = false"
      @save="saveResolve"
    />

    <AuthorizeStoreModal
      v-if="authGuard.showAuthModal.value"
      :open="authGuard.showAuthModal.value"
      :contracts="authGuard.authStatuses.value"
      :loading="authGuard.authLoading.value"
      :progress="authGuard.authProgress.value"
      :error="authGuard.authError.value"
      @close="authGuard.handleAuthClose"
      @submit="authGuard.handleAuthSubmit"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, watch } from "vue";
import { useWalletStore } from "@/store/useWalletStore";
import AddSubdomainModal from "../components/modals/AddSubdomainModal.vue";
import TransferDomainModal from "../components/modals/TransferDomainModal.vue";
import AuthorizeStoreModal from "../components/modals/AuthorizeStoreModal.vue";
import ResolveIPFSModal from "../components/modals/ResolveIPFSModal.vue";
import TransactionStatus from "../components/TransactionStatus.vue";
import { useStoreAuthGuard } from "@/composables/useStoreAuthGuard";
import type { MyDomain, TransactionResult, NameRequirement } from "@/type";
import { getAddress, zeroHash, zeroAddress } from "viem";
import { useRouter } from "vue-router";
import { useResolverStore } from "@/store/useResolverStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { useDomainStore } from "@/store/useDomainStore";
import { PopStatusLabels } from "@/type";
import { popStatusBadgeClass } from "@/lib/uiHelpers";
import { useTooltip, useTooltipManager } from "@/composables";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import TablePagination from "@/components/ui/TablePagination.vue";
import { encodeForPreview } from "@/lib/preview";

const wallet = useWalletStore();
const authGuard = useStoreAuthGuard();
const isLoading = ref(true);
const allDomains = ref<MyDomain[]>([]);
const searchQuery = ref("");
const showAddModal = ref<any>(null);
const showTransferModal = ref(false);
const showTransaction = ref(false);
const selectedHandle = ref("");
const transaction = ref<TransactionResult>({ hash: zeroHash, status: false });
const currentPage = ref(1);
const itemsPerPage = ref(10);
const tlds = ref<string[]>([]);
const activeTab = ref<"domains" | "bulletin">("domains");
const tabs = [
  { id: "domains" as const, label: "My Domains" },
  { id: "bulletin" as const, label: "Bulletin Uploads" },
];
const bulletinUploads = ref<string[]>([]);
const isLoadingUploads = ref(false);
const cidCopied = ref<string | null>(null);
const bulletinPage = ref(1);
const bulletinPageSize = ref(10);
const showAddCidForm = ref(false);
const addCidInput = ref("");
const isAddingCid = ref(false);
const deletingCid = ref<string | null>(null);

const paginatedUploads = computed(() => {
  const start = (bulletinPage.value - 1) * bulletinPageSize.value;
  return bulletinUploads.value.slice(start, start + bulletinPageSize.value);
});

async function copyCid(cid: string) {
  await navigator.clipboard.writeText(cid);
  cidCopied.value = cid;
  setTimeout(() => {
    if (cidCopied.value === cid) cidCopied.value = null;
  }, 2000);
}

function isValidCid(value: string): boolean {
  return value.trim().startsWith("baf") && value.trim().length >= 46;
}

async function handleAddCid() {
  const cid = addCidInput.value.trim();
  if (!isValidCid(cid)) return;

  isAddingCid.value = true;
  try {
    await userStoreManager.writeCidToStore(cid);
    bulletinUploads.value = [cid, ...bulletinUploads.value.filter((c) => c !== cid)];
    addCidInput.value = "";
    showAddCidForm.value = false;
  } catch (error) {
    console.warn("[ProfileView] Failed to add CID:", error);
  } finally {
    isAddingCid.value = false;
  }
}

async function handleDeleteCid(cid: string) {
  deletingCid.value = cid;
  try {
    await userStoreManager.deleteCidFromStore(cid);
    bulletinUploads.value = bulletinUploads.value.filter((c) => c !== cid);
  } catch (error) {
    console.warn("[ProfileView] Failed to delete CID:", error);
  } finally {
    deletingCid.value = null;
  }
}

const router = useRouter();
const showResolveModal = ref(false);
const selectedDomain = ref("");
const resolverStore = useResolverStore();
const userStoreManager = useUserStoreManager();
const domainStore = useDomainStore();

// Header tooltip (single instance)
const {
  visible: headerTooltipVisible,
  buttonRef: headerInfoButton,
  tooltipRef: headerTooltipRef,
  style: headerTooltipStyle,
  show: showHeaderTooltip,
  hide: hideHeaderTooltip,
} = useTooltip();

// Suppress unused variable warnings for template refs
void headerInfoButton;
void headerTooltipRef;

// Row tooltips (multiple instances)
const {
  activeId: activeRowTooltip,
  setButtonRef: setRowInfoButton,
  setTooltipRef: setRowTooltipRef,
  styles: rowTooltipStyles,
  show: showRowTooltip,
  hide: hideRowTooltip,
} = useTooltipManager();

function openRecordEditor(name: string) {
  router.push(`/whois/${name}`);
}

function parseDotName(name: string): { parts: string[]; tldLabel: string } {
  const normalized = name.trim().toLowerCase();
  const withoutDot = normalized.endsWith(".dot") ? normalized.slice(0, -4) : normalized;
  const parts = withoutDot.split(".").filter(Boolean);
  const tldLabel = parts.length > 0 ? parts[parts.length - 1] : "";
  return { parts, tldLabel: tldLabel! };
}

function getDotLevel(name: string) {
  return parseDotName(name).parts.length;
}

function getType(name: string) {
  return getDotLevel(name) === 1 ? "TLD" : "Subdomain";
}

async function isCurrentUserOwner(name: string, type: "TLD" | "Subdomain"): Promise<boolean> {
  if (!wallet.evmAddress) return false;

  if (type === "Subdomain") {
    try {
      const currentOwner = await resolverStore.getOwnerOfDomain(name);
      if (!currentOwner || currentOwner === zeroAddress) return true;
      return getAddress(wallet.evmAddress) === getAddress(currentOwner);
    } catch {
      return true;
    }
  }

  try {
    const currentOwner = await resolverStore.getOwnerOfDomain(name);
    if (!currentOwner || currentOwner === zeroAddress) return false;
    return getAddress(wallet.evmAddress) === getAddress(currentOwner);
  } catch {
    return false;
  }
}

watch(
  () => wallet.isConnected,
  (v) => v && loadDomains(),
);

onBeforeMount(() => {
  if (wallet.isConnected) {
    loadDomains();
  } else {
    return router.replace("/");
  }
});

const filteredDomains = computed(() =>
  allDomains.value.filter((d) => d.name.toLowerCase().includes(searchQuery.value.toLowerCase())),
);

const paginatedDomains = computed(() =>
  filteredDomains.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value,
  ),
);

const transferableTlds = computed(() =>
  allDomains.value.filter((d) => d.type === "TLD" && d.isOwner).map((d) => d.name),
);

function openAddSubdomains() {
  if (tlds.value.length > 0) {
    authGuard.checkAuthAndProceed(() => {
      showAddModal.value = { open: true, tld: "", tlds };
    });
  }
}

function openTransferModal() {
  authGuard.checkAuthAndProceed(() => {
    showTransferModal.value = true;
  });
}

function openResolve(domain: string) {
  selectedDomain.value = domain;
  showResolveModal.value = true;
}

async function saveResolve(hash: string) {
  if (!wallet.isConnected) {
    transaction.value = { hash: zeroHash, status: false };
    showTransaction.value = true;
    return;
  }

  showResolveModal.value = false;
  showTransaction.value = true;
  transaction.value = { hash: zeroHash, status: undefined };

  try {
    const tx = await resolverStore.setContentHash(selectedDomain.value, hash);
    transaction.value = tx;
  } catch {
    transaction.value = { hash: zeroHash, status: false };
  }
}

function handleSubdomainRegistered(transactionStatus: TransactionResult) {
  transaction.value = transactionStatus;
  showAddModal.value = undefined;
  showTransaction.value = true;
  loadDomains();
}

function handleDomainTransferred() {
  loadDomains();
}

async function loadDomains() {
  isLoading.value = true;

  try {
    const names = await userStoreManager.getSubdomains();

    const results = (await Promise.all(
      names.map(async (name) => {
        try {
          const type = getType(name) as "TLD" | "Subdomain";
          const isOwner = await isCurrentUserOwner(name, type);

          if (type === "TLD" && !isOwner) return null;

          let popRequirement: NameRequirement | null = null;
          try {
            const { tldLabel } = parseDotName(name);
            if (tldLabel) popRequirement = await domainStore.classifyName(tldLabel);
          } catch (error) {
            console.warn(`Failed to fetch PoP requirement for ${name}:`, error);
          }

          return {
            name,
            type,
            isOwner,
            needsResolver: false,
            popRequirement,
            expiry: "",
            statusIcon: "check",
            statusLabel: isOwner ? "Active" : "Not Owner",
          };
        } catch (error) {
          console.warn(`Failed to process domain ${name}:`, error);
          return null;
        }
      }),
    )) as Array<(MyDomain & { popRequirement: NameRequirement | null }) | null>;

    allDomains.value = results.filter(
      (d): d is MyDomain & { popRequirement: NameRequirement | null } => d !== null,
    );

    tlds.value = allDomains.value.filter((d) => d.type === "TLD" && d.isOwner).map((d) => d.name);
  } catch (error) {
    console.warn("Failed to load domains:", error);
    allDomains.value = [];
    tlds.value = [];
  } finally {
    isLoading.value = false;
  }

  loadBulletinUploads();
}

async function loadBulletinUploads() {
  isLoadingUploads.value = true;
  try {
    bulletinUploads.value = await userStoreManager.getBulletinUploads();
  } catch {
    bulletinUploads.value = [];
  } finally {
    isLoadingUploads.value = false;
  }
}
</script>
