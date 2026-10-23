import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { Binary, createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { blake2AsHex } from "@polkadot/util-crypto";
import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import {
  getAssetHubTypedApi,
  getChainTokenInfo,
  ReviveClientWrapper,
} from "../../src/client/polkadotClient";
import { createDotnsContext, read, type DotnsContext } from "../../src/core/context";
import { createAccountFromSource, createSubstrateSigner } from "../../src/commands/auth";
import { resolveNameWhitelist } from "../../src/commands/accountChecks";
import {
  assessGrant,
  buildGrantProposal,
  estimateProposalCosts,
  findGrantReferenda,
  getReferendum,
  placeDecisionDeposit,
  readGrantEligibility,
  submitGrantReferendum,
  type GovernanceTrack,
  type GrantAction,
  type GrantProposal,
} from "../../src/commands/governance";
import {
  finalizeGovernanceRegistration,
  generateCommitment,
  submitCommitment,
} from "../../src/commands/register";
import { DOTNS_NAME_WHITELIST_ABI, DOTNS_REGISTRAR_ABI } from "../../src/utils/constants";
import { deriveDomainTokenId } from "../../src/utils/contractInteractions";
import { resolveTldInfo } from "../../src/core/naming";

const FORK_RPC = process.env.DOTNS_FORK_RPC;
const CLI_ENTRY = path.join(import.meta.dir, "../../src/cli/index.ts");
const ALICE_KEY_URI = "//Alice";
const FUNDS = 1_000_000_000_000_000_000n;
const STEP_TIMEOUT_MS = 900_000;
const CLAIMED = 2;

type WhitelistState = { status: number; grantee: Address };
type CliRun = { exitCode: number; output: string; json?: any };
type DispatchOutcome = { ok: boolean; error?: string };
type CliOptions = { jumpAfter?: string };

let raw: PolkadotClient;
let ctx: DotnsContext;
let alice: string;
let aliceEvm: Address;

function rpc(method: string, params: unknown[]): Promise<unknown> {
  return (raw as any)._request(method, params);
}

const newBlock = () => rpc("dev_newBlock", [{}]);

// Read at the best block: the fork's finalized head can lag behind the scheduler.
async function nextSchedulerBlock(): Promise<number> {
  const api: any = raw.getUnsafeApi();
  const at = { at: "best" };
  const next = await api.query.Scheduler.IncompleteSince.getValue(at);
  return Number(
    next ?? (await api.query.ParachainSystem.LastRelayChainBlockNumber.getValue(at)) + 1,
  );
}

// Enactment without the vote: the scheduler dispatches the call with the track's origin,
// as it does once a referendum passes. Voting belongs to pallet-referenda.
async function schedule(call: object, origin: object): Promise<DispatchOutcome> {
  const at = await nextSchedulerBlock();
  await rpc("dev_setStorage", [
    {
      Scheduler: {
        Agenda: [[[at], [{ maybeId: null, priority: 0, call, maybePeriodic: null, origin }]]],
      },
    },
  ]);
  // A forked chain dispatches its own scheduled tasks too, so match ours by its address.
  const api: any = raw.getUnsafeApi();
  const seen: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const hash = (await newBlock()) as string;
    const events: any[] = await api.query.System.Events.getValue({ at: hash });
    for (const e of events.filter((e) => e.event.type === "Scheduler")) {
      seen.push(JSON.stringify(e.event.value, (_, v) => (typeof v === "bigint" ? `${v}` : v)));
    }
    const ours = events
      .filter((e) => e.event.type === "Scheduler" && e.event.value.type === "Dispatched")
      .map((e) => e.event.value.value)
      .find((d) => Number(d.task[0]) === at && Number(d.task[1]) === 0);
    if (ours) {
      return ours.result.success
        ? { ok: true }
        : { ok: false, error: JSON.stringify(ours.result.value) };
    }
  }
  const since = await api.query.Scheduler.IncompleteSince.getValue();
  const relay = await api.query.ParachainSystem.LastRelayChainBlockNumber.getValue();
  return {
    ok: false,
    error: `task at ${at} never dispatched (incompleteSince ${since}, relay ${relay}): ${seen.join(" | ").slice(0, 1500)}`,
  };
}

