import { connectDotns } from "./00_shared";
import { setContentHash } from "../commands/contentHash";
import { resolveTransferRecipient, transferName } from "../cli/transfer";
import { validateDomainLabel } from "../utils/validation";
import { formatDomainName } from "../core/naming";

async function main() {
  const { ctx } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  validateDomainLabel(label);

  const cid = process.env.DOTNS_CID ?? "bafybeigdyr...replace_me";
  const domain = await formatDomainName(ctx, label);
  await setContentHash(ctx, label, cid);
  console.log("Set content hash:", `${domain} -> ${cid}`);

  const transferTo = process.env.DOTNS_TO;
  if (!transferTo) return;

  const recipient = await resolveTransferRecipient(ctx, transferTo);
  const result = await transferName(ctx, label, recipient);

  console.log("Transfer tx:", result.txHash);
  console.log("From:       ", result.from);
  console.log("To:         ", result.to);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
