import type { VerificationResult } from "../types/types";
import { getActiveDotnsEnvironment } from "../utils/constants";
import { formatErrorMessage } from "../utils/formatting";
async function loadHeliaClient() {
  const { getSharedHeliaClient } = await import("./heliaClient");
  return getSharedHeliaClient();
}

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

const PUBLIC_FALLBACK_GATEWAYS = [
  "https://dweb.link",
  "https://cloudflare-ipfs.com",
  "https://w3s.link",
] as const;

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

function createIpfsGatewayUrl(gatewayBaseUrl: string, cid: string): string {
  const gateway = gatewayBaseUrl.replace(/\/+$/, "");
  return gateway.endsWith("/ipfs") ? `${gateway}/${cid}` : `${gateway}/ipfs/${cid}`;
}

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = requireActiveGateway(),
): Promise<VerificationResult> {
  const verificationUrl = createIpfsGatewayUrl(gatewayBaseUrl, contentCid);

  try {
    const response = await fetch(verificationUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS),
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

export async function verifyCidWithMultipleGateways(
  contentCid: string,
  gatewayUrls: string[] = [requireActiveGateway(), ...PUBLIC_FALLBACK_GATEWAYS],
): Promise<Map<string, VerificationResult>> {
  const verificationResults = new Map<string, VerificationResult>();

  for (const gatewayUrl of gatewayUrls) {
    const result = await verifyCidResolution(contentCid, gatewayUrl);
    verificationResults.set(gatewayUrl, result);
  }

  return verificationResults;
}

export async function verifyCidViaP2P(cidString: string): Promise<VerificationResult> {
  try {
    const heliaClient = await loadHeliaClient();
    const fetchResult = await heliaClient.fetchBlock(cidString);
    return {
      cid: cidString,
      resolvable: fetchResult.size > 0,
      gateway: "p2p/bitswap",
    };
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    return {
      cid: cidString,
      resolvable: false,
      gateway: "p2p/bitswap",
      errorMessage,
    };
  }
}

export async function verifySingleFileCid(
  contentCid: string,
  gatewayBaseUrl: string = requireActiveGateway(),
): Promise<VerificationResult> {
  const p2pResult = await verifyCidViaP2P(contentCid);
  if (p2pResult.resolvable) {
    return p2pResult;
  }

  return verifyCidResolution(contentCid, gatewayBaseUrl);
}
