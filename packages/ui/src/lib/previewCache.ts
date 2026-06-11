// Hand-off cache for the post-upload preview. After an upload the browser still
// holds the original file bytes, so navigating to /preview/<cid> shouldn't refetch
// anything — it should render what we already have. FileUpload stashes the blob
// here keyed by CID; PreviewView reads it before any network/host fetch.
//
// Single entry by design: we only ever need the most-recently-uploaded file, and
// capping at one bounds memory to a single (≤5 MB) blob. A cold load or shared
// link finds nothing here and falls through to the host-lookup path.

export type PreviewContent = {
  blob: Blob;
  contentType: string;
};

let entry: { cid: string; content: PreviewContent } | null = null;

export function setPreviewContent(cid: string, content: PreviewContent): void {
  entry = { cid, content };
}

export function getPreviewContent(cid: string): PreviewContent | null {
  return entry && entry.cid === cid ? entry.content : null;
}

export function clearPreviewContent(): void {
  entry = null;
}
