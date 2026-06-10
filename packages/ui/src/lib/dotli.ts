// dot.li viewing URLs for a .dot name: the production host and the Paseo
// testnet host. A name with a content hash set is reachable at `<base>/<name>.dot`
// on both, so callers show both options together.
const DOTLI_BASE_URLS = ["https://dot.li", "https://paseo.dot.li"] as const;

export function dotliViewUrls(name: string): string[] {
  const normalised = name.trim().toLowerCase();
  const fqdn = normalised.endsWith(".dot") ? normalised : `${normalised}.dot`;
  return DOTLI_BASE_URLS.map((base) => `${base}/${fqdn}`);
}
