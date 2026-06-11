const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function socialHandle(
  value: string | null | undefined,
  platform: "x" | "github",
): string | null {
  if (!value) return null;
  const pattern = platform === "x" ? X_HANDLE : GITHUB_HANDLE;
  return pattern.test(value) ? value : null;
}
