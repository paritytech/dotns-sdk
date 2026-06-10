// dot.li serves a name as a gateway subdomain: strip the .dot TLD and append the
// gateway domain (mainnet dot.li, Paseo testnet paseo.li). alice.dot is reachable
// at alice.dot.li and alice.paseo.li.
const DOTLI_GATEWAYS = ["dot.li", "paseo.li"] as const;

export function dotliViewUrls(name: string): string[] {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/\.dot$/, "");
  return DOTLI_GATEWAYS.map((gateway) => `https://${stem}.${gateway}`);
}
