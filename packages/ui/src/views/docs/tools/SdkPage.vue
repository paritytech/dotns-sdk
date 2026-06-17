<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Tools</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">SDK</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The operations the CLI runs are exported from <code>@parity/dotns-cli/core</code> as typed
        functions. Supply your own signer; the SDK manages ABIs and contract addresses.
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
        You do not pass an ABI or address. Core exports <code>DOTNS_ENVIRONMENTS</code>, whose
        <code>contracts</code> hold the per-network addresses, and selects the matching ABI for the
        chosen environment. There is no raw-contract path.
      </DocCallout>
      <DocCallout variant="warning" title="Origin must be address-mapped">
        <code>createDotnsContext</code> rejects an EVM (H160) origin. Writes without a signer throw
        <code>MissingSignerError</code>. A fresh account must be Revive address-mapped (<code
          >dotns account map</code
        >) before <code>registerName</code>/<code>transferName</code>, which derive the owner from
        the mapped EVM address.
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
        Pair a mobile wallet over a QR code and supply the resulting signer to
        <code>createDotnsContext</code>. The dotns CLI does this for <code>--signer qr</code>; SDK
        consumers can pair directly:
      </p>
      <DocCodeBlock :code="qrCode" lang="typescript" />
      <DocCallout variant="info" title="Requirements">
        Core ships no QR signer; this is a CLI/host mechanism. Node requires Node&nbsp;&ge;&nbsp;21
        for a global <code>WebSocket</code>; Bun works without setup. The paired session implements
        <code>PolkadotSigner</code>.
      </DocCallout>
      <DocCallout variant="warning" title="Relay network must match the wallet">
        Pairing happens on a People-chain relay, so the host and wallet must use the same network or
        pairing fails. The endpoint is set on <code>createTerminalAdapter</code>. The dotns CLI
        exposes it as <code>--qr-people-rpc</code>
        (<code>paseo</code>/<code>preview</code>/<code>stable</code>). The signer is experimental.
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

// endpoints must be the People chain the wallet is on, or pairing never lands.
const adapter = createTerminalAdapter({
  appId: "my-app",
  endpoints: ["wss://paseo-people-next-system-rpc.polkadot.io"],
});
adapter.sso.pairingStatus.subscribe(async (status) => {
  if (status.step === "pairing") console.log(await renderQrCode(status.payload));
});
await adapter.sso.authenticate();

const [session] = await waitForSessions(adapter, 60_000);
const signer = createSessionSigner(session, adapter);
const origin = encodeAddress(signer.publicKey, 42);

const ctx = createDotnsContext({ clientWrapper, origin, signer });`;
</script>
