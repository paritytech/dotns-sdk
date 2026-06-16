import { connectDotns } from "./00_shared";
import { setContentHash } from "../commands/contentHash";
import { resolveTransferRecipient, transferName } from "../cli/transfer";
import { validateDomainLabel } from "../utils/validation";

async function main() {
  const { ctx } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  validateDomainLabel(label);

  const cid = process.env.DOTNS_CID ?? "bafybeigdyr...replace_me";
  await setContentHash(ctx, `${label}.dot`, cid);
  console.log("Set content hash:", `${label}.dot -> ${cid}`);

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
