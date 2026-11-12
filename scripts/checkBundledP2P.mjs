#!/usr/bin/env node
// Fails when the built CLI bundle cannot load its P2P stack under Node. The P2P
// check loads the stack before it parses the CID, so an invalid CID on polkadot
// (which has no gateway) checks the load offline and returns at once.
//
// Run from the package directory after the build: `node ../../scripts/checkBundledP2P.mjs`.

import { spawnSync } from "node:child_process";
import { CID } from "multiformats/cid";

const INVALID_CID = "not-a-cid";

function readParseError() {
  try {
    CID.parse(INVALID_CID);
  } catch (error) {
    return error.message;
  }
  throw new Error(`'${INVALID_CID}' parsed as a CID`);
}

const { stdout } = spawnSync(
  process.execPath,
  [
    "dist/cli.js",
    "bulletin",
    "verify",
    INVALID_CID,
    "--env",
    "polkadot",
    "--json",
  ],
  { encoding: "utf8", timeout: 20_000 },
);

const expected = `p2p/bitswap: ${readParseError()}`;
const p2p = JSON.parse(stdout).gateways?.[0];
const actual = `${p2p?.gateway}: ${p2p?.errorMessage}`;

if (actual !== expected) {
  console.error("dist/cli.js: the P2P check failed before CID parsing.");
  console.error(`  expected: ${expected}`);
  console.error(`  actual:   ${actual}`);
  process.exit(1);
}

console.log("dist/cli.js: the P2P stack loads under Node.");
