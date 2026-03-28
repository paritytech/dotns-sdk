import { getSharedHeliaClient, type HeliaContentFetchResult } from "@/lib/heliaClient";

const BULLETIN_VERIFICATION_GATEWAY = "https://paseo-ipfs.polkadot.io";
const GATEWAY_FETCH_TIMEOUT_MS = 15_000;
const IPFS_VERIFICATION_TIMEOUT_MS = 15_000;
const P2P_FETCH_TIMEOUT_MS = 10_000;
export const MAX_INLINE_PREVIEW_BYTES = 25 * 1024 * 1024;

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
  blob: Blob;
  contentType: string;
  size: number;
};

type FetchCidOptions = {
  gateways?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBytes?: number;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isResolvableStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function createFetchOptions(signal: AbortSignal, method: "GET" | "HEAD" = "GET"): RequestInit {
  return {
    method,
    cache: "no-store",
    redirect: "follow",
    signal,
  };
}

function createRequestSignal(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs / 1000}s`));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(
      externalSignal?.reason instanceof Error
        ? externalSignal.reason
        : new Error("Request aborted"),
    );
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };

  controller.signal.addEventListener("abort", cleanup, { once: true });

  return { signal: controller.signal, cleanup };
}

export class IpfsContentTooLargeError extends Error {
  gateway: string;
  url: string;
  size: number;
  limit: number;
  contentType: string;

  constructor(params: {
    gateway: string;
    url: string;
    size: number;
    limit: number;
    contentType: string;
  }) {
    super(
      `Preview unavailable: content is ${formatBytes(params.size)}, above the inline preview limit of ${formatBytes(params.limit)}.`,
    );
    this.name = "IpfsContentTooLargeError";
    this.gateway = params.gateway;
    this.url = params.url;
    this.size = params.size;
    this.limit = params.limit;
    this.contentType = params.contentType;
  }
}

async function readResponseBlob(params: {
  response: Response;
  gateway: string;
  url: string;
  maxBytes?: number;
}): Promise<{ blob: Blob; contentType: string; size: number }> {
  const { response, gateway, url, maxBytes } = params;
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const declaredSize = Number(response.headers.get("content-length") ?? "");
  if (maxBytes !== undefined && Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await cancelResponseBody(response);
    throw new IpfsContentTooLargeError({
      gateway,
      url,
      size: declaredSize,
      limit: maxBytes,
      contentType,
    });
  }

  if (!response.body) {
    const blob = await response.blob();
    if (maxBytes !== undefined && blob.size > maxBytes) {
      throw new IpfsContentTooLargeError({
        gateway,
        url,
        size: blob.size,
        limit: maxBytes,
        contentType,
      });
    }

    return { blob, contentType, size: blob.size };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (maxBytes !== undefined && totalBytes > maxBytes) {
        throw new IpfsContentTooLargeError({
          gateway,
          url,
          size: totalBytes,
          limit: maxBytes,
          contentType,
        });
      }

      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // best-effort cancellation
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const blobParts: BlobPart[] = chunks.map((chunk) => new Uint8Array(chunk));

  return {
    blob: new Blob(blobParts, { type: contentType }),
    contentType,
    size: totalBytes,
  };
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch (error) {
    console.warn("[ipfs] Response body cancel failed:", error);
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
    const { signal, cleanup } = createRequestSignal(timeoutMs);

    try {
      const headResponse = await fetch(url, createFetchOptions(signal, "HEAD"));
      lastResolvedUrl = headResponse.url || url;
      lastStatusCode = headResponse.status;

      if (isResolvableStatus(headResponse.status)) {
        cleanup();
        return {
          cid,
          gateway: gatewayBaseUrl,
          url: lastResolvedUrl,
          resolvable: true,
          statusCode: headResponse.status,
        };
      }

      if (headResponse.status !== 405 && headResponse.status !== 501) {
        cleanup();
        continue;
      }
    } catch (error) {
      lastErrorMessage = formatErrorMessage(error);
    }

    try {
      const getResponse = await fetch(url, createFetchOptions(signal, "GET"));
      lastResolvedUrl = getResponse.url || url;
      lastStatusCode = getResponse.status;

      if (isResolvableStatus(getResponse.status)) {
        await cancelResponseBody(getResponse);
        cleanup();
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
    } finally {
      cleanup();
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

export async function fetchCidFromP2P(
  cidString: string,
  options: FetchCidOptions = {},
): Promise<HeliaContentFetchResult> {
  const heliaClient = getSharedHeliaClient();
  const { signal, cleanup } = createRequestSignal(
    options.timeoutMs ?? P2P_FETCH_TIMEOUT_MS,
    options.signal,
  );

  try {
    return await heliaClient.fetchContent(cidString, {
      signal,
      maxBytes: options.maxBytes,
    });
  } finally {
    cleanup();
  }
}

export async function verifyCidViaP2P(cidString: string): Promise<boolean> {
  const heliaClient = getSharedHeliaClient();
  const { signal, cleanup } = createRequestSignal(P2P_FETCH_TIMEOUT_MS);

  try {
    return await heliaClient.verifyCid(cidString, { signal });
  } finally {
    cleanup();
  }
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
  } catch (error) {
    console.warn("[ipfs] P2P verification failed, falling back to gateways:", error);
  }

  const gatewayList = gateways.length > 0 ? gateways : IPFS_GATEWAYS;

  const racePromises = gatewayList.map(async (gateway) => {
    const result = await verifyGatewayCandidate(cid, gateway, timeoutMs);
    if (result.resolvable) {
      return result;
    }
    throw result;
  });

  try {
    return await Promise.any(racePromises);
  } catch (aggregateError) {
    const errors = aggregateError instanceof AggregateError ? aggregateError.errors : [];
    const lastResult = errors[errors.length - 1] as CidVerificationResult | undefined;

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
}

async function fetchCidFromSingleGateway(
  cid: string,
  gateway: string,
  options: FetchCidOptions,
): Promise<ResolvedIpfsContent> {
  const timeoutMs = options.timeoutMs ?? GATEWAY_FETCH_TIMEOUT_MS;
  const candidateUrls = getGatewayCandidateUrls(gateway, cid);

  for (const url of candidateUrls) {
    const { signal, cleanup } = createRequestSignal(timeoutMs, options.signal);

    try {
      const response = await fetch(url, createFetchOptions(signal));
      if (response.ok) {
        const resolvedUrl = response.url || url;
        const { blob, contentType, size } = await readResponseBlob({
          response,
          gateway,
          url: resolvedUrl,
          maxBytes: options.maxBytes,
        });

        cleanup();
        return {
          gateway,
          url: resolvedUrl,
          blob,
          contentType,
          size,
        };
      }
      await cancelResponseBody(response);
      cleanup();
    } catch (error) {
      cleanup();
      if (error instanceof IpfsContentTooLargeError) {
        throw error;
      }
      console.warn(`[ipfs] Gateway ${gateway} failed:`, error);
    }
  }

  throw new Error(`Gateway ${gateway} failed for ${cid}`);
}

export async function fetchCidFromGateways(
  cid: string,
  options: FetchCidOptions = {},
): Promise<ResolvedIpfsContent> {
  const gatewayList =
    options.gateways && options.gateways.length > 0 ? options.gateways : IPFS_GATEWAYS;
  const gatewayControllers = gatewayList.map(() => new AbortController());

  const abortAllGateways = () => {
    for (const controller of gatewayControllers) {
      controller.abort(new Error("A faster gateway response is already in use"));
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortAllGateways();
    } else {
      options.signal.addEventListener("abort", abortAllGateways, { once: true });
    }
  }

  try {
    const result = await Promise.any(
      gatewayList.map((gateway, index) =>
        fetchCidFromSingleGateway(cid, gateway, {
          timeoutMs: options.timeoutMs,
          maxBytes: options.maxBytes,
          signal: gatewayControllers[index]!.signal,
        }),
      ),
    );
    abortAllGateways();
    return result;
  } catch (aggregateError) {
    abortAllGateways();
    const errors =
      aggregateError instanceof AggregateError ? aggregateError.errors : [aggregateError];
    const tooLargeError = errors.find((error) => error instanceof IpfsContentTooLargeError);
    if (tooLargeError instanceof IpfsContentTooLargeError) {
      throw tooLargeError;
    }

    const message = errors.map(formatErrorMessage).pop() ?? "";
    throw new Error(`Content not found on IPFS gateways. ${message}`.trim());
  } finally {
    options.signal?.removeEventListener("abort", abortAllGateways);
  }
}
