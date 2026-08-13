import { expect, test } from "bun:test";
import { DOTNS_ENVIRONMENTS } from "../../../src/utils/constants";

// The devnet environment tracks the Paseo Asset Hub deployment recorded in the
// dotns contracts repo at deployments/paseo-assethub/420420417.json (chain
// 420420417). These are the canonical live addresses; drift here silently points
// the CLI at retired contracts, so pin them explicitly. Update both together.
const CANONICAL_DEVNET_ADDRESSES = {
  DOTNS_REGISTRAR: "0x4f06E818Ba3d987704fd91cf3d868E4b019106Ab",
  DOTNS_REGISTRAR_CONTROLLER: "0xBdaA01bD1bA67d709F2b1fF286Da0d854977EA30",
  DOTNS_REGISTRY: "0xf34054fd76BbF85f216cf9908226D5f0A72E50CA",
  DOTNS_RESOLVER: "0xbd1165E549DF96F083c0A16f61590927bC187009",
  DOTNS_REVERSE_RESOLVER: "0xee3883d7eB60Ee9BCD7F3bcD8f2f05302A9Cc035",
  DOTNS_POP_RESOLVER: "0xDaC984884EcA8Fc44011f1D6C49B27828390A72B",
  DOTNS_CONTENT_RESOLVER: "0x7F74D7CD50f5a834270E2ad395a01b01891AB37d",
  STORE_FACTORY: "0x709A027F446a9e2a4BB9cb9a9c754435b19e32B7",
  // PopRules in the manifest.
  DOTNS_RULES: "0x747B456bE03aec0b42bd85C51513730FBD45DA31",
  DOTNS_POP_CONTROLLER: "0xCC932348606cc1f3318cADeC5A5Cd2CA447f8a4b",
  DOTNS_NAME_ESCROW: "0x4881Afb78e7C908cAe818168B926229D93376520",
  MULTICALL3: "0xB4468000abD87D3c56cbFBd153161223D7b109e5",
} as const;

test("devnet address book matches the canonical 420420417 deployment manifest", () => {
  expect(DOTNS_ENVIRONMENTS.devnet.contracts).toEqual(CANONICAL_DEVNET_ADDRESSES);
});
