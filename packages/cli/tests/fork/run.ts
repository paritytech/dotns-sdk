import path from "node:path";

// Starts a fresh Chopsticks fork of Polkadot Asset Hub, runs the fork tests against it
// and stops it. A fresh fork per run matters: the tests grant and register real names.
const CHOPSTICKS = "@acala-network/chopsticks@1.5.2";
const CONFIG = path.join(import.meta.dir, "polkadot-asset-hub.yml");
const READY_TIMEOUT_MS = 300_000;

const fork = Bun.spawn(["npx", "-y", CHOPSTICKS, "--config", CONFIG], {
  stdout: "pipe",
  stderr: "pipe",
});

const decoder = new TextDecoder();
let log = "";

async function waitForEndpoint(): Promise<string> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (const stream of [fork.stdout, fork.stderr]) {
    void (async () => {
      for await (const chunk of stream) log += decoder.decode(chunk);
    })();
  }
  while (Date.now() < deadline) {
    // CI forces colour output, so the address can carry ANSI escapes.
    const match = log.replace(/\x1b\[[0-9;]*m/g, "").match(/listening on .* and (ws:\/\/\S+)/);
    if (match) return match[1]!.replace("[::]", "localhost");
    if (fork.exitCode !== null) throw new Error(`Chopsticks exited early:\n${log}`);
    await Bun.sleep(500);
  }
  throw new Error(`Chopsticks did not start within ${READY_TIMEOUT_MS / 1000}s:\n${log}`);
}

let exitCode = 1;
try {
  const endpoint = await waitForEndpoint();
  console.log(`Fork ready at ${endpoint}`);
  const tests = Bun.spawn(
    [process.execPath, "test", "tests/fork", "--timeout", "900000", ...process.argv.slice(2)],
    {
      cwd: path.join(import.meta.dir, "../.."),
      env: { ...process.env, DOTNS_FORK_RPC: endpoint },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  exitCode = await tests.exited;
  if (exitCode !== 0) console.error(`Chopsticks log tail:\n${log.slice(-4_000)}`);
} finally {
  fork.kill();
}
process.exit(exitCode);
