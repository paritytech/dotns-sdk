import { connectDotns } from "./00_shared";
import { validateDomainLabel } from "../utils/validation";
import { ProofOfPersonhoodStatus } from "../types/types";

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
  setUserProofOfPersonhoodStatus,
} from "../commands/register";

function parsePoP(status?: string): ProofOfPersonhoodStatus {
  const s = (status ?? "none").toLowerCase();
  if (s === "none" || s === "nostatus") return ProofOfPersonhoodStatus.NoStatus;
  if (s === "lite" || s === "poplite") return ProofOfPersonhoodStatus.ProofOfPersonhoodLite;
  if (s === "full" || s === "popfull") return ProofOfPersonhoodStatus.ProofOfPersonhoodFull;
  throw new Error("Invalid status. Use none|lite|full");
}

async function main() {
  const { clientWrapper, substrateAddress, evmAddress, signer } = await connectDotns();

  const label = process.env.DOTNS_LABEL ?? "myname1234";
  const status = parsePoP(process.env.DOTNS_STATUS);
  const reverse = (process.env.DOTNS_REVERSE ?? "false").toLowerCase() === "true";

  validateDomainLabel(label);

  // Validate classification + eligibility rules (throws if invalid under your policy).
  await classifyDomainName(clientWrapper, substrateAddress, label);

  // If your flow uses a contract-level PoP status to price/eligibility, set it here.
  await setUserProofOfPersonhoodStatus(
    clientWrapper,
    substrateAddress,
    signer,
    evmAddress,
    label,
    status,
  );

  await ensureDomainNotRegistered(clientWrapper, substrateAddress, label);

  const { commitment, registration } = await generateCommitment(
    clientWrapper,
    substrateAddress,
    label,
    evmAddress,
    reverse,
  );

  await submitCommitment(clientWrapper, substrateAddress, signer, commitment);
  await waitForMinimumCommitmentAge(clientWrapper, substrateAddress);

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
