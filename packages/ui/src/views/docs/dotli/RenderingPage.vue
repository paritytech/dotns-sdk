<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">dot.li</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Rendering and Verification</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Once a name resolves to a CID, dot.li fetches the content and renders it in an isolated,
        sandboxed environment. A two-build architecture, a Service Worker file system, a
        host-container bridge, and a layered cache work together to make this fast, safe, and
        verifiable.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Two-Build, CID-Subdomain Architecture
      </h2>
      <p class="text-dot-text-secondary leading-relaxed">
        dot.li separates the host shell from the application content across two builds served on
        different subdomains.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Subdomain</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Role</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">What it does</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs break-all">
                name.dot.li
              </td>
              <td class="px-4 py-3 text-dot-text-primary">Host shell</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Resolves the name to a CID, then iframes the CID subdomain.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs break-all">
                cid.app.dot.li
              </td>
              <td class="px-4 py-3 text-dot-text-primary">App content</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Reads the CID from its subdomain, fetches the content, and renders it.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-dot-text-secondary leading-relaxed">
        Each CID subdomain is a
        <span class="text-dot-text-primary font-medium">distinct origin</span>, so the browser
        isolates the Service Worker, storage, and security context of one application from every
        other one.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Single-File Apps and Multi-File SPAs
      </h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A single-file application is served directly as a
        <span class="font-mono text-dot-text-primary">blob URL</span>. A multi-file single-page
        application is delivered as a
        <span class="text-dot-text-primary font-medium">CAR archive</span>
        (Content Addressable aRchive), which dot.li parses into a file map. That map is handed to a
        <span class="text-dot-text-primary font-medium">Service Worker</span> that acts as a virtual
        file system: it intercepts every request the iframe makes and serves the matching file from
        the archive, so relative imports such as scripts and stylesheets resolve without any network
        round-trip.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Host-Container Bridge</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Sandboxed applications talk to dot.li through a
        <span class="font-mono text-dot-text-primary">postMessage</span>-based host-container
        bridge. Through it, an application can request accounts, ask the host to sign payloads,
        connect to supported chains, and read and write scoped storage that is partitioned per
        <span class="font-mono text-dot-accent">.dot</span> domain. The application never touches
        these capabilities directly &mdash; every request crosses the bridge, which keeps the
        sandbox boundary intact.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Two-Layer Cache</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        dot.li keeps two caches to make repeat visits fast. A
        <span class="text-dot-text-primary font-medium">CID cache</span> in IndexedDB maps each
        <span class="font-mono text-dot-accent">.dot</span> label to its last-known CID, and an
        <span class="text-dot-text-primary font-medium">archive cache</span> in the Service Worker
        stores fetched file maps. On a repeat visit the content renders instantly from cache while
        smoldot validates the CID against the chain in the background.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Verification Shield</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The topbar shows a shield whose colour reflects the verification state of what you are
        currently viewing.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Shield</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Yellow</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Validating &mdash; rendering from cache while checking on-chain.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Green</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Verified &mdash; the on-chain CID matches the cached version.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Orange</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Gateway &mdash; resolved via a gateway, awaiting chain confirmation.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Red</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Outdated &mdash; the on-chain CID differs and an update banner appears.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <DocCallout variant="tip" title="Instant, then verified">
      Rendering from cache means an application appears immediately, and the shield turns green once
      smoldot confirms the cached CID still matches the chain. If the on-chain CID has changed, the
      shield turns red so you know to reload the latest version.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dotli/resolution"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; How Resolution Works
      </RouterLink>
      <RouterLink to="/docs/dotli/publishing" class="text-dot-accent hover:text-dot-accent-hover">
        Publishing for dot.li &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
</script>
