// A single UI build is deployed to every per-network gateway (dot.li, paseo.li,
// dev-dot.li), so a name's view URL must point at whichever gateway the app is
// served from to stay on the running app's network.
const FALLBACK_DOTLI_GATEWAY = "dot.li";

function gatewayFromHost(host: string): string {
  const firstDotIndex = host.indexOf(".");
  const isGatewayHost = firstDotIndex !== -1 && host.endsWith(".li");
  return isGatewayHost ? host.slice(firstDotIndex + 1) : FALLBACK_DOTLI_GATEWAY;
}

export function dotliViewUrls(name: string): string[] {
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/\.dot$/, "");
  return [`https://${stem}.${gatewayFromHost(host)}`];
}
