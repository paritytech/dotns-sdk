// Derive the DotNS identifier the host bound this product under, from the URL.
//
// The host's transaction gate enforces `account[0] === identifier` strictly:
// the value we send as `dotNsIdentifier` must match what the host derived from
// the running URL, or it refuses to issue/sign for the product account. That
// identifier is a canonical `<name>.dot` (or `host:port` on localhost), but the
// URL we run under is not always that shape — a name is served directly in
// Polkadot Desktop yet reached through a gateway subdomain in a browser
// (alice.dot → alice.paseo.li / alice.dot.li, see lib/dotli.ts). Passing
// `window.location.host` verbatim works in Desktop (host === identifier) but
// breaks in the browser (gateway host !== identifier).
//
// Nothing here is product-specific — the identifier is derived entirely from
// the host, so it works whatever name this UI is deployed under.
//
// Cases:
//   - localhost / 127.0.0.1 / *.localhost → host (with :port if any)
//   - <name>.dot                          → use as-is
//   - <sub>.<name>.dot                    → <name>.dot (registrable root)
//   - <name>.<root>.<tld>                 → <name>.dot (e.g. dotns.paseo.li)
//   - <sub>.app.<root>.<tld>              → <sub>.dot (strip the `app` subdomain)
//   - anything else                       → host verbatim (let the host decide)
export function deriveSelfDotNs(input: { hostname: string; host: string }): string {
  const hostname = input.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1") {
    return input.host.toLowerCase();
  }
  if (hostname.endsWith(".dot")) {
    const segments = hostname.split(".");
    return segments.length > 2 ? segments.slice(-2).join(".") : hostname;
  }
  const segments = hostname.split(".");
  if (segments.length >= 3) {
    let label = segments.slice(0, -2);
    // drop the `app` infra subdomain preview hosts insert (<name>.app.<root> → <name>)
    if (label[label.length - 1] === "app") label = label.slice(0, -1);
    if (label.length > 0) return `${label.join(".")}.dot`;
  }
  return input.host.toLowerCase();
}

export function getSelfDotNs(): string {
  return deriveSelfDotNs({
    hostname: window.location.hostname,
    host: window.location.host,
  });
}
