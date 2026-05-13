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
  displayDeployedStore,
} from "../commands/register";

async function main() {
  const { clientWrapper, substrateAddress, evmAddress, signer } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  const reverse = (process.env.DOTNS_REVERSE ?? "false").toLowerCase() === "true";

  validateDomainLabel(label);

  // Validate classification + eligibility rules (throws if invalid under your policy).
  await classifyDomainName(clientWrapper, substrateAddress, label);

  await ensureDomainNotRegistered(clientWrapper, substrateAddress, label);

  const { commitment, registration } = await generateCommitment(
    clientWrapper,
    substrateAddress,
    label,
    evmAddress,
    reverse,
  );

  await submitCommitment(clientWrapper, substrateAddress, signer, commitment);
  await waitForMinimumCommitmentAge(clientWrapper, substrateAddress, commitment);

  const pricing = await getPriceAndValidateEligibility(
    clientWrapper,
    substrateAddress,
    label,
    evmAddress,
  );

  await finalizeRegularRegistration(
    clientWrapper,
    substrateAddress,
    signer,
    registration,
    pricing.priceWei,
  );

  await verifyDomainOwnership(clientWrapper, substrateAddress, label, evmAddress);
  await displayDeployedStore(clientWrapper, substrateAddress, evmAddress);

  console.log("Registered:", `${label}.dot`);
  console.log("Owner:     ", evmAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
