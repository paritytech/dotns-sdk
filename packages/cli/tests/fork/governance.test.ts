import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { getAddress, type Address } from "viem";
import {
  getAssetHubTypedApi,
  getChainTokenInfo,
  ReviveClientWrapper,
} from "../../src/client/polkadotClient";
import { createDotnsContext, read, type DotnsContext } from "../../src/core/context";
import { createAccountFromSource, createSubstrateSigner } from "../../src/commands/auth";
import { resolveNameWhitelist } from "../../src/commands/accountChecks";
import {
  buildGrantProposal,
  estimateProposalCosts,
  getReferendum,
  placeDecisionDeposit,
  submitGrantReferendum,
  type GovernanceTrack,
  type GrantProposal,
} from "../../src/commands/governance";
import { DOTNS_NAME_WHITELIST_ABI, DOTNS_REGISTRAR_ABI } from "../../src/utils/constants";
import { deriveDomainTokenId } from "../../src/utils/contractInteractions";
import { resolveTldInfo } from "../../src/core/naming";

// Runs against a Chopsticks fork of Polkadot Asset Hub, started by `bun run test:fork`.
const FORK_RPC = process.env.DOTNS_FORK_RPC;
const CLI_ENTRY = path.join(import.meta.dir, "../../src/cli/index.ts");
const ALICE_KEY_URI = "//Alice";
const FUNDS = 1_000_000_000_000_000_000n;
const STEP_TIMEOUT_MS = 600_000;

type WhitelistState = { status: number; grantee: Address };
type CliRun = { exitCode: number; output: string };

let raw: PolkadotClient;
let ctx: DotnsContext;
let alice: string;
let aliceEvm: Address;

function rpc(method: string, params: unknown[]): Promise<unknown> {
  return (raw as any)._request(method, params);
}

const newBlock = () => rpc("dev_newBlock", [{}]);

async function nextSchedulerBlock(): Promise<number> {
  const api: any = raw.getUnsafeApi();
  const next = await api.query.Scheduler.IncompleteSince.getValue();
  return Number(next ?? (await api.query.ParachainSystem.LastRelayChainBlockNumber.getValue()) + 1);
}

// Does what enactment does once a referendum passes: the scheduler dispatches the
// proposal's preimage with the track's origin. The vote itself belongs to pallet-referenda.
async function enact(proposal: GrantProposal, track: GovernanceTrack): Promise<void> {
  const origin = track === "root" ? { system: "Root" } : { Origins: "WhitelistedCaller" };
  await rpc("dev_setStorage", [
    {
      Scheduler: {
        Agenda: [
          [
            [await nextSchedulerBlock()],
            [
              {
                maybeId: null,
                priority: 0,
                call: { Lookup: { hash: proposal.preimageHash, len: proposal.preimageLength } },
                maybePeriodic: null,
                origin,
              },
            ],
          ],
        ],
      },
    },
  ]);
  await newBlock();
}

async function whitelistState(label: string): Promise<WhitelistState> {
  const whitelist = await resolveNameWhitelist(ctx);
  const [status, grantee] = await Promise.all([
    read<number>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "statusOf", [label]),
    read<Address>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "granteeOf", [label]),
  ]);
  return { status: Number(status), grantee };
}

async function ownerOf(label: string): Promise<Address> {
  const { tldNode } = await resolveTldInfo(ctx);
  return read<Address>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "ownerOf", [
    deriveDomainTokenId(tldNode, label),
  ]);
}

// The commit-reveal wait reads chain time, and a fork only makes blocks on demand.
async function registerWithCli(label: string): Promise<CliRun> {
  const ticker = setInterval(() => void newBlock().catch(() => {}), 2_000);
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        CLI_ENTRY,
        "register",
        "domain",
        "--name",
        label,
        "--governance",
        "--env",
        "polkadot",
        "--rpc",
        FORK_RPC as string,
        "--key-uri",
        ALICE_KEY_URI,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) console.error(stdout + stderr);
    return { exitCode, output: stdout + stderr };
  } finally {
    clearInterval(ticker);
  }
}

