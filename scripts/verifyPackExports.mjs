#!/usr/bin/env node
// Verifies the packed npm tarball ships every file that package.json promises
// through its `bin` and `exports` maps.
//
// Guards against the class of bug where a partial build (e.g. the CLI bundle
// without the library build) is packed and published, leaving declared subpath
// exports pointing at files absent from the tarball.
//
// The required-file list is derived from package.json itself, so any export
// added later is covered without touching this script.
//
// Run from the package directory: `node ../../scripts/verifyPackExports.mjs`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PACKAGE_FILE = "package.json";

function collectDeclaredFiles(packageJson) {
  const declared = new Set();

  const addPath = (value) => {
    if (typeof value === "string" && value.startsWith("./")) {
      declared.add(value.slice(2));
    }
  };

  const walk = (value) => {
    if (typeof value === "string") {
      addPath(value);
    } else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) walk(entry);
    }
  };

  walk(packageJson.bin);
  walk(packageJson.exports);

  return [...declared];
}

function listPackedFiles() {
  // --ignore-scripts keeps lifecycle output (e.g. codegen) out of the JSON.
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { encoding: "utf8" },
  );
  return new Set(JSON.parse(output)[0].files.map((file) => file.path));
}

function main() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_FILE, "utf8"));
  const declaredFiles = collectDeclaredFiles(packageJson);
  const packedFiles = listPackedFiles();

  const missing = declaredFiles.filter((file) => !packedFiles.has(file));

  if (missing.length > 0) {
    console.error(
      `${packageJson.name}: package.json declares files that the tarball does not ship:`,
    );
    for (const file of missing) console.error(`  - ${file}`);
    console.error("Run the full build before packing.");
    process.exit(1);
  }

  console.log(
    `${packageJson.name}: all ${declaredFiles.length} declared entry files are packed.`,
  );
}

main();
