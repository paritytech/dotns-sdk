<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Registration</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS uses a <span class="text-dot-text-primary font-medium">commit-reveal</span> pattern to
        prevent front-running. Registration happens in two transactions separated by a mandatory
        waiting period.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why Commit-Reveal?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Without commit-reveal, a malicious validator or MEV bot could see your pending registration
        transaction in the mempool and front-run it, stealing your desired name. The two-step
        process means that by the time the name is revealed, you already have a timestamped
        commitment on-chain that proves priority.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registration Steps</h2>
      <div class="space-y-3">
        <div
          v-for="(step, i) in steps"
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
            <DocCodeBlock v-if="step.code" :code="step.code" lang="solidity" class="mt-2" />
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registration Sequence</h2>
      <p class="text-dot-text-secondary text-sm leading-relaxed">
        The full registration flow across all contracts. Each arrow represents an on-chain call or
        return value.
      </p>
      <DocDiagramImage
        src="/diagrams/registration.png"
        alt="Registration sequence diagram showing commit-reveal flow across Controller, PopRules, Registrar, Registry, and Store contracts"
        caption="Registration Sequence"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Making a Commitment</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">makeCommitment</span> function is a
        <span class="font-mono text-dot-text-primary">pure</span> function that generates a hash
        from the registration parameters. It does not write to storage and can be called off-chain.
      </p>
      <DocCodeBlock
        :code="makeCommitmentCode"
        lang="solidity"
        filename="DotnsRegistrarController.sol"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Committing</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">commit</span> function stores the commitment
        hash along with the current block timestamp. This establishes your priority claim to the
        name.
      </p>
      <DocCodeBlock :code="commitCode" lang="solidity" filename="commit" />
    </div>

    <DocCallout variant="warning" title="Minimum commitment age">
      On Paseo, the minimum commitment age is <strong>6 seconds</strong> (approximately 1 block).
      You must wait at least this long between committing and registering. Your client should poll
      or wait before submitting the register transaction.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registering</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">register</span> function reveals the name and
        completes registration. It requires
        <span class="font-mono text-dot-text-primary">msg.value &gt;= price</span>, where the price
        is determined by
        <RouterLink
          to="/docs/contracts/pop-rules"
          class="text-dot-accent hover:text-dot-accent-hover"
          >PopRules</RouterLink
        >
        based on the name's classification and your PoP status.
      </p>
      <DocCodeBlock :code="registerCode" lang="solidity" filename="register" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registration Struct</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">register</span> function takes a
        <span class="font-mono text-dot-text-primary">Registration</span> struct containing all
        parameters needed to complete the registration:
      </p>
      <DocCodeBlock :code="registrationStructCode" lang="solidity" filename="Registration struct" />
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/getting-started" class="text-dot-accent hover:text-dot-accent-hover">
        Check name availability &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Reserved Names</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Some names are classified as <span class="text-dot-text-primary font-medium">Reserved</span>
        by
        <RouterLink
          to="/docs/contracts/pop-rules"
          class="text-dot-accent hover:text-dot-accent-hover"
          >PopRules</RouterLink
        >
        (typically names with a base length of 5 or fewer characters). These names cannot be
        registered through the normal commit-reveal flow. Instead, they use a governance path via
        <span class="font-mono text-dot-accent">registerReserved</span>, which requires the caller
        to be <span class="text-dot-text-primary font-medium">whitelisted</span> on the Controller
        contract.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        The whitelist ensures that reserved names are allocated through a governance process. Only
        addresses explicitly approved by the protocol can register reserved names. Whitelisted
        addresses bypass pricing and Proof of Personhood checks, since they have already been
        verified through governance.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        To check whether your address is whitelisted, use the CLI:
      </p>
      <DocCodeBlock
        :code="`# Check whitelist status\ndotns account is-whitelisted <your-address>`"
        lang="bash"
      />
      <DocCallout variant="info" title="Request whitelisting">
        To register a reserved name, you need to submit a whitelist request through the DotNS
        governance process. Open a
        <a
          href="https://github.com/paritytech/dotns/issues/new?template=WHITELIST_REQUEST.yml"
          target="_blank"
          rel="noopener noreferrer"
          class="text-dot-accent hover:text-dot-accent-hover underline"
          >Whitelist Request</a
        >
        on GitHub with your address and use case. Once approved, the protocol will whitelist your
        address and you can register the reserved name via
        <span class="font-mono">registerReserved</span>.
      </DocCallout>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/naming"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; The .dot Namespace
      </RouterLink>
      <RouterLink
        to="/docs/protocol/resolution"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Resolution &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import DocDiagramImage from "@/components/docs/DocDiagramImage.vue";

const steps = [
  {
    title: "Generate commitment (off-chain)",
    description:
      "Call makeCommitment — a pure function that hashes your label, owner, secret, and reserved flag into a commitment hash. No transaction needed.",
    code: `bytes32 commitment = controller.makeCommitment(label, owner, secret, reserved);`,
  },
  {
    title: "Submit commitment (transaction 1)",
    description:
      "Call commit(commitment) to store the hash and timestamp on-chain. This establishes your priority without revealing the name.",
    code: `controller.commit(commitment);`,
  },
  {
    title: "Wait for commitment to mature",
    description:
      "Wait at least minCommitmentAge (6 seconds on Paseo). The commitment must be old enough to prove it was not a reaction to another transaction.",
    code: null,
  },
  {
    title: "Register the name (transaction 2)",
    description:
      "Call register(registration) with msg.value >= price. The controller verifies the commitment, checks pricing via PopRules, mints the NFT, and sets up the Registry.",
    code: `controller.register{value: price}(registration);`,
  },
];

const makeCommitmentCode = `function makeCommitment(
    string calldata label,
    address owner,
    bytes32 secret,
    bool reserved
) external pure returns (bytes32) {
    // Returns keccak256(abi.encodePacked(label, owner, secret, reserved))
}`;

const commitCode = `function commit(bytes32 commitment) external {
    // Stores: commitments[commitment] = block.timestamp
}`;

const registerCode = `function register(Registration calldata registration) external payable {
    // 1. Verify commitment exists and has matured
    // 2. Check price via PopRules
    // 3. Require msg.value >= price
    // 4. Mint ERC721 via Registrar
    // 5. Set owner + resolver in Registry
    // 6. Write registration record to Store
}`;

const registrationStructCode = `struct Registration {
    string label;       // The name to register (e.g. "alice")
    address owner;      // Who will own the name
    bytes32 secret;     // Same secret used in makeCommitment
    bool reserved;      // Whether this is a reserved registration
}`;
</script>