async function dispatchOk(outcome: Promise<DispatchOutcome>): Promise<void> {
  const result = await outcome;
  if (!result.ok) throw new Error(`Scheduled call failed: ${result.error}`);
}

function enact(proposal: GrantProposal, track: GovernanceTrack): Promise<DispatchOutcome> {
  return schedule(
    { Lookup: { hash: proposal.preimageHash, len: proposal.preimageLength } },
    track === "root" ? { system: "Root" } : { Origins: "WhitelistedCaller" },
  );
}

async function asRoot(functionName: string, args: unknown[]): Promise<void> {
  const call = ctx.clientWrapper.client.tx.Revive.call({
    dest: Binary.fromHex(await resolveNameWhitelist(ctx)),
    value: 0n,
    weight_limit: { ref_time: 50_000_000_000n, proof_size: 1_048_576n },
    storage_deposit_limit: 10n ** 13n,
    data: Binary.fromHex(
      encodeFunctionData({ abi: DOTNS_NAME_WHITELIST_ABI, functionName, args }) as Hex,
    ),
  });
  // The scheduler takes inline calls of up to 128 bytes, so the call goes in as a preimage.
  const bytes = (await call.getEncodedData()).asBytes();
  await ctx.clientWrapper.submitExtrinsic(
    ctx.clientWrapper.client.tx.Preimage.note_preimage({ bytes: Binary.fromBytes(bytes) }),
    createSubstrateSigner(await createAccountFromSource(ALICE_KEY_URI, true)),
    () => {},
    alice,
  );
  await dispatchOk(
    schedule({ Lookup: { hash: blake2AsHex(bytes, 256), len: bytes.length } }, { system: "Root" }),
  );
}

async function whitelistState(label: string): Promise<WhitelistState> {
  const whitelist = await resolveNameWhitelist(ctx);
  const [status, grantee] = await Promise.all([
    read<number>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "statusOf", [label]),
    read<Address>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "granteeOf", [label]),
  ]);
  return { status: Number(status), grantee: getAddress(grantee) };
}

async function ownerOf(label: string): Promise<Address> {
  const { tldNode } = await resolveTldInfo(ctx);
  const owner = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    DOTNS_REGISTRAR_ABI,
    "ownerOf",
    [deriveDomainTokenId(tldNode, label)],
  );
  return getAddress(owner);
}

// The fork only builds blocks on demand. A slow ticker keeps the CLI's connection from
// idling out, and one block once the commitment lands moves chain time past its minimum age.
async function cli(args: string[], opts: CliOptions = {}): Promise<CliRun> {
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      CLI_ENTRY,
      ...args,
      "--env",
      "polkadot",
      "--rpc",
      FORK_RPC as string,
      "--key-uri",
      ALICE_KEY_URI,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  let output = "";
  let stdout = "";
  let running = true;
  const decoder = new TextDecoder();
  const collect = async (stream: ReadableStream<Uint8Array>, isStdout: boolean) => {
    for await (const chunk of stream) {
      const text = decoder.decode(chunk);
      output += text;
      if (isStdout) stdout += text;
    }
  };
  const ticker = (async () => {
    let jumped = false;
    let lastBlock = Date.now();
    while (running) {
      if (opts.jumpAfter && !jumped && output.includes(opts.jumpAfter)) {
        jumped = true;
        await newBlock();
        lastBlock = Date.now();
      }
      if (Date.now() - lastBlock >= 20_000) {
        await newBlock().catch(() => {});
        lastBlock = Date.now();
      }
      await Bun.sleep(2_000);
    }
  })();
  await Promise.all([collect(child.stdout, true), collect(child.stderr, false)]);
  const exitCode = await child.exited;
  running = false;
  await ticker;
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim().split("\n").pop() ?? "");
  } catch {
    json = undefined;
  }
  if (exitCode !== 0) {
    const account = await (raw.getUnsafeApi() as any).query.System.Account.getValue(alice, {
      at: "best",
    });
    console.error(output, "\nAlice at best block:", account.data);
  }
  return { exitCode, output, json };
}

