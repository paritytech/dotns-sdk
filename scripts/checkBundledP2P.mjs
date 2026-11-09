#!/usr/bin/env node
// Fails when the built CLI bundle cannot load its P2P stack under Node, the way
// 1.1.0 failed with `Cannot find module '../../package.json'`. The P2P check
// loads the stack before it parses the CID, so an invalid CID on polkadot (which
// has no gateway) exercises the load offline and returns at once.
//
// Run from the package directory after the build: `node ../../scripts/checkBundledP2P.mjs`.

import { execFileSync } from "node:child_process";
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

function runBundledVerify() {
  try {
    return execFileSync(
      process.execPath,
      ["dist/cli.js", "bulletin", "verify", INVALID_CID, "--env", "polkadot", "--json"],
      { encoding: "utf8", timeout: 20_000 },
    );
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.length > 0) return error.stdout;
    throw error;
  }
}

const expected = `p2p/bitswap: ${readParseError()}`;
const result = JSON.parse(runBundledVerify());
const p2p = result.gateways?.[0];
const actual = `${p2p?.gateway}: ${p2p?.errorMessage}`;

if (actual !== expected) {
  console.error("dist/cli.js: the P2P check did not reach CID parsing.");
  console.error(`  expected: ${expected}`);
  console.error(`  actual:   ${actual}`);
  process.exit(1);
}

console.log("dist/cli.js: the P2P stack loads under Node.");
