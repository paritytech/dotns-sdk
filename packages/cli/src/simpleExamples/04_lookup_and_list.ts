import { connectDotns } from "./00_shared";
import { performDomainLookup, listMyRegisteredNames } from "../commands/lookup";

async function main() {
  const { clientWrapper, substrateAddress } = await connectDotns();

  const name = process.env.DOTNS_NAME ?? "example.dot";

  console.log("Lookup:", name);
  await performDomainLookup(name, substrateAddress, clientWrapper);

  console.log("\nMy names:");
  await listMyRegisteredNames(clientWrapper, substrateAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