async function registerWithSdk(label: string): Promise<void> {
  const { commitment, registration } = await generateCommitment(ctx, label, {
    owner: aliceEvm,
    governance: true,
  });
  await submitCommitment(ctx, commitment);
  await newBlock();
  await finalizeGovernanceRegistration(ctx, registration);
}

async function propose(label: string, track: GovernanceTrack, action: GrantAction = "grantName") {
  const proposal = await buildGrantProposal(ctx, { label, beneficiary: aliceEvm, action, track });
  const costs = await estimateProposalCosts(ctx, proposal, { reason: `e2e ${label}` });
  expect(costs.submissionError).toBeUndefined();
  const { index } = await submitGrantReferendum(ctx, proposal, {
    notePreimage: !costs.preimageNoted,
    reason: `e2e ${label}`,
  });
  await placeDecisionDeposit(ctx, index);
  return { proposal, costs, index };
}

describe.skipIf(!FORK_RPC)("governance grants on a Polkadot Asset Hub fork", () => {
  beforeAll(async () => {
    const keypair = await createAccountFromSource(ALICE_KEY_URI, true);
    alice = keypair.address;
    raw = createClient(getWsProvider(FORK_RPC as string));
    await rpc("dev_setStorage", [
      { System: { Account: [[[alice], { providers: 1, data: { free: FUNDS.toString() } }]] } },
    ]);
    raw.destroy();
  }, STEP_TIMEOUT_MS);

  // A connection that outlives many fork blocks signs against a birth block the fork
  // already treats as ancient, so each test gets its own.
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
    "a Root grant goes from proposal to registration, and a rival proposal is flagged",
    async () => {
      const dryRun = await cli(["governance", "propose", "web3", "--dry-run", "--json"]);
      expect(dryRun.exitCode).toBe(0);
      expect(dryRun.json).toMatchObject({ action: "grantName", track: "root", affordable: true });

      const first = await propose("web3", "root");
      expect(first.costs.preimageDeposit).toBeGreaterThan(0n);
      expect(await getReferendum(ctx, first.index)).toMatchObject({
        status: "Preparing",
        decisionDepositPlaced: true,
        grant: { action: "grantName", labels: ["web3"], beneficiary: aliceEvm },
      });

      const rivalDryRun = await cli(["governance", "propose", "web3", "--dry-run", "--json"]);
      expect(rivalDryRun.json.warnings.join(" ")).toContain(`Referendum #${first.index}`);
      expect(rivalDryRun.json.costs.preimageNoted).toBe(true);

      const second = await propose("web3", "root");
      expect(second.costs.preimageNoted).toBe(true);
      expect(second.costs.preimageDeposit).toBe(0n);
      expect((await findGrantReferenda(ctx, "web3")).map((r) => r.index)).toEqual([
        first.index,
        second.index,
      ]);

      const pending = await cli(["governance", "status", "web3", "--json"]);
      expect(pending.json.referenda.map((r: { index: number }) => r.index)).toEqual([
        first.index,
        second.index,
      ]);
      expect(pending.json.whitelistStatus).toBe("Open");

      await dispatchOk(enact(first.proposal, "root"));
      expect(await whitelistState("web3")).toEqual({ status: CLAIMED, grantee: aliceEvm });

      const granted = await cli(["governance", "status", "web3", "--json"]);
      expect(granted.json).toMatchObject({ whitelistStatus: "Claimed", grantee: aliceEvm });
      expect(granted.json.registered).toBe(false);

      const again = await cli(["governance", "propose", "web3", "--dry-run"]);
      expect(again.exitCode).not.toBe(0);
      expect(again.output).toContain("--governance");

      await registerWithSdk("web3");
      expect(await ownerOf("web3")).toBe(aliceEvm);
      const registered = await cli(["governance", "status", "web3", "--json"]);
      expect(registered.json.registered).toBe(true);

      await enact(second.proposal, "root");
      expect(await ownerOf("web3")).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "the CLI registers a granted six-character name",
    async () => {
      const { proposal } = await propose("parity", "root");
      await dispatchOk(enact(proposal, "root"));

      const registered = await cli(["register", "domain", "--name", "parity", "--governance"], {
        jumpAfter: "Waiting commitment age",
      });
      expect(registered.exitCode).toBe(0);
      expect(await ownerOf("parity")).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "a Whitelisted Caller grant enacts once the Fellowship has whitelisted the call",
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

      const { proposal, index } = await propose(label, "whitelisted-caller");
      expect(proposal.whitelisted).toBe(true);
      expect((await getReferendum(ctx, index))?.grant?.viaWhitelist).toBe(true);

      await dispatchOk(enact(proposal, "whitelisted-caller"));
      expect(await whitelistState(label)).toEqual({ status: CLAIMED, grantee: aliceEvm });
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "a request filed while the window is open is accepted by referendum",
    async () => {
      const label = "dotgx";
      const closed = await cli(["whitelist", "request", label, "--reason", "e2e"]);
      expect(closed.exitCode).not.toBe(0);
      expect(closed.output).toContain("isn't taking requests");

      await asRoot("setWindow", [0n, 30n * 24n * 3600n]);

      const tooLong = await cli(["whitelist", "request", label, "--reason", "x".repeat(4096)]);
      expect(tooLong.exitCode).not.toBe(0);
      expect(tooLong.output).toContain("bytes the whitelist accepts");

      const requested = await cli(["whitelist", "request", label, "--reason", "e2e", "--json"]);
      expect(requested.exitCode).toBe(0);
      expect(requested.json).toMatchObject({ ok: true, label, user: aliceEvm });

      const duplicate = await cli(["whitelist", "request", label, "--reason", "e2e"]);
      expect(duplicate.output).toContain("has already requested");

      const dryRun = await cli(["governance", "propose", label, "--dry-run", "--json"]);
      expect(dryRun.json.action).toBe("accept");

      const eligibility = await readGrantEligibility(ctx, label, aliceEvm);
      expect(assessGrant(eligibility, aliceEvm, label).action).toBe("accept");
      const { proposal } = await propose(label, "root", "accept");
      await dispatchOk(enact(proposal, "root"));
      expect(await whitelistState(label)).toEqual({ status: CLAIMED, grantee: aliceEvm });

      const claimed = await cli(["whitelist", "request", label, "--reason", "e2e"]);
      expect(claimed.output).toContain("it is Claimed on the whitelist");

      await registerWithSdk(label);
      expect(await ownerOf(label)).toBe(aliceEvm);
    },
    STEP_TIMEOUT_MS,
  );

  test(
    "a rejected request can't be filed again",
    async () => {
      const label = "dothx";
      const requested = await cli(["whitelist", "request", label, "--reason", "e2e"]);
      expect(requested.exitCode).toBe(0);

      await asRoot("reject", [label, aliceEvm]);

      const refiled = await cli(["whitelist", "request", label, "--reason", "e2e"]);
      expect(refiled.exitCode).not.toBe(0);
      expect(refiled.output).toContain("was rejected and can't be filed again");
    },
    STEP_TIMEOUT_MS,
  );
});

test.skipIf(!!FORK_RPC)("governance e2e needs DOTNS_FORK_RPC: run bun run test:e2e", () => {});
