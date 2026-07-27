import { connectDotns } from "./00_shared";
import { validateGovernanceLabel } from "../utils/validation";
import { ProofOfPersonhoodStatus } from "../types/types";

import {
  tryClassifyDomainName,
  ensureDomainNotRegistered,
  generateCommitment,
  submitCommitment,
  waitForMinimumCommitmentAge,
  finalizeGovernanceRegistration,
  verifyDomainOwnership,
} from "../commands/register";

async function main() {
  const { ctx, evmAddress } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "test";

  validateGovernanceLabel(label);

  // null means PopRules refuses to classify this label shape at all. registerReserved
  // bypasses PopRules, so that is not a blocker — only a definite non-Reserved is.
  const classification = await tryClassifyDomainName(ctx, label);
  if (
    classification !== null &&
    classification.requiredStatus !== ProofOfPersonhoodStatus.Reserved
  ) {
    throw new Error(
      `Governance name must classify as Reserved; got ${ProofOfPersonhoodStatus[classification.requiredStatus]}`,
    );
  }

  await ensureDomainNotRegistered(ctx, label);

  const { commitment, registration } = await generateCommitment(ctx, label, {
    includeReverse: true,
    governance: true,
  });

  await submitCommitment(ctx, commitment);
  await waitForMinimumCommitmentAge(ctx, commitment);

  await finalizeGovernanceRegistration(ctx, registration);
  await verifyDomainOwnership(ctx, label, evmAddress);

  console.log("Governance registered:", `${label}.dot`);
  console.log("Owner:               ", evmAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
