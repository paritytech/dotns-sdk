import type { BulletinHeliaClient } from "./heliaClient";
import type { VerificationResult } from "../types/types";
import { getActiveDotnsEnvironment } from "../utils/constants";
import { formatErrorMessage } from "../utils/formatting";

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

export const P2P_VERIFICATION_SOURCE = "p2p/bitswap";

const PUBLIC_FALLBACK_GATEWAYS = [
  "https://gateway.pinata.cloud",
  "https://ipfs.filebase.io",
] as const;

export type CidVerification = { success: VerificationResult } | { failures: VerificationResult[] };

export function verificationGateways(): string[] {
  const { ipfsGatewayUrl } = getActiveDotnsEnvironment();
  return ipfsGatewayUrl ? [ipfsGatewayUrl] : [];
}

// Public gateways back up the environment's own gateway; on their own, an answer
// from them says nothing about the content being on the Bulletin chain.
export function publicFallbackGateways(): readonly string[] {
  return verificationGateways().length ? PUBLIC_FALLBACK_GATEWAYS : [];
}

function createIpfsGatewayUrl(gatewayBaseUrl: string, cid: string): string {
  const gateway = gatewayBaseUrl.replace(/\/+$/, "");
  return gateway.endsWith("/ipfs") ? `${gateway}/${cid}` : `${gateway}/ipfs/${cid}`;
}

async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string,
  signal: AbortSignal,
): Promise<VerificationResult> {
  try {
    const response = await fetch(createIpfsGatewayUrl(gatewayBaseUrl, contentCid), {
      method: "HEAD",
      signal,
    });
    return {
      cid: contentCid,
      resolvable: response.ok,
      gateway: gatewayBaseUrl,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      cid: contentCid,
      resolvable: false,
      gateway: gatewayBaseUrl,
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
 * Checks the CID over Bulletin P2P and every gateway in `gatewayUrls` at once, then,
 * only when all of those fail, over every gateway in `fallbackGatewayUrls` at once.
 * Resolves with the first check that resolves the CID, aborting the others, or with
 * every check's failure, P2P first, once all have failed. Never rejects.
 * The P2P node stops after this returns, once its peer dials finish; a failure
 * to stop it is logged as a warning.
 */
export async function verifyCid(
  contentCid: string,
  gatewayUrls: readonly string[],
  fallbackGatewayUrls: readonly string[] = [],
): Promise<CidVerification> {
  const abort = new AbortController();
  // Loaded on first use, so commands that never verify don't load the libp2p stack.
  const p2pClient = import("./heliaClient").then(
    ({ BulletinHeliaClient }) => new BulletinHeliaClient(),
  );

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
