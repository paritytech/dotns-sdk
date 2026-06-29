#!/usr/bin/env node
// Lints GitHub Actions workflows with actionlint, which runs in Docker.
//
// The Docker daemon is probed first with a bounded timeout so the command
// fails fast (a couple of seconds) with a clear message when Docker is not
// running, instead of `docker run` hanging on a long connect/pull. The probe
// uses Node's spawnSync timeout rather than a shell `timeout`, which is not
// installed on stock macOS.
//
// Run from the repository root: `node scripts/lintWorkflows.mjs`.

import { spawnSync } from "node:child_process";

const DAEMON_PROBE_TIMEOUT_MS = 3000;

const ACTIONLINT_ARGS = [
  "run",
  "--rm",
  "-e",
  "SHELLCHECK_OPTS=-e SC2129 -e SC2086 -e SC2193",
  "-v",
  `${process.cwd()}:/repo`,
  "--workdir",
  "/repo",
  "rhysd/actionlint:latest",
  "-color",
];

function isDockerDaemonRunning() {
  const probe = spawnSync("docker", ["info"], {
    stdio: "ignore",
    timeout: DAEMON_PROBE_TIMEOUT_MS,
  });
  return probe.status === 0;
}

function main() {
  if (!isDockerDaemonRunning()) {
    console.error(
      "lint:workflows: Docker daemon not running (required for actionlint).",
    );
    console.error(
      "Start Docker and retry, or commit with --no-verify to skip local hooks.",
    );
    process.exit(1);
  }

  const actionlint = spawnSync("docker", ACTIONLINT_ARGS, { stdio: "inherit" });
  process.exit(actionlint.status ?? 1);
}

main();
