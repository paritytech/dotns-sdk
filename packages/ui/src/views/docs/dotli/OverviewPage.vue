<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">dot.li</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">The dot.li Browser</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        <span class="text-dot-text-primary font-medium">dot.li</span> is a decentralised web browser
        that runs entirely in your browser and visits Polkadot applications with fully trustless,
        client-side resolution &mdash; no servers in the loop.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What It Is</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Rather than relying on a hosting provider to map a name to a server, dot.li reads the
        authoritative answer straight from the chain. It resolves a
        <span class="font-mono text-dot-accent">.dot</span> name to an IPFS CID using dotNS, fetches
        the corresponding content, and renders it &mdash; all on the client. Because every step runs
        in your browser, there is no trusted backend that can alter or intercept what you see.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Two URL Formats</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        dot.li recognises two ways of asking for an application. Both resolve the same name through
        the same flow.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Format</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Subdomain</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs break-all">
                name.dot.li
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Path</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs break-all">
                dot.li/name.dot
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Landing Page</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Visiting the root shows a landing page rather than an application. It centres on a
        <span class="text-dot-text-primary font-medium">search bar</span> with the
        <span class="font-mono text-dot-accent">.dot</span> suffix already pre-filled, so you only
        type the label of the application you want. Beneath it, your
        <span class="text-dot-text-primary font-medium">recently visited</span> applications appear
        as pill-shaped shortcuts for quick return. The topbar stays hidden on the landing page and
        only appears once you are viewing an application.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What It Does</h2>
      <ul class="space-y-3">
        <li class="flex items-start gap-3">
          <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-dot-accent shrink-0" />
          <p class="text-dot-text-secondary leading-relaxed">
            <span class="text-dot-text-primary font-medium">Resolves</span>
            <span class="font-mono text-dot-accent">.dot</span> names through an in-browser
            <span class="font-mono text-dot-text-primary">smoldot</span> light client connected to
            Asset Hub Paseo.
          </p>
        </li>
        <li class="flex items-start gap-3">
          <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-dot-accent shrink-0" />
          <p class="text-dot-text-secondary leading-relaxed">
            <span class="text-dot-text-primary font-medium">Fetches</span> content from the Bulletin
            Chain via the smoldot
            <span class="font-mono text-dot-text-primary">bitswap_v1_get</span> JSON-RPC method, or
            from an IPFS gateway, according to what you pick.
          </p>
        </li>
        <li class="flex items-start gap-3">
          <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-dot-accent shrink-0" />
          <p class="text-dot-text-secondary leading-relaxed">
            <span class="text-dot-text-primary font-medium">Renders</span> the content in a
            sandboxed iframe with a host-container bridge, so loaded applications can request
            accounts, sign payloads, connect to chains, and use scoped storage.
          </p>
        </li>
      </ul>
    </div>

    <DocCallout variant="info" title="No servers in the loop">
      Every step &mdash; resolution, fetching, and rendering &mdash; happens on the client. There is
      no backend that can change what an application resolves to or what content it serves.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/store"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Store &amp; StoreFactory
      </RouterLink>
      <RouterLink to="/docs/dotli/resolution" class="text-dot-accent hover:text-dot-accent-hover">
        How Resolution Works &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
</script>
