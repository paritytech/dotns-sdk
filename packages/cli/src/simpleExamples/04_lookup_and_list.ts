import { connectDotns } from "./00_shared";
import { performDomainLookup, listMyRegisteredNames } from "../commands/lookup";

async function main() {
  const { ctx } = await connectDotns();

  const name = process.env.DOTNS_NAME ?? "example.dot";

  console.log("Lookup:", name);
  console.log(await performDomainLookup(ctx, name));

  console.log("\nMy names:");
  const mine = await listMyRegisteredNames(ctx);
  console.log(mine.names);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
