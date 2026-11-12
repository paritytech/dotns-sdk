import type { BulletinHeliaClient } from "./heliaClient";
import type { VerificationResult } from "../types/types";
import { getActiveDotnsEnvironment, type DotnsEnvironmentConfig } from "../utils/environments";
import { formatErrorMessage } from "../utils/formatting";
import { resolveBulletinPeers } from "./bulletinPeers";

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

export const P2P_VERIFICATION_SOURCE = "p2p/bitswap";

// Path-style, like a stack's `ipfs-gateway`: content is at `${gateway}${cid}`.
const PUBLIC_FALLBACK_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.filebase.io/ipfs/",
] as const;

export type CidVerification = { success: VerificationResult } | { failures: VerificationResult[] };

export function verificationGateways(
  environment: DotnsEnvironmentConfig = getActiveDotnsEnvironment(),
): string[] {
  return environment.ipfsGatewayUrl ? [environment.ipfsGatewayUrl] : [];
}

// Public gateways back up the environment's own gateway; on their own, an answer
// from them says nothing about the content being on the Bulletin chain.
export function publicFallbackGateways(): readonly string[] {
  return verificationGateways().length ? PUBLIC_FALLBACK_GATEWAYS : [];
}

/**
 * The path-style form of a gateway base URL such as `https://ipfs.io` or `https://ipfs.io/ipfs`:
 * `https://ipfs.io/ipfs/`, so content is at `${gateway}${cid}`.
 */
export function formatPathStyleGateway(baseUrl: string): string {
  const gateway = baseUrl.replace(/[/]+$/, "");
  return gateway.endsWith("/ipfs") ? `${gateway}/` : `${gateway}/ipfs/`;
}

async function verifyCidResolution(
  contentCid: string,
  gatewayUrl: string,
  signal: AbortSignal,
): Promise<VerificationResult> {
  try {
    const response = await fetch(`${gatewayUrl}${contentCid}`, { method: "HEAD", signal });
    return {
      cid: contentCid,
      resolvable: response.ok,
      gateway: gatewayUrl,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      cid: contentCid,
      resolvable: false,
      gateway: gatewayUrl,
      errorMessage: formatErrorMessage(error),
    };
  }
}

async function verifyCidViaP2P(
  cidString: string,
  client: Promise<BulletinHeliaClient>,
  signal: AbortSignal,
): Promise<VerificationResult> {
  try {
    await (await client).fetchBlock(cidString, signal);
    return { cid: cidString, resolvable: true, gateway: P2P_VERIFICATION_SOURCE };
  } catch (error) {
    return {
      cid: cidString,
      resolvable: false,
      gateway: P2P_VERIFICATION_SOURCE,
      errorMessage: formatErrorMessage(error),
    };
  }
}

// Resolves with the first check that resolves the CID, or with every failure in `checks` order.
async function findFirstResolution(
  checks: Promise<VerificationResult>[],
): Promise<CidVerification> {
  try {
    const success = await Promise.any(
      checks.map((check) =>
        check.then((result) => (result.resolvable ? result : Promise.reject(result))),
      ),
    );
    return { success };
  } catch (error) {
    return { failures: (error as AggregateError).errors as VerificationResult[] };
  }
}

function createVerificationSignal(abort: AbortController): AbortSignal {
  return AbortSignal.any([abort.signal, AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS)]);
}

/**
 * Checks the CID over P2P on the Bulletin boot nodes of `environment`'s stack and every
 * gateway in `gatewayUrls` at once, then, only when all of those fail, over every gateway
 * in `fallbackGatewayUrls` at once. Gateways are path-style: content is at `${gateway}${cid}`.
 * Resolves with the first check that resolves the CID, aborting the others, or with
 * every check's failure, P2P first, once all have failed. Never rejects.
 * The P2P node stops after this returns, once its peer dials finish; a failure
 * to stop it is logged as a warning.
 */
export async function verifyCid(
  contentCid: string,
  gatewayUrls: readonly string[],
  fallbackGatewayUrls: readonly string[] = [],
  environment: DotnsEnvironmentConfig = getActiveDotnsEnvironment(),
): Promise<CidVerification> {
  const abort = new AbortController();
  // Peers resolve before the libp2p stack loads, and that loads on first use, so commands
  // that never verify and stacks without usable peers don't load it.
  const p2pClient = resolveBulletinPeers(environment.descriptor).then(async (peerAddresses) => {
    const { BulletinHeliaClient } = await import("./heliaClient");
    return new BulletinHeliaClient(peerAddresses);
  });

  try {
    const signal = createVerificationSignal(abort);
    const verification = await findFirstResolution([
      verifyCidViaP2P(contentCid, p2pClient, signal),
      ...gatewayUrls.map((gatewayUrl) => verifyCidResolution(contentCid, gatewayUrl, signal)),
    ]);
    if ("success" in verification || fallbackGatewayUrls.length === 0) return verification;

    const fallbackSignal = createVerificationSignal(abort);
    const fallbackVerification = await findFirstResolution(
      fallbackGatewayUrls.map((gatewayUrl) =>
        verifyCidResolution(contentCid, gatewayUrl, fallbackSignal),
      ),
    );
    return "success" in fallbackVerification
      ? fallbackVerification
      : { failures: [...verification.failures, ...fallbackVerification.failures] };
  } finally {
    abort.abort();
    void p2pClient
      .then(
        (client) => client.destroy(),
        () => undefined,
      )
      .catch((error) =>
        console.warn(`Failed to stop the P2P verification node: ${formatErrorMessage(error)}`),
      );
  }
}

export function describeVerificationFailures(failures: readonly VerificationResult[]): string {
  return failures
    .map((failure) => `${failure.gateway}: ${failure.errorMessage ?? `HTTP ${failure.statusCode}`}`)
    .join("; ");
}
