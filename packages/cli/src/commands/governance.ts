import { Binary, Enum, type TxCallData } from "polkadot-api";
import { blake2AsHex } from "@polkadot/util-crypto";
import { decodeFunctionData, encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read, requireSigner, write } from "../core/context";
import { normaliseName } from "../core/naming";
import {
  computeStorageDepositLimit,
  convertToHexString,
  isSameSubstrateAccount,
  type PolkadotApiClient,
} from "../client/polkadotClient";
import {
  DOTNS_NAME_WHITELIST_ABI,
  DOTNS_REGISTRAR_CONTROLLER_ABI,
  POP_RULES_ABI,
} from "../utils/constants";
import { formatDispatchError } from "../utils/formatting";
import { baseLabelOf, isPersonhoodLabel, validateGrantedLabel } from "../utils/validation";
import { NAME_GRANT_STATUS, resolveNameWhitelist } from "./accountChecks";

export const GOVERNANCE_TRACKS = ["root", "whitelisted-caller"] as const;
export type GovernanceTrack = (typeof GOVERNANCE_TRACKS)[number];

const TRACK_RUNTIME_NAMES: Record<GovernanceTrack, string> = {
  root: "root",
  "whitelisted-caller": "whitelisted_caller",
};

// Asset Hub's referenda count time in relay-chain blocks.
export const RELAY_BLOCK_SECONDS = 6;

const DRY_RUN_XCM_VERSION = 5;

// Fixed rather than measured, so the call still fits if its proof grows before enactment.
// A grant uses about 2e9 ref_time and 230 KB of proof; this stays well within a block.
const GRANT_WEIGHT_LIMIT = { ref_time: 50_000_000_000n, proof_size: 1_048_576n };

const OPEN_BASE_LENGTH = 9;
const PERSONHOOD_MIN_BASE_LENGTH = 6;

export type GrantAction = "grantName" | "accept";

export type Weight = { ref_time: bigint; proof_size: bigint };

export type GrantProposalParams = {
  label: string;
  beneficiary: Address;
  action: GrantAction;
  track: GovernanceTrack;
};

export type SubmissionOptions = { notePreimage: boolean; reason?: string };

export type CostOptions = { reason?: string };

export type TransactionResult = { txHash: Hex };

export type SubmittedReferendum = TransactionResult & { index: number };

export type GovernanceClock = {
  now: number;
  undecidingTimeout: number;
  decisionPeriods: Map<number, number>;
};

type ClaimRecord = { status: number };

type ReferendumInfo = NonNullable<
  Awaited<ReturnType<PolkadotApiClient["query"]["Referenda"]["ReferendumInfoFor"]["getValue"]>>
>;
type OngoingReferendum = Extract<ReferendumInfo, { type: "Ongoing" }>["value"];

type DryRunParams = Parameters<PolkadotApiClient["apis"]["DryRunApi"]["dry_run_call"]>;
type OriginCaller = DryRunParams[0];
type RuntimeCall = DryRunParams[1];

export type ProposalCall = {
  decodedCall: RuntimeCall;
  getEncodedData: () => Promise<Binary>;
};

type ModuleError = { type?: string; value?: { type?: string; value?: { type?: string } } };

