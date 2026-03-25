import { getSharedHeliaClient, type HeliaFetchResult } from "@/lib/heliaClient";

const BULLETIN_VERIFICATION_GATEWAY = "https://paseo-ipfs.polkadot.io";
const IPFS_FETCH_TIMEOUT_MS = 15_000;
const IPFS_VERIFICATION_TIMEOUT_MS = 15_000;
const P2P_FETCH_TIMEOUT_MS = 10_000;

export const IPFS_GATEWAYS = [
  "https://dweb.link",
  "https://cloudflare-ipfs.com",
  "https://w3s.link",
  "https://ipfs.io",
  BULLETIN_VERIFICATION_GATEWAY,
] as const;

export type CidVerificationResult = {
  cid: string;
  gateway: string;
  url: string;
  resolvable: boolean;
  statusCode?: number;
  errorMessage?: string;
};

export type ResolvedIpfsContent = {
  gateway: string;
  url: string;
  response: Response;
};

function normalizeGatewayUrl(gatewayBaseUrl: string): string {
  return gatewayBaseUrl.replace(/\/+$/, "");
}

function getGatewayCandidateUrls(gatewayBaseUrl: string, cid: string): string[] {
  const gateway = normalizeGatewayUrl(gatewayBaseUrl);
  return [`${gateway}/ipfs/${cid}`, `${gateway}/ipfs/${cid}/`];
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createFetchOptions(timeoutMs: number, method: "GET" | "HEAD" = "GET"): RequestInit {
  return {
    method,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  };
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    /* noop */
  }
}

async function verifyGatewayCandidate(
  cid: string,
  gatewayBaseUrl: string,
  timeoutMs: number,
): Promise<CidVerificationResult> {
  const candidateUrls = getGatewayCandidateUrls(gatewayBaseUrl, cid);
  let lastStatusCode: number | undefined;
  let lastErrorMessage: string | undefined;
  let lastResolvedUrl = candidateUrls[0] ?? gatewayBaseUrl;

  for (const url of candidateUrls) {
    lastResolvedUrl = url;

    try {
      const headResponse = await fetch(url, createFetchOptions(timeoutMs, "HEAD"));
      lastResolvedUrl = headResponse.url || url;
      lastStatusCode = headResponse.status;

      if (headResponse.ok) {
        return {
          cid,
          gateway: gatewayBaseUrl,
          url: lastResolvedUrl,
          resolvable: true,
          statusCode: headResponse.status,
        };
      }

      if (headResponse.status !== 405 && headResponse.status !== 501) {
        continue;
      }
    } catch (error) {
      lastErrorMessage = formatErrorMessage(error);
    }

    try {
      const getResponse = await fetch(url, createFetchOptions(timeoutMs, "GET"));
      lastResolvedUrl = getResponse.url || url;
      lastStatusCode = getResponse.status;

      if (getResponse.ok) {
        await cancelResponseBody(getResponse);
        return {
          cid,
          gateway: gatewayBaseUrl,
          url: lastResolvedUrl,
          resolvable: true,
          statusCode: getResponse.status,
        };
      }

      await cancelResponseBody(getResponse);
    } catch (error) {
      lastErrorMessage = formatErrorMessage(error);
    }
  }

  return {
    cid,
    gateway: gatewayBaseUrl,
    url: lastResolvedUrl,
    resolvable: false,
    statusCode: lastStatusCode,
    errorMessage: lastErrorMessage,
  };
}

export async function fetchCidFromP2P(cidString: string): Promise<HeliaFetchResult> {
  const heliaClient = getSharedHeliaClient();
  const fetchPromise = heliaClient.fetchContent(cidString);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`P2P fetch timed out after ${P2P_FETCH_TIMEOUT_MS / 1000}s`)),
      P2P_FETCH_TIMEOUT_MS,
    );
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}

export async function verifyCidViaP2P(cidString: string): Promise<boolean> {
  const heliaClient = getSharedHeliaClient();
  const verifyPromise = heliaClient.verifyCid(cidString);
  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), P2P_FETCH_TIMEOUT_MS);
  });
  return Promise.race([verifyPromise, timeoutPromise]);
}

export async function verifyCidWithGateways(
  cid: string,
  gateways: readonly string[] = IPFS_GATEWAYS,
  timeoutMs: number = IPFS_VERIFICATION_TIMEOUT_MS,
): Promise<CidVerificationResult> {
  try {
    const p2pVerified = await verifyCidViaP2P(cid);
    if (p2pVerified) {
      return {
        cid,
        gateway: "p2p",
        url: `p2p://${cid}`,
        resolvable: true,
      };
    }
  } catch {
    /* noop */
  }

  const gatewayList = gateways.length > 0 ? gateways : IPFS_GATEWAYS;
  let lastResult: CidVerificationResult | null = null;

  for (const gateway of gatewayList) {
    const result = await verifyGatewayCandidate(cid, gateway, timeoutMs);
    if (result.resolvable) {
      return result;
    }

    lastResult = result;
  }

  return (
    lastResult ?? {
      cid,
      gateway: gatewayList[0] ?? BULLETIN_VERIFICATION_GATEWAY,
      url: "",
      resolvable: false,
      errorMessage: "No IPFS gateways configured.",
    }
  );
}

export async function fetchCidFromGateways(
  cid: string,
  gateways: readonly string[] = IPFS_GATEWAYS,
  timeoutMs: number = IPFS_FETCH_TIMEOUT_MS,
): Promise<ResolvedIpfsContent> {
  const gatewayList = gateways.length > 0 ? gateways : IPFS_GATEWAYS;
  let lastErrorMessage: string | undefined;
  let lastStatusCode: number | undefined;

  for (const gateway of gatewayList) {
    const candidateUrls = getGatewayCandidateUrls(gateway, cid);

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, createFetchOptions(timeoutMs));
        if (response.ok) {
          return {
            gateway,
            url: response.url || url,
            response,
          };
        }

        lastStatusCode = response.status;
        await cancelResponseBody(response);
      } catch (error) {
        lastErrorMessage = formatErrorMessage(error);
      }
    }
  }

  const statusSuffix = lastStatusCode ? ` (last status ${lastStatusCode})` : "";
  const errorSuffix = lastErrorMessage ? ` ${lastErrorMessage}` : "";
  throw new Error(`Content not found on IPFS gateways.${statusSuffix}${errorSuffix}`.trim());
}
