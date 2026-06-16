import { connectDotns } from "./00_shared";
import { validateGovernanceLabel } from "../utils/validation";
import { ProofOfPersonhoodStatus } from "../types/types";

import {
  classifyDomainName,
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

  const classification = await classifyDomainName(ctx, label);
  if (classification.requiredStatus !== ProofOfPersonhoodStatus.Reserved) {
    throw new Error(
      `Governance name must classify as Reserved; got ${ProofOfPersonhoodStatus[classification.requiredStatus]}`,
    );
  }

  await ensureDomainNotRegistered(ctx, label);

  const { commitment, registration } = await generateCommitment(ctx, label, {
    includeReverse: true,
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
