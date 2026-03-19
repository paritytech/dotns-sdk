<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Guides</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Your First Domain</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        End-to-end: wallet setup, token acquisition, name registration, and verification. The whole
        thing takes about two minutes.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What You Need</h2>
      <div class="space-y-3">
        <div
          v-for="(req, i) in prerequisites"
          :key="i"
          class="flex items-start gap-3 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <span
            class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >{{ i + 1 }}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ req.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ req.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">1. Install a Wallet</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        You need a browser extension wallet that supports Polkadot. Any of these work:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="wallet in wallets"
          :key="wallet.name"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ wallet.name }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ wallet.note }}</p>
        </div>
      </div>
      <p class="text-dot-text-secondary leading-relaxed">
        Install one, create an account, and save your seed phrase somewhere safe. The wallet gives
        you a Substrate address (starts with <code class="text-dot-accent">5</code>) and maps it to
        an EVM address automatically.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">2. Get PAS Tokens</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        DotNS is deployed on the Paseo AssetHub testnet. You need PAS tokens for gas and
        registration fees. Get them free from the Paseo faucet:
      </p>
      <DocCodeBlock
        code="# Visit the Paseo faucet and request tokens for your Substrate address
# Tokens arrive in a few seconds"
        lang="bash"
      />
      <DocCallout variant="tip" title="How much do you need?">
        Registration fees range from 0.001 to 0.012 DOT depending on name length. PoP-verified users
        pay nothing. Either way, 1 PAS is more than enough for several registrations plus gas.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">3. Connect Your Wallet</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Connect a Polkadot-compatible wallet to your chosen tool (CLI, SDK, or web interface). Your
        Substrate address is used to derive your EVM address &mdash; both are needed for interacting
        with DotNS contracts.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">4. Search for a Name</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Check your desired name's availability. The
        <RouterLink
          to="/docs/contracts/registry"
          class="text-dot-accent hover:text-dot-accent-hover"
          >Registry</RouterLink
        >
        contract determines whether a name is taken, its classification (which PoP tier it falls
        into), and the registration price.
      </p>
      <TryItSection title="Try it — Check availability now">
        <TryCheckAvailability />
      </TryItSection>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">5. Register</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Registration uses commit-reveal to prevent front-running. The process involves two
        transactions with a mandatory waiting period between them:
      </p>
      <div class="space-y-2">
        <div
          v-for="(step, i) in registrationSteps"
          :key="i"
          class="flex items-start gap-4 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div
            class="w-8 h-8 rounded-lg bg-dot-surface-secondary text-dot-text-primary flex items-center justify-center text-sm font-bold shrink-0"
          >
            {{ i + 1 }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ step.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ step.description }}</p>
          </div>
        </div>
      </div>
      <DocCallout variant="info" title="Commit-reveal">
        The
        <RouterLink
          to="/docs/contracts/controller"
          class="text-dot-accent hover:text-dot-accent-hover"
          ><code>minCommitmentAge</code></RouterLink
        >
        wait (currently 6 seconds on Paseo) between commit and register exists so that validators
        cannot see your desired name in the mempool and front-run you. Your client must wait for the
        commitment to mature before submitting the reveal transaction.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">6. Verify</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        After registration completes, verify that your name is correctly registered:
      </p>
      <DocCodeBlock :code="verifyCode" lang="bash" filename="Verify via CLI" />
      <p class="text-dot-text-secondary leading-relaxed">
        The lookup returns the owner address, content hash, store address, and PoP status. If the
        owner matches your address, you are done.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What Next?</h2>
      <div class="space-y-2">
        <div class="flex items-start gap-3">
          <span class="text-dot-accent mt-0.5">&rarr;</span>
          <p class="text-sm text-dot-text-secondary">
            <RouterLink
              to="/docs/guides/set-up-profile"
              class="text-dot-accent hover:text-dot-accent-hover"
              >Set up your profile</RouterLink
            >
            &mdash; add text records (twitter, github, website) and enable reverse resolution
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-dot-accent mt-0.5">&rarr;</span>
          <p class="text-sm text-dot-text-secondary">
            <RouterLink
              to="/docs/guides/host-a-website"
              class="text-dot-accent hover:text-dot-accent-hover"
              >Host a website</RouterLink
            >
            &mdash; upload to IPFS/Bulletin and serve content at yourname.dot
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-dot-accent mt-0.5">&rarr;</span>
          <p class="text-sm text-dot-text-secondary">
            <RouterLink
              to="/docs/guides/create-subdomains"
              class="text-dot-accent hover:text-dot-accent-hover"
              >Create subdomains</RouterLink
            >
            &mdash; organise with blog.yourname.dot, app.yourname.dot
          </p>
        </div>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/portfolio-site"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Portfolio Site
      </RouterLink>
      <RouterLink
        to="/docs/guides/set-up-profile"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Set Up Your Profile &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryCheckAvailability from "@/components/docs/interactive/TryCheckAvailability.vue";

const prerequisites = [
  {
    title: "A Polkadot wallet",
    description:
      "Browser extension: Talisman, SubWallet, or Polkadot.js. Any wallet that exposes a Substrate account works.",
  },
  {
    title: "PAS tokens",
    description:
      "Free from the Paseo faucet. You need a small amount for gas and possibly a registration fee.",
  },
];

const wallets = [
  { name: "Talisman", note: "Full-featured, good UX" },
  { name: "SubWallet", note: "Multi-chain, mobile + extension" },
  { name: "Polkadot.js", note: "Official, developer-oriented" },
];

const registrationSteps = [
  {
    title: "Commit",
    description:
      "A secret is generated, hashed with your name and address, and submitted on-chain. This is transaction 1.",
  },
  {
    title: "Wait",
    description:
      "A 6-second countdown (minCommitmentAge on Paseo). The commitment must mature before you can register.",
  },
  {
    title: "Register",
    description:
      "Your name is revealed and registration is completed. This is transaction 2. If there is a fee, it is included in msg.value.",
  },
];

const verifyCode = `dotns lookup name yourname
# Returns: owner, content hash, store address, PoP status`;
</script>
