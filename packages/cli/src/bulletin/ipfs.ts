import type { VerificationResult, BlockVerificationResult } from "../types/types";
import { formatErrorMessage } from "../utils/formatting";
async function loadHeliaClient() {
  const { getSharedHeliaClient } = await import("./heliaClient");
  return getSharedHeliaClient();
}

const DEFAULT_VERIFICATION_GATEWAY = "https://paseo-ipfs.polkadot.io";
const VERIFICATION_TIMEOUT_MILLISECONDS = 30000;

export async function verifyCidResolution(
  contentCid: string,
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const verificationUrl = `${gatewayBaseUrl}/ipfs/${contentCid}`;

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
  gatewayUrls: string[] = [
    "https://paseo-ipfs.polkadot.io",
    "https://dweb.link",
    "https://cloudflare-ipfs.com",
    "https://w3s.link",
  ],
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
  gatewayBaseUrl: string = DEFAULT_VERIFICATION_GATEWAY,
): Promise<VerificationResult> {
  const p2pResult = await verifyCidViaP2P(contentCid);
  if (p2pResult.resolvable) {
    return p2pResult;
  }

  return verifyCidResolution(contentCid, gatewayBaseUrl);
}
