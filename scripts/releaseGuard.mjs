// One-package-per-change guard. A pull request may change the CLI or the UI, not
// both, and the changed package's version must lead its latest release tag. A
// release tag's version must match that package's package.json. CLI releases use
// `v*` tags; UI releases use `ui-v*`.
//
// Two entry points share one set of primitives (no duplicated git or semver
// logic between the PR check and the release check):
//   releaseGuard.mjs pr --base <ref> --head <ref>
//   releaseGuard.mjs release --tag <tag>
//
// Runs under bun or node. Exits non-zero with a `::error::` line on violation so
// it fails a GitHub Actions job directly.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The releasable packages, each with its own tag namespace. `tagGlob` lists that
// namespace's tags; `tagPrefix` is stripped to recover the semver version.
const PACKAGES = [
  { id: "cli", dir: "packages/cli", tagPrefix: "v", tagGlob: "v[0-9]*" },
  { id: "ui", dir: "packages/ui", tagPrefix: "ui-v", tagGlob: "ui-v[0-9]*" },
];

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Package ids whose directory a set of changed files touches. Shared tooling
// (root, scripts, .github) belongs to no package and is ignored.
function packagesTouched(files) {
  const touched = new Set();
  for (const file of files) {
    for (const pkg of PACKAGES) {
      if (file.startsWith(`${pkg.dir}/`)) touched.add(pkg.id);
    }
  }
  return touched;
}

function changedFiles(diffArgs) {
  const out = git(["diff", "--name-only", ...diffArgs]);
  return out
    ? out
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function packageVersion(dir) {
  return JSON.parse(readFileSync(`${dir}/package.json`, "utf8")).version;
}

// Semver ordering restricted to what release versions use: numeric core plus an
// optional prerelease tag, which sorts below the same core release.
function compareVersions(a, b) {
  const parse = (value) => {
    const [core, prerelease] = String(value).split("-");
    return { nums: core.split(".").map(Number), prerelease };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left.nums[i] || 0) - (right.nums[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && right.prerelease) {
    return left.prerelease < right.prerelease
      ? -1
      : left.prerelease > right.prerelease
        ? 1
        : 0;
  }
  return 0;
}

// Released versions for a package, newest first. Empty when nothing is tagged yet.
function releasedVersions(pkg) {
  const raw = git(["tag", "-l", pkg.tagGlob]);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(pkg.tagPrefix.length))
    .sort(compareVersions)
    .reverse();
}

function packageForTag(tag) {
  const uiPackage = PACKAGES.find((pkg) => pkg.id === "ui");
  if (tag.startsWith(uiPackage.tagPrefix)) return uiPackage;
  if (/^v[0-9]/.test(tag)) return PACKAGES.find((pkg) => pkg.id === "cli");
  fail(
    `Tag "${tag}" does not match a package namespace (expected v* for cli or ui-v* for ui).`,
  );
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[i + 1];
  }
  return flags;
}

// PR gate: the change may touch at most one package, and that package's version
// must already lead its latest release tag.
function checkPullRequest(flags) {
  if (!flags.base || !flags.head)
    fail("pr mode requires --base <ref> --head <ref>.");
  const touched = packagesTouched(
    changedFiles([`${flags.base}...${flags.head}`]),
  );

  if (touched.size === 0) {
    console.log("No CLI or UI changes; release scope check not applicable.");
    return;
  }
  if (touched.size > 1) {
    fail(
      "CLI and UI changed in the same PR. Each release tag maps to a single package " +
        "version, so split the CLI and UI changes into separate PRs.",
    );
  }

  const pkg = PACKAGES.find((candidate) => touched.has(candidate.id));
  const version = packageVersion(pkg.dir);
  const [latest] = releasedVersions(pkg);
  if (latest && compareVersions(version, latest) <= 0) {
    fail(
      `${pkg.dir}/package.json version ${version} must be greater than the latest ` +
        `released ${pkg.id} version ${latest}. Bump it in this PR.`,
    );
  }
  console.log(
    `OK: ${pkg.id} change, version ${version}${latest ? ` > ${latest}` : ""}.`,
  );
}

// Release gate: the tag names one package, and its version must equal that
// package's package.json. The one-package-per-change rule is enforced at PR time
// (checkPullRequest); a release range on main naturally spans both packages'
// history, so it is not a signal here, and a `v*` release only ever builds and
// publishes the CLI regardless.
function checkRelease(flags) {
  if (!flags.tag) fail("release mode requires --tag <tag>.");
  const pkg = packageForTag(flags.tag);
  const tagVersion = flags.tag.slice(pkg.tagPrefix.length);

  const version = packageVersion(pkg.dir);
  if (tagVersion !== version) {
    fail(
      `Tag ${flags.tag} declares ${pkg.id} ${tagVersion}, but ${pkg.dir}/package.json is ${version}.`,
    );
  }
  console.log(
    `OK: ${pkg.id} release ${flags.tag} matches ${pkg.dir}/package.json ${version}.`,
  );
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (mode === "pr") return checkPullRequest(flags);
  if (mode === "release") return checkRelease(flags);
  fail(
    "Usage: releaseGuard.mjs <pr --base <ref> --head <ref> | release --tag <tag>>",
  );
}

main();
