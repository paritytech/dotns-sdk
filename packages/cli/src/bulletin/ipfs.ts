import type { BulletinHeliaClient } from "./heliaClient";
import type { VerificationResult } from "../types/types";
import { getActiveDotnsEnvironment } from "../utils/constants";
import { formatErrorMessage } from "../utils/formatting";

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

export const P2P_VERIFICATION_SOURCE = "p2p/bitswap";

const PUBLIC_FALLBACK_GATEWAYS = [
  "https://dweb.link",
  "https://cloudflare-ipfs.com",
  "https://w3s.link",
] as const;

export type CidVerification = { success: VerificationResult } | { failures: VerificationResult[] };

/**
 * Resolve the IPFS HTTP gateway base URL for the active environment. Throws
 * with a clear message when the active environment does not operate a gateway.
 * Callers can catch and either pass `--gateway` or skip the verification step.
 */
function requireActiveGateway(): string {
  const environment = getActiveDotnsEnvironment();
  if (!environment.ipfsGatewayUrl) {
    throw new Error(
      `IPFS gateway not configured for environment '${environment.id}'; verification skipped, pass --gateway to override.`,
    );
  }
  return environment.ipfsGatewayUrl;
}

function activeGateways(): string[] {
  const { ipfsGatewayUrl } = getActiveDotnsEnvironment();
  return ipfsGatewayUrl ? [ipfsGatewayUrl] : [];
}

// Public gateways back up the environment's own gateway; on their own, an answer
// from them says nothing about the content being on the Bulletin chain. Without an
// environment gateway the list is empty and only P2P runs.
export function verificationGateways(): string[] {
  const gateways = activeGateways();
  return gateways.length ? [...gateways, ...PUBLIC_FALLBACK_GATEWAYS] : [];
}

function createIpfsGatewayUrl(gatewayBaseUrl: string, cid: string): string {
  const gateway = gatewayBaseUrl.replace(/\/+$/, "");
  return gateway.endsWith("/ipfs") ? `${gateway}/${cid}` : `${gateway}/ipfs/${cid}`;
}

function createVerificationSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = requireActiveGateway(),
  signal?: AbortSignal,
): Promise<VerificationResult> {
  const verificationUrl = createIpfsGatewayUrl(gatewayBaseUrl, contentCid);

  try {
    const response = await fetch(verificationUrl, {
      method: "HEAD",
      signal: createVerificationSignal(signal),
    });

    return {
      cid: contentCid,
      resolvable: response.ok,
      gateway: gatewayBaseUrl,
      statusCode: response.status,
    };
  } catch (error) {
    const errorMessage = formatErrorMessage(error);

    return {
      cid: contentCid,
      resolvable: false,
      gateway: gatewayBaseUrl,
      errorMessage,
    };
  }
}

async function verifyCidViaP2P(
  cidString: string,
  client: Promise<BulletinHeliaClient>,
  signal: AbortSignal,
): Promise<VerificationResult> {
  try {
    await (await client).fetchBlock(cidString, createVerificationSignal(signal));
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

/**
 * Checks the CID over Bulletin P2P and every gateway in `gatewayUrls` at once.
 * Resolves with the first check that resolves the CID, aborting the others, or
 * with every check's failure, P2P first, once all have failed. Never rejects.
 * The P2P node stops after this returns, once its peer dials finish; a failure
 * to stop it is logged as a warning.
 */
export async function verifyCid(
  contentCid: string,
  gatewayUrls: readonly string[],
): Promise<CidVerification> {
  const abort = new AbortController();
  // Loaded on first use, so commands that never verify don't load the libp2p stack.
  const p2pClient = import("./heliaClient").then(
    ({ BulletinHeliaClient }) => new BulletinHeliaClient(),
  );
  const checks = [
    verifyCidViaP2P(contentCid, p2pClient, abort.signal),
    ...gatewayUrls.map((gatewayUrl) => verifyCidResolution(contentCid, gatewayUrl, abort.signal)),
  ];

  try {
    const success = await Promise.any(
      checks.map((check) =>
        check.then((result) => (result.resolvable ? result : Promise.reject(result))),
      ),
    );
    return { success };
  } catch (error) {
    return { failures: (error as AggregateError).errors as VerificationResult[] };
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

// Checks P2P and `gatewayBaseUrl`, which defaults to the active environment's gateway.
export function verifySingleFileCid(
  contentCid: string,
  gatewayBaseUrl: string | undefined = activeGateways()[0],
): Promise<CidVerification> {
  return verifyCid(contentCid, gatewayBaseUrl ? [gatewayBaseUrl] : []);
}
