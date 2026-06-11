import { formatBytes } from "@/lib/bulletinUpload";

// Content retrieval moved host-first (see hostPreimage.ts): the gateway race and
// libp2p/Helia client were removed so the papp never reaches a third-party domain
// — nothing for the sandbox to prompt on. What remains here is shared by the
// host path: the inline-preview size cap and the "too large" error it throws.

export const MAX_INLINE_PREVIEW_BYTES = 25 * 1024 * 1024;

export type CidVerificationResult = {
  cid: string;
  gateway: string;
  url: string;
  resolvable: boolean;
  statusCode?: number;
  errorMessage?: string;
};

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
