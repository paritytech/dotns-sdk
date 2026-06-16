import { connectDotns } from "./00_shared";
import { validateDomainLabel } from "../utils/validation";

import {
  classifyDomainName,
  ensureDomainNotRegistered,
  generateCommitment,
  submitCommitment,
  waitForMinimumCommitmentAge,
  getPriceAndValidateEligibility,
  finalizeRegularRegistration,
  verifyDomainOwnership,
  ensureLabelStoreReady,
} from "../commands/register";

async function main() {
  const { ctx, evmAddress } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  const includeReverse = (process.env.DOTNS_REVERSE ?? "false").toLowerCase() === "true";

  validateDomainLabel(label);

  await classifyDomainName(ctx, label);
  await ensureDomainNotRegistered(ctx, label);

  const { commitment, registration } = await generateCommitment(ctx, label, { includeReverse });

  await submitCommitment(ctx, commitment);
  await waitForMinimumCommitmentAge(ctx, commitment);

  const pricing = await getPriceAndValidateEligibility(ctx, label, evmAddress);
  await finalizeRegularRegistration(ctx, registration, pricing.priceWei);

  await verifyDomainOwnership(ctx, label, evmAddress);
  await ensureLabelStoreReady(ctx, evmAddress);

  console.log("Registered:", `${label}.dot`);
  console.log("Owner:     ", evmAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
