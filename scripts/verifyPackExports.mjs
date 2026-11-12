#!/usr/bin/env node
// Verifies the packed npm tarball ships every file that package.json promises
// through its `bin` and `exports` maps, and every file its type declarations
// import by relative path.
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
import path from "node:path";

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

// `npm pack` runs the `prepare` lifecycle script (codegen) whose output lands
// on stdout before the JSON, and --ignore-scripts is not honoured everywhere,
// so extract the trailing JSON array rather than parsing the whole stream.
function extractJsonArray(output) {
  for (
    let start = output.indexOf("[");
    start !== -1;
    start = output.indexOf("[", start + 1)
  ) {
    try {
      return JSON.parse(output.slice(start));
    } catch {
      // Not the start of the JSON array; keep scanning.
    }
  }
  throw new Error("could not locate JSON array in `npm pack` output");
}

function listPackedFiles() {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  return new Set(extractJsonArray(output)[0].files.map((file) => file.path));
}

const RELATIVE_SPECIFIER =
  /(?:from\s+|import\s*\(\s*)["'](\.{1,2}[/][^"']*)["']/g;

// The declaration files a relative specifier in `file` can resolve to.
function listDeclarationCandidates(file, specifier) {
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(file), specifier),
  );
  const base = target.replace(/\.(m|c)?js$/, "");
  return [
    target,
    `${base}.d.ts`,
    `${base}.d.mts`,
    `${base}.d.cts`,
    `${base}/index.d.ts`,
  ];
}

function findUnshippedTypeImports(packedFiles) {
  const problems = [];
  for (const file of packedFiles) {
    if (!/\.d\.(m|c)?ts$/.test(file)) continue;
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(
      RELATIVE_SPECIFIER,
    )) {
      const candidates = listDeclarationCandidates(file, specifier);
      if (!candidates.some((candidate) => packedFiles.has(candidate))) {
        problems.push(`${file} imports ${specifier}`);
      }
    }
  }
  return problems;
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

  const unshippedImports = findUnshippedTypeImports(packedFiles);
  if (unshippedImports.length > 0) {
    console.error(
      `${packageJson.name}: type declarations import files that the tarball does not ship:`,
    );
    for (const problem of unshippedImports) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(
    `${packageJson.name}: all ${declaredFiles.length} declared entry files are packed, and every type import resolves inside the package.`,
  );
}

main();
