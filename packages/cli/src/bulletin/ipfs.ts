import type { VerificationResult, BlockVerificationResult } from "../types/types";
import { formatErrorMessage } from "../utils/formatting";

async function loadHeliaClient() {
  const { getSharedHeliaClient } = await import("./heliaClient");
  return getSharedHeliaClient();
}

const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;
const FALLBACK_GATEWAYS: string[] = [
  "https://paseo-ipfs.polkadot.io",
  "https://dweb.link",
  "https://cloudflare-ipfs.com",
  "https://w3s.link",
  "https://ipfs.io",
];
const DEFAULT_VERIFICATION_GATEWAY = FALLBACK_GATEWAYS[0]!;

function isResolvableStatus(statusCode: number): boolean {
  return statusCode === 200;
}

async function safelyCancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Body may already be consumed or stream closed by the time we cancel
  }
}

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const candidateUrls = [
    `${gatewayBaseUrl}/ipfs/${contentCid}`,
    `${gatewayBaseUrl}/ipfs/${contentCid}/`,
  ];

  let lastError: string | undefined;

  for (const verificationUrl of candidateUrls) {
    try {
      const response = await fetch(verificationUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(VERIFICATION_TIMEOUT_MILLISECONDS),
      });

      if (isResolvableStatus(response.status)) {
        await safelyCancelBody(response);
        return {
          cid: contentCid,
          resolvable: true,
          gateway: gatewayBaseUrl,
          statusCode: response.status,
        };
      }

      lastError = `HTTP ${response.status} from ${verificationUrl}`;
      await safelyCancelBody(response);
    } catch (error) {
      lastError = formatErrorMessage(error);
    }
  }

  return {
    cid: contentCid,
    resolvable: false,
    gateway: gatewayBaseUrl,
    errorMessage: lastError ?? "Content not retrievable from gateway",
  };
}

export async function verifyMultipleCids(
  contentCids: string[],
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<BlockVerificationResult> {
  const resolvableBlocks: string[] = [];
  const missingBlocks: string[] = [];

  for (const contentCid of contentCids) {
    const verificationResult = await verifyCidResolution(contentCid, gatewayBaseUrl);

    if (verificationResult.resolvable) {
      resolvableBlocks.push(contentCid);
    } else {
      missingBlocks.push(contentCid);
    }
  }

  return {
    totalBlocks: contentCids.length,
    resolvableBlocks,
    missingBlocks,
    gateway: gatewayBaseUrl,
  };
}

export async function verifyCidWithMultipleGateways(
  contentCid: string,
  gatewayUrls: string[] = FALLBACK_GATEWAYS,
): Promise<Map<string, VerificationResult>> {
  const results = await Promise.all(
    gatewayUrls.map(async (gatewayUrl) => {
      const result = await verifyCidResolution(contentCid, gatewayUrl);
      return [gatewayUrl, result] as const;
    }),
  );

  return new Map(results);
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
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const p2pResult = await verifyCidViaP2P(contentCid);
  if (p2pResult.resolvable) {
    return p2pResult;
  }

  return verifyCidResolution(contentCid, gatewayBaseUrl);
}
