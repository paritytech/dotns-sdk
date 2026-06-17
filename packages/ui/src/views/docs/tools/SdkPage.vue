<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Tools</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">SDK</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The same operations the CLI runs are exported as reusable functions from
        <code>@parity/dotns-cli/core</code>. Build a context with your own signer and call the typed
        operations directly &mdash; no raw contract calls, ABIs, or calldata to assemble.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Create a context</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every operation takes a <code>DotnsContext</code>: a chain client, your SS58 origin, and a
        <code>PolkadotSigner</code> you supply (keyring, browser extension, hardware, or a QR-paired
        mobile wallet). Reads work without a signer; writes require one.
      </p>
      <DocCodeBlock :code="setupCode" lang="typescript" />
      <DocCallout variant="info" title="Where do ABIs and addresses come from?">
        You never pass an ABI or address. Core exports <code>DOTNS_ENVIRONMENTS</code> (whose
        <code>contracts</code> hold the per-network addresses) and bakes the right ABI in for the
        environment you select. There is no raw-contract escape hatch by design.
      </DocCallout>
      <DocCallout variant="warning" title="Origin must be address-mapped">
        <code>createDotnsContext</code> rejects an EVM (H160) origin, and writes without a signer
        throw <code>MissingSignerError</code>. A fresh account must be Revive address-mapped (<code
          >dotns account map</code
        >) before <code>registerName</code>/<code>transferName</code>, which derive the owner from
        your mapped EVM address.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Happy paths</h2>
      <p class="text-dot-text-secondary leading-relaxed">Register, resolve, and transfer names:</p>
      <DocCodeBlock :code="cookbookCode" lang="typescript" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Sign with a mobile wallet (QR)</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The CLI can pair a Polkadot mobile wallet over a QR code instead of a local key &mdash; run
        any command with <code>--signer qr</code> (or <code>DOTNS_SIGNER=qr</code>). It prints a QR,
        you scan it with the app, and every transaction is approved on your phone. SDK consumers can
        do the same pairing themselves and feed the resulting signer into
        <code>createDotnsContext</code>:
      </p>
      <DocCodeBlock :code="qrCode" lang="typescript" />
      <DocCallout variant="info" title="Requirements">
        QR pairing is a CLI/host signer mechanism (core ships no QR signer). Node consumers need
        Node&nbsp;&ge;&nbsp;21 (global <code>WebSocket</code>); Bun works as-is. The paired session
        is a complete <code>PolkadotSigner</code> (transaction and message signing).
      </DocCallout>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const setupCode = `import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { createDotnsContext, ReviveClientWrapper } from "@parity/dotns-cli/core";

const client = createClient(getWsProvider("wss://paseo-asset-hub-next-rpc.polkadot.io"));
const clientWrapper = new ReviveClientWrapper(client.getTypedApi(paseo));

const ctx = createDotnsContext({
  clientWrapper,
  origin,  // your SS58 address
  signer,  // your PolkadotSigner
  environment: "paseo-v2",
});`;

const cookbookCode = `import {
  registerName,
  registerSubnode,
  setContentHash,
  getContentHash,
  resolveTransferRecipient,
  transferName,
} from "@parity/dotns-cli/core";

// Register a name (owner defaults to your mapped EVM address)
await registerName(ctx, "alice");

// Register a subname: alice.bob.dot, owned by ownerAddress
await registerSubnode(ctx, "alice", "bob", ownerAddress);

// Set and read a content hash
await setContentHash(ctx, "alice.dot", "bafy...cid");
const { cid } = await getContentHash(ctx, "alice.dot");

// Transfer a name (recipient may be an EVM address, SS58, or a .dot label)
const recipient = await resolveTransferRecipient(ctx, "bob.dot");
await transferName(ctx, "alice", recipient);`;

const qrCode = `import {
  createTerminalAdapter,
  renderQrCode,
  waitForSessions,
  createSessionSigner,
} from "@parity/product-sdk-terminal";
import { encodeAddress } from "@polkadot/util-crypto";

const adapter = createTerminalAdapter({ appId: "my-app" });
adapter.sso.pairingStatus.subscribe(async (s) => {
  if (s.step === "pairing") console.log(await renderQrCode(s.payload));
});
await adapter.sso.authenticate();

const [session] = await waitForSessions(adapter, 60_000);
const signer = createSessionSigner(session, adapter);
const origin = encodeAddress(signer.publicKey, 42);

const ctx = createDotnsContext({ clientWrapper, origin, signer });`;
</script>