async function proposeAndSubmit(label: string, track: GovernanceTrack) {
  const proposal = await buildGrantProposal(ctx, {
    label,
    beneficiary: aliceEvm,
    action: "grantName",
    track,
  });
  const costs = await estimateProposalCosts(ctx, proposal, { reason: `fork test ${label}` });
  expect(costs.submissionError).toBeUndefined();
  expect(costs.preimageDeposit).toBeGreaterThan(0n);

  const { index } = await submitGrantReferendum(ctx, proposal, {
    notePreimage: !costs.preimageNoted,
    reason: `fork test ${label}`,
  });
  await placeDecisionDeposit(ctx, index);
  return { proposal, index };
}

describe.skipIf(!FORK_RPC)("governance grant on a Polkadot Asset Hub fork", () => {
  beforeAll(async () => {
    const keypair = await createAccountFromSource(ALICE_KEY_URI, true);
    alice = keypair.address;
    raw = createClient(getWsProvider(FORK_RPC as string));
    await rpc("dev_setStorage", [
      { System: { Account: [[[alice], { providers: 1, data: { free: FUNDS.toString() } }]] } },
    ]);
    raw.destroy();
  }, STEP_TIMEOUT_MS);

  // A fresh connection per test: blocks made while the CLI waits out the commitment age
  // leave an older client signing against a birth block the fork considers ancient.
  beforeEach(async () => {
    raw = createClient(getWsProvider(FORK_RPC as string));
    const keypair = await createAccountFromSource(ALICE_KEY_URI, true);
    const clientWrapper = new ReviveClientWrapper(
      getAssetHubTypedApi(raw, "polkadot"),
      await getChainTokenInfo(raw),
    );
    const signer = createSubstrateSigner(keypair);
    await clientWrapper.ensureAccountMapped(alice, signer);
    ctx = createDotnsContext({ clientWrapper, origin: alice, signer, environment: "polkadot" });
    aliceEvm = getAddress(await clientWrapper.resolveOwnEvmAddress(alice));
  }, STEP_TIMEOUT_MS);

  afterEach(() => raw?.destroy());

  test(
    "a Root referendum for web3 submits, enacts the grant and lets the grantee register",
    async () => {
      const { proposal, index } = await proposeAndSubmit("web3", "root");

      const referendum = await getReferendum(ctx, index);
      expect(referendum?.status).toBe("Preparing");
      expect(referendum?.decisionDepositPlaced).toBe(true);
      expect(referendum?.grant).toEqual({
        action: "grantName",
        labels: ["web3"],
        beneficiary: aliceEvm,
        viaWhitelist: false,
      });

      await enact(proposal, "root");
      const granted = await whitelistState("web3");
      expect(granted.status).toBe(2);
      expect(granted.grantee).toBe(aliceEvm);

      const registered = await registerWithCli("web3");
      expect(registered.output).toContain("Operation Complete");
      expect(registered.exitCode).toBe(0);
      expect(await ownerOf("web3")).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "a granted six-character name registers through register --governance",
    async () => {
      const { proposal } = await proposeAndSubmit("parity", "root");
      await enact(proposal, "root");
      expect((await whitelistState("parity")).grantee).toBe(aliceEvm);

      const registered = await registerWithCli("parity");
      expect(registered.exitCode).toBe(0);
      expect(await ownerOf("parity")).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "a Whitelisted Caller referendum enacts once the Fellowship has whitelisted the call",
    async () => {
      const label = "dotfx";
      const before = await buildGrantProposal(ctx, {
        label,
        beneficiary: aliceEvm,
        action: "grantName",
        track: "whitelisted-caller",
      });
      expect(before.whitelisted).toBe(false);

      await rpc("dev_setStorage", [
        { Whitelist: { WhitelistedCall: [[[before.whitelistCallHash], []]] } },
      ]);
      await newBlock();

      const { proposal, index } = await proposeAndSubmit(label, "whitelisted-caller");
      expect(proposal.whitelisted).toBe(true);
      expect((await getReferendum(ctx, index))?.grant?.viaWhitelist).toBe(true);

      await enact(proposal, "whitelisted-caller");
      expect((await whitelistState(label)).grantee).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );
});

test.skipIf(!!FORK_RPC)(
  "fork tests need DOTNS_FORK_RPC; run them with bun run test:fork",
  () => {},
);
