#!/usr/bin/env node
// Lints GitHub Actions workflows with actionlint. A locally installed
// `actionlint` binary is preferred so the check does not require Docker; when no
// binary is present it falls back to the actionlint Docker image.
//
// The Docker daemon is probed with a bounded timeout so the fallback fails fast
// with a clear message when Docker is not running, instead of `docker run`
// hanging on a long connect/pull. The probe uses Node's spawnSync timeout rather
// than a shell `timeout`, which is not installed on stock macOS.
//
// Run from the repository root: `node scripts/lintWorkflows.mjs`.

import { spawnSync } from "node:child_process";

const DAEMON_PROBE_TIMEOUT_MS = 3000;
const SHELLCHECK_OPTS = "-e SC2129 -e SC2086 -e SC2193";

const DOCKER_ACTIONLINT_ARGS = [
  "run",
  "--rm",
  "-e",
  `SHELLCHECK_OPTS=${SHELLCHECK_OPTS}`,
  "-v",
  `${process.cwd()}:/repo`,
  "--workdir",
  "/repo",
  "rhysd/actionlint:latest",
  "-color",
];

function hasLocalActionlint() {
  const probe = spawnSync("actionlint", ["-version"], { stdio: "ignore" });
  return probe.status === 0;
}

function isDockerDaemonRunning() {
  const probe = spawnSync("docker", ["info"], {
    stdio: "ignore",
    timeout: DAEMON_PROBE_TIMEOUT_MS,
  });
  return probe.status === 0;
}

function main() {
  if (hasLocalActionlint()) {
    const result = spawnSync("actionlint", ["-color"], {
      stdio: "inherit",
      env: { ...process.env, SHELLCHECK_OPTS },
    });
    process.exit(result.status ?? 1);
  }

  if (!isDockerDaemonRunning()) {
    console.error(
      "lint:workflows: no local actionlint binary and Docker daemon not running.",
    );
    console.error(
      "Install actionlint (e.g. `brew install actionlint`) or start Docker, then retry.",
    );
    process.exit(1);
  }

  const result = spawnSync("docker", DOCKER_ACTIONLINT_ARGS, {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

main();