export const CLAIM_STATUS = ["None", "Requested", "Rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUS)[number];

export type TrackInfo = {
  track: GovernanceTrack;
  id: number;
  decisionDeposit: bigint;
  preparePeriod: number;
  decisionPeriod: number;
  confirmPeriod: number;
  minEnactmentPeriod: number;
};

export type DryRunOutcome =
  | { ok: true; events: any[] }
  | { ok: false; error: string; rawError?: unknown };

export type GrantProposal = {
  track: TrackInfo;
  whitelist: Address;
  action: GrantAction;
  label: string;
  beneficiary: Address;
  calldata: Hex;
  proposal: ProposalCall;
  proposalBytes: Uint8Array;
  preimageHash: Hex;
  preimageLength: number;
  whitelistCallHash?: Hex;
  whitelisted?: boolean;
};

export type ProposalCosts = {
  submissionDeposit: bigint;
  /** Null when the signer can't afford it, since it is priced by a dry run from their account. */
  preimageDeposit: bigint | null;
  preimageNoted: boolean;
  decisionDeposit: bigint;
  fees: bigint;
  decisionDepositFee: bigint;
  existentialDeposit: bigint;
  freeBalance: bigint;
  undecidingTimeout: number;
  submissionError?: string;
};

export type GrantEligibility = {
  label: string;
  baseLength: number;
  available: boolean;
  shortNamesEnabled: boolean;
  whitelistStatus: string;
  grantee: Address;
  beneficiaryClaim: ClaimStatus;
  claimantCount: number;
  popReservation: { owner: Address; expiresAt: bigint } | null;
};

export type GrantAssessment = {
  blocker?: string;
  action: GrantAction;
  warnings: string[];
};

export type GrantCallMatch = {
  action: "grantName" | "accept" | "grantNames";
  labels: string[];
  beneficiary: Address;
};

export type ReferendumStatus =
  | "Preparing"
  | "Deciding"
  | "Confirming"
  | "Approved"
  | "Rejected"
  | "Cancelled"
  | "TimedOut"
  | "Killed";

export type ReferendumSummary = {
  index: number;
  status: ReferendumStatus;
  trackId?: number;
  submittedAt?: number;
  decisionDepositPlaced?: boolean;
  decidingSince?: number;
  confirmingUntil?: number;
  ayes?: bigint;
  nays?: bigint;
  concludedAt?: number;
  grant?: GrantCallMatch & { viaWhitelist: boolean };
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function api(ctx: DotnsContext): PolkadotApiClient {
  return ctx.clientWrapper.client;
}

function rootOrigin(): OriginCaller {
  return Enum("system", Enum("Root"));
}

function proposalOrigin(track: GovernanceTrack): OriginCaller {
  return track === "root" ? rootOrigin() : Enum("Origins", Enum("WhitelistedCaller"));
}

export function trackRuntimeName(name: unknown): string {
  const text =
    typeof name === "string"
      ? name
      : typeof (name as any)?.asText === "function"
        ? (name as any).asText()
        : String(name);
  return text.replace(/\0+$/, "").trim();
}

export async function readTrack(ctx: DotnsContext, track: GovernanceTrack): Promise<TrackInfo> {
  const tracks = await readTracks(ctx);
  const found = tracks.find((info) => info.track === track);
  if (!found) {
    throw new Error(`This network has no ${TRACK_RUNTIME_NAMES[track]} referendum track.`);
  }
  return found;
}

async function readTracks(ctx: DotnsContext): Promise<TrackInfo[]> {
  const raw = await api(ctx).constants.Referenda.Tracks();
  const result: TrackInfo[] = [];
  for (const [id, info] of raw) {
    const runtimeName = trackRuntimeName(info.name);
    const track = GOVERNANCE_TRACKS.find((t) => TRACK_RUNTIME_NAMES[t] === runtimeName);
    if (!track) continue;
    result.push({
      track,
      id: Number(id),
      decisionDeposit: BigInt(info.decision_deposit),
      preparePeriod: Number(info.prepare_period),
      decisionPeriod: Number(info.decision_period),
      confirmPeriod: Number(info.confirm_period),
      minEnactmentPeriod: Number(info.min_enactment_period),
    });
  }
  return result;
}

async function readDecisionPeriods(ctx: DotnsContext): Promise<Map<number, number>> {
  const raw = await api(ctx).constants.Referenda.Tracks();
  return new Map(raw.map(([id, info]) => [Number(id), Number(info.decision_period)]));
}

export function encodeGrantCalldata(action: GrantAction, label: string, beneficiary: Address): Hex {
  return encodeFunctionData({
    abi: DOTNS_NAME_WHITELIST_ABI,
    functionName: action,
    args: [label, beneficiary],
  });
}

export function decodeWhitelistGrantCall(data: Hex): GrantCallMatch | null {
  try {
    const decoded = decodeFunctionData({ abi: DOTNS_NAME_WHITELIST_ABI, data });
    const args = decoded.args as readonly unknown[];
    switch (decoded.functionName) {
      case "grantName":
      case "accept":
        return {
          action: decoded.functionName,
          labels: [args[0] as string],
          beneficiary: getAddress(args[1] as Address),
        };
      case "grantNames":
        return {
          action: "grantNames",
          labels: [...(args[0] as readonly string[])],
          beneficiary: getAddress(args[1] as Address),
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function unwrapReviveCall(
  decodedCall: any,
): { dest: Hex; data: Hex; viaWhitelist: boolean } | null {
  let call = decodedCall;
  let viaWhitelist = false;
  if (
    call?.type === "Whitelist" &&
    call.value?.type === "dispatch_whitelisted_call_with_preimage"
  ) {
    call = call.value.value.call;
    viaWhitelist = true;
  }
  if (call?.type !== "Revive" || call.value?.type !== "call") return null;
  const { dest, data } = call.value.value;
  return { dest: convertToHexString(dest), data: convertToHexString(data), viaWhitelist };
}

async function dryRun(
  ctx: DotnsContext,
  origin: OriginCaller,
  call: RuntimeCall,
): Promise<DryRunOutcome> {
  const result = await api(ctx).apis.DryRunApi.dry_run_call(origin, call, DRY_RUN_XCM_VERSION);
  if (!result.success) {
    return { ok: false, error: `dry run failed: ${formatDispatchError(result.value)}` };
  }
  const execution = result.value.execution_result;
  if (!execution.success) {
    const rawError = execution.value?.error ?? execution.value;
    return { ok: false, error: formatDispatchError(rawError), rawError };
  }
  return { ok: true, events: result.value.emitted_events ?? [] };
}

function reviveCall(ctx: DotnsContext, whitelist: Address, calldata: Hex, weightLimit: Weight) {
  return api(ctx).tx.Revive.call({
    dest: Binary.fromHex(whitelist),
    value: 0n,
    weight_limit: weightLimit,
    storage_deposit_limit: computeStorageDepositLimit(0n, ctx.nativeTokenDecimals),
    data: Binary.fromHex(calldata),
  });
}

function isNotWhitelistedError(rawError: unknown): boolean {
  const error = rawError as ModuleError;
  return (
    error?.type === "Module" &&
    error.value?.type === "Whitelist" &&
    error.value.value?.type === "CallIsNotWhitelisted"
  );
}

// Dry-run with a Root origin, as enactment dispatches it; the weight limit comes from that run.
export async function buildGrantProposal(
  ctx: DotnsContext,
  params: GrantProposalParams,
): Promise<GrantProposal> {
  const [track, whitelist] = await Promise.all([
    readTrack(ctx, params.track),
    resolveNameWhitelist(ctx),
  ]);
  const calldata = encodeGrantCalldata(params.action, params.label, params.beneficiary);

  const grantCall = reviveCall(ctx, whitelist, calldata, GRANT_WEIGHT_LIMIT);
  const dryRunResult = await dryRun(ctx, rootOrigin(), grantCall.decodedCall);
  if (!dryRunResult.ok) {
    throw new Error(`The ${params.action} call would fail at enactment: ${dryRunResult.error}`);
  }

  let proposal: ProposalCall = grantCall;
  let whitelistCallHash: Hex | undefined;
  let whitelisted: boolean | undefined;
  if (params.track === "whitelisted-caller") {
    const innerBytes = (await grantCall.getEncodedData()).asBytes();
    whitelistCallHash = blake2AsHex(innerBytes, 256) as Hex;
    proposal = api(ctx).tx.Whitelist.dispatch_whitelisted_call_with_preimage({
      call: grantCall.decodedCall,
    });
    const viaWhitelist = await dryRun(ctx, proposalOrigin(params.track), proposal.decodedCall);
    if (viaWhitelist.ok) {
      whitelisted = true;
    } else if (isNotWhitelistedError(viaWhitelist.rawError)) {
      whitelisted = false;
    } else {
      throw new Error(`The whitelisted dispatch would fail at enactment: ${viaWhitelist.error}`);
    }
  }

  const proposalBytes = (await proposal.getEncodedData()).asBytes() as Uint8Array;
  return {
    track,
    whitelist,
    action: params.action,
    label: params.label,
    beneficiary: params.beneficiary,
    calldata,
    proposal,
    proposalBytes,
    preimageHash: blake2AsHex(proposalBytes, 256) as Hex,
    preimageLength: proposalBytes.length,
    whitelistCallHash,
    whitelisted,
  };
}

async function isPreimageNoted(ctx: DotnsContext, proposal: GrantProposal): Promise<boolean> {
  const stored = await api(ctx).query.Preimage.PreimageFor.getValue([
    Binary.fromHex(proposal.preimageHash),
    proposal.preimageLength,
  ]);
  return stored != null;
}

// One batch, so noting the preimage and submitting the referendum land or fail together.
export function buildSubmission(
  ctx: DotnsContext,
  proposal: GrantProposal,
  opts: SubmissionOptions,
) {
  const tx = api(ctx).tx;
  const submit = tx.Referenda.submit({
    proposal_origin: proposalOrigin(proposal.track.track),
    proposal: Enum("Lookup", {
      hash: Binary.fromHex(proposal.preimageHash),
      len: proposal.preimageLength,
    }),
    enactment_moment: Enum("After", proposal.track.minEnactmentPeriod),
  });
  const calls: TxCallData[] = [];
  if (opts.notePreimage) {
    calls.push(
      tx.Preimage.note_preimage({ bytes: Binary.fromBytes(proposal.proposalBytes) }).decodedCall,
    );
  }
  if (opts.reason) {
    calls.push(tx.System.remark({ remark: Binary.fromText(opts.reason) }).decodedCall);
  }
  if (calls.length === 0) return submit;
  calls.push(submit.decodedCall);
  return tx.Utility.batch_all({ calls });
}

function sumHeldForPreimage(events: any[], who: string): bigint {
  let total = 0n;
  for (const event of events) {
    if (event?.type !== "Balances" || event.value?.type !== "Held") continue;
    const held = event.value.value;
    if (held?.reason?.type !== "Preimage" || !isSameSubstrateAccount(held.who, who)) continue;
    total += BigInt(held.amount);
  }
  return total;
}

export async function estimateProposalCosts(
  ctx: DotnsContext,
  proposal: GrantProposal,
  opts: CostOptions,
): Promise<ProposalCosts> {
  const chain = api(ctx);
  const signer = ctx.origin;
  const preimageNoted = await isPreimageNoted(ctx, proposal);
  const submission = buildSubmission(ctx, proposal, {
    notePreimage: !preimageNoted,
    reason: opts.reason,
  });

  const signedOrigin = Enum("system", Enum("Signed", signer));
  // Priced on its own as well, so the deposit is known even when the signer can't
  // afford the whole submission.
  const noteOnly = chain.tx.Preimage.note_preimage({
    bytes: Binary.fromBytes(proposal.proposalBytes),
  });
  const [submissionDeposit, existentialDeposit, undecidingTimeout, account, outcome, noted] =
    await Promise.all([
      chain.constants.Referenda.SubmissionDeposit(),
      chain.constants.Balances.ExistentialDeposit(),
      chain.constants.Referenda.UndecidingTimeout(),
      chain.query.System.Account.getValue(signer),
      dryRun(ctx, signedOrigin, submission.decodedCall),
      preimageNoted ? null : dryRun(ctx, signedOrigin, noteOnly.decodedCall),
    ]);
  const [fees, decisionDepositFee] = await Promise.all([
    submission.getEstimatedFees(signer),
    chain.tx.Referenda.place_decision_deposit({ index: 0 }).getEstimatedFees(signer),
  ]);

  return {
    submissionDeposit: BigInt(submissionDeposit),
    preimageDeposit: noted?.ok
      ? sumHeldForPreimage(noted.events, signer)
      : preimageNoted
        ? 0n
        : null,
    preimageNoted,
    decisionDeposit: proposal.track.decisionDeposit,
    fees: BigInt(fees),
    decisionDepositFee: BigInt(decisionDepositFee),
    existentialDeposit: BigInt(existentialDeposit),
    freeBalance: BigInt(account?.data?.free ?? 0n),
    undecidingTimeout: Number(undecidingTimeout),
    submissionError: outcome.ok ? undefined : outcome.error,
  };
}

export function requiredBalance(costs: ProposalCosts, placeDecisionDeposit: boolean): bigint {
  let total = costs.submissionDeposit + (costs.preimageDeposit ?? 0n) + costs.fees;
  if (placeDecisionDeposit) total += costs.decisionDeposit + costs.decisionDepositFee;
  return total + costs.existentialDeposit;
}

function findEvent(events: any[], pallet: string, name: string): any | undefined {
  return events.find((event) => event?.type === pallet && event.value?.type === name)?.value?.value;
}

export async function submitGrantReferendum(
  ctx: DotnsContext,
  proposal: GrantProposal,
  opts: SubmissionOptions,
): Promise<SubmittedReferendum> {
  const submission = buildSubmission(ctx, proposal, opts);
  const finalized = await ctx.clientWrapper.submitExtrinsic(
    submission,
    requireSigner(ctx),
    (status) => ctx.onStatus(status),
    ctx.origin,
    ctx.signal,
  );
  const submitted = findEvent(finalized.events, "Referenda", "Submitted");
  if (!submitted) {
    throw new Error(
      `Submission ${finalized.txHash} finalized without a Referenda.Submitted event.`,
    );
  }
  return { index: Number(submitted.index), txHash: finalized.txHash };
}

export async function placeDecisionDeposit(
  ctx: DotnsContext,
  index: number,
): Promise<TransactionResult> {
  const finalized = await ctx.clientWrapper.submitExtrinsic(
    api(ctx).tx.Referenda.place_decision_deposit({ index }),
    requireSigner(ctx),
    (status) => ctx.onStatus(status),
    ctx.origin,
    ctx.signal,
  );
  if (!findEvent(finalized.events, "Referenda", "DecisionDepositPlaced")) {
    throw new Error(`Decision deposit ${finalized.txHash} finalized without being placed.`);
  }
  return { txHash: finalized.txHash };
}

export async function normaliseGrantLabel(ctx: DotnsContext, name: string): Promise<string> {
  const label = await normaliseName(ctx, name);
  validateGrantedLabel(label);
  return label;
}

export async function readGrantEligibility(
  ctx: DotnsContext,
  label: string,
  beneficiary: Address,
): Promise<GrantEligibility> {
  const whitelist = await resolveNameWhitelist(ctx);
  const base = baseLabelOf(label);
  const [available, shortNamesEnabled, statusIndex, grantee, claim, claimantCount, reservation] =
    await Promise.all([
      read<boolean>(
        ctx,
        ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
        DOTNS_REGISTRAR_CONTROLLER_ABI,
        "available",
        [label],
      ),
      read<boolean>(ctx, ctx.contracts.DOTNS_RULES, POP_RULES_ABI, "shortNamesEnabled", []),
      read<number>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "statusOf", [label]),
      read<Address>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "granteeOf", [label]),
      read<ClaimRecord>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "claimOf", [label, beneficiary]),
      read<bigint>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "claimantCount", [label]),
      read<readonly [boolean, Address, bigint]>(
        ctx,
        ctx.contracts.DOTNS_RULES,
        POP_RULES_ABI,
        "isBaseNameReserved",
        [base],
      ),
    ]);
  const [reserved, reservationOwner, expiresAt] = reservation;
  return {
    label,
    baseLength: base.length,
    available,
    shortNamesEnabled,
    whitelistStatus: knownStatus(NAME_GRANT_STATUS, statusIndex, "name status"),
    grantee: getAddress(grantee),
    beneficiaryClaim: claim ? knownStatus(CLAIM_STATUS, claim.status, "claim status") : null,
    claimantCount: Number(claimantCount),
    popReservation: reserved ? { owner: getAddress(reservationOwner), expiresAt } : null,
  };
}

// An index outside the enum means the deployed whitelist doesn't match this CLI.
function knownStatus<T extends string>(names: readonly T[], index: number, what: string): T {
  const name = names[Number(index)];
  if (name === undefined) {
    throw new Error(`The whitelist returned an unknown ${what} (${index}); update the CLI.`);
  }
  return name;
}

export function claimableInApp(eligibility: GrantEligibility): boolean {
  return (
    eligibility.baseLength >= PERSONHOOD_MIN_BASE_LENGTH && isPersonhoodLabel(eligibility.label)
  );
}

export function assessGrant(
  eligibility: GrantEligibility,
  beneficiary: Address,
  domain: string,
): GrantAssessment {
  const warnings: string[] = [];
  const sameAccount = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (eligibility.baseLength >= OPEN_BASE_LENGTH) {
    return {
      action: "grantName",
      warnings,
      blocker: `${domain} is open to everyone: register it with \`dotns register domain --name ${eligibility.label}\`.`,
    };
  }
  if (eligibility.whitelistStatus === "Claimed") {
    const blocker =
      eligibility.grantee !== ZERO_ADDRESS && sameAccount(eligibility.grantee, beneficiary)
        ? eligibility.available
          ? `${domain} is already granted to ${beneficiary}: register it with \`dotns register domain --name ${eligibility.label} --governance\`.`
          : `${domain} was granted to ${beneficiary} and is already registered.`
        : `${domain} is already granted to ${eligibility.grantee}.`;
    return { action: "grantName", warnings, blocker };
  }
  if (!eligibility.available) {
    return { action: "grantName", warnings, blocker: `${domain} is already registered.` };
  }
  if (eligibility.whitelistStatus === "Reserved") {
    return {
      action: "grantName",
      warnings,
      blocker: `${domain} is marked Reserved on the whitelist and cannot be granted.`,
    };
  }

  const action: GrantAction = eligibility.beneficiaryClaim === "Requested" ? "accept" : "grantName";
  const otherRequests = eligibility.claimantCount - (action === "accept" ? 1 : 0);
  if (otherRequests > 0) {
    warnings.push(
      `${otherRequests} other account${otherRequests === 1 ? " has" : "s have"} requested ${domain}. Only the first grant to enact succeeds.`,
    );
  }
  if (claimableInApp(eligibility)) {
    warnings.push(
      `A person can still claim ${domain} as their personhood name in the Polkadot App while the vote runs. If that happens the grant enacts but the name cannot be registered.`,
    );
    const reservation = eligibility.popReservation;
    if (reservation && !sameAccount(reservation.owner, beneficiary)) {
      warnings.push(
        `${reservation.owner} holds a reservation on ${eligibility.label} from a device name and is first in line to claim it.`,
      );
    }
  }
  if (eligibility.baseLength >= PERSONHOOD_MIN_BASE_LENGTH && eligibility.shortNamesEnabled) {
    warnings.push(
      `Short names are open to personhood holders, so ${domain} can also be bought on the paid path before the vote ends.`,
    );
  }
  return { action, warnings };
}

function summariseOngoing(index: number, info: OngoingReferendum): ReferendumSummary {
  const deciding = info.deciding ?? undefined;
  const confirming = deciding?.confirming ?? undefined;
  let status: ReferendumStatus = "Preparing";
  if (deciding) status = confirming != null ? "Confirming" : "Deciding";
  return {
    index,
    status,
    trackId: Number(info.track),
    submittedAt: Number(info.submitted),
    decisionDepositPlaced: info.decision_deposit != null,
    decidingSince: deciding ? Number(deciding.since) : undefined,
    confirmingUntil: confirming != null ? Number(confirming) : undefined,
    ayes: BigInt(info.tally?.ayes ?? 0n),
    nays: BigInt(info.tally?.nays ?? 0n),
  };
}

async function decodeProposal(
  ctx: DotnsContext,
  proposal: OngoingReferendum["proposal"],
): Promise<TxCallData | null> {
  const chain = api(ctx);
  let bytes: Binary | undefined;
  if (proposal?.type === "Inline") {
    bytes = proposal.value;
  } else if (proposal?.type === "Lookup") {
    bytes = await chain.query.Preimage.PreimageFor.getValue([
      proposal.value.hash,
      proposal.value.len,
    ]);
  }
  if (!bytes) return null;
  try {
    return (await chain.txFromCallData(bytes)).decodedCall;
  } catch {
    return null;
  }
}

async function grantOf(
  ctx: DotnsContext,
  proposal: OngoingReferendum["proposal"],
  whitelist: Address,
): Promise<ReferendumSummary["grant"]> {
  const decoded = await decodeProposal(ctx, proposal);
  const inner = decoded ? unwrapReviveCall(decoded) : null;
  if (!inner || inner.dest.toLowerCase() !== whitelist.toLowerCase()) return undefined;
  const grant = decodeWhitelistGrantCall(inner.data);
  return grant ? { ...grant, viaWhitelist: inner.viaWhitelist } : undefined;
}

export async function getReferendum(
  ctx: DotnsContext,
  index: number,
): Promise<ReferendumSummary | null> {
  const info = await api(ctx).query.Referenda.ReferendumInfoFor.getValue(index);
  if (!info) return null;
  if (info.type !== "Ongoing") {
    return {
      index,
      status: info.type as ReferendumStatus,
      concludedAt: Number(Array.isArray(info.value) ? info.value[0] : info.value),
    };
  }
  const whitelist = await resolveNameWhitelist(ctx);
  return {
    ...summariseOngoing(index, info.value),
    grant: await grantOf(ctx, info.value.proposal, whitelist),
  };
}

// Finished referenda keep no proposal on chain, so only ongoing ones can be matched.
export async function findGrantReferenda(
  ctx: DotnsContext,
  label: string,
): Promise<ReferendumSummary[]> {
  const whitelist = await resolveNameWhitelist(ctx);
  const entries = await api(ctx).query.Referenda.ReferendumInfoFor.getEntries();
  const matches: ReferendumSummary[] = [];
  for (const entry of entries) {
    if (entry.value?.type !== "Ongoing") continue;
    const grant = await grantOf(ctx, entry.value.value.proposal, whitelist);
    if (!grant?.labels.includes(label)) continue;
    matches.push({ ...summariseOngoing(Number(entry.keyArgs[0]), entry.value.value), grant });
  }
  return matches.sort((a, b) => a.index - b.index);
}

export async function readGovernanceClock(ctx: DotnsContext): Promise<GovernanceClock> {
  const chain = api(ctx);
  const [now, undecidingTimeout, decisionPeriods] = await Promise.all([
    chain.query.ParachainSystem.LastRelayChainBlockNumber.getValue(),
    chain.constants.Referenda.UndecidingTimeout(),
    readDecisionPeriods(ctx),
  ]);
  return { now: Number(now), undecidingTimeout: Number(undecidingTimeout), decisionPeriods };
}

export function formatBlockDuration(blocks: number): string {
  const seconds = Math.max(0, blocks) * RELAY_BLOCK_SECONDS;
  const days = Math.floor(seconds / 86_400);
  if (days >= 2) return `${days} days`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 2) return `${hours} hours`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function describeReferendum(summary: ReferendumSummary, clock: GovernanceClock): string {
  const parts: string[] = [summary.status];
  switch (summary.status) {
    case "Preparing": {
      if (summary.submittedAt !== undefined) {
        const timeoutAt = summary.submittedAt + clock.undecidingTimeout;
        parts.push(`times out in ${formatBlockDuration(timeoutAt - clock.now)}`);
      }
      if (!summary.decisionDepositPlaced) parts.push("needs a decision deposit");
      break;
    }
    case "Deciding": {
      const period = clock.decisionPeriods.get(summary.trackId ?? -1);
      if (summary.decidingSince !== undefined && period !== undefined) {
        parts.push(`${formatBlockDuration(summary.decidingSince + period - clock.now)} left`);
      }
      break;
    }
    case "Confirming": {
      if (summary.confirmingUntil !== undefined) {
        parts.push(`confirms in ${formatBlockDuration(summary.confirmingUntil - clock.now)}`);
      }
      break;
    }
    default:
      break;
  }
  if (summary.ayes !== undefined && summary.nays !== undefined) {
    const total = summary.ayes + summary.nays;
    if (total > 0n) parts.push(`Aye ${Number((summary.ayes * 100n) / total)}%`);
  }
  return parts.join(" · ");
}

export async function requestNameGrant(
  ctx: DotnsContext,
  label: string,
  reason: string,
  user: Address,
): Promise<TransactionResult> {
  const whitelist = await resolveNameWhitelist(ctx);
  const [windowOpen, statusIndex, claim, maxReasonBytes] = await Promise.all([
    read<boolean>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "isWindowOpen", []),
    read<number>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "statusOf", [label]),
    read<ClaimRecord>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "claimOf", [label, user]),
    read<bigint>(ctx, whitelist, DOTNS_NAME_WHITELIST_ABI, "maxReasonBytes", []),
  ]);
  if (!windowOpen) {
    throw new Error(
      "The whitelist isn't taking requests right now. Propose a grant with `dotns governance propose` instead.",
    );
  }
  const status = NAME_GRANT_STATUS[Number(statusIndex)];
  if (status !== "Open") {
    throw new Error(`${label} can't be requested: it is ${status} on the whitelist.`);
  }
  const claimStatus = CLAIM_STATUS[Number(claim.status)];
  if (claimStatus === "Requested") throw new Error(`${user} has already requested ${label}.`);
  if (claimStatus === "Rejected") {
    throw new Error(`A request for ${label} by ${user} was rejected and can't be filed again.`);
  }
  if (new TextEncoder().encode(reason).length > Number(maxReasonBytes)) {
    throw new Error(`The reason is longer than the ${maxReasonBytes} bytes the whitelist accepts.`);
  }
  const txHash = await write(
    ctx,
    whitelist,
    0n,
    DOTNS_NAME_WHITELIST_ABI,
    "requestName",
    [label, reason, user],
    "Name request",
  );
  return { txHash };
}
