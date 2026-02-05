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
  const { clientWrapper, substrateAddress, evmAddress, signer } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "test";

  validateGovernanceLabel(label);

  const classification = await classifyDomainName(clientWrapper, substrateAddress, label);
  if (classification.requiredStatus !== ProofOfPersonhoodStatus.Reserved) {
    throw new Error(
      `Governance name must classify as Reserved; got ${ProofOfPersonhoodStatus[classification.requiredStatus]}`,
    );
  }

  await ensureDomainNotRegistered(clientWrapper, substrateAddress, label);

  const { commitment, registration } = await generateCommitment(
    clientWrapper,
    substrateAddress,
    label,
    evmAddress,
    true,
  );

  await submitCommitment(clientWrapper, substrateAddress, signer, commitment);
  await waitForMinimumCommitmentAge(clientWrapper, substrateAddress);

  await finalizeGovernanceRegistration(clientWrapper, substrateAddress, signer, registration);
  await verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress);

  console.log("Governance registered:", `${label}.dot`);
  console.log("Owner:               ", evmAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
