# Bulletin Benchmark Reproduction

This directory contains the benchmark harnesses used for the Bulletin upload experiments in the DotNS CLI. The code in this folder isnt meant to be used for production but merely exists for experimentation purposes, as such code quality and and arent priority.

The main entry point for reproducing the published strategy comparison is:

- `packages/cli/benchmarks/strategy-benchmark.ts`

## Requirements

- Bun `1.2.6` or newer
- A Bulletin-authorised account
- Access to a Bulletin RPC endpoint

The examples below use the public Paseo Bulletin RPC endpoint:

- `wss://paseo-bulletin-rpc.polkadot.io`

## Running It

From `packages/cli`:

```bash
bun run benchmark:strategies --list-strategies
```

```bash
bun run benchmark:strategies \
  --input ../ui/dist \
  --key-uri //Alice \
  --strategies all \
  --timeout-minutes 300
```

From the repository root:

```bash
bun run --cwd packages/cli benchmark:strategies \
  --input ../ui/dist \
  --key-uri //Alice \
  --strategies all \
  --timeout-minutes 300
```

## Output

The harness writes JSON results to:

- `packages/cli/benchmarks/results`

The aggregate result file is written to:

- `packages/cli/benchmarks/results/strategy-benchmark-<timestamp>.json`

Each worker also writes a per-strategy JSON file alongside the aggregate file.

## Authentication

The harness supports the same auth sources as the CLI:

- `--key-uri <uri>`
- `--mnemonic <phrase>`
- `--account <name>` with `--password <password>`
- `--keystore-path <path>`

Examples:

```bash
bun run benchmark:strategies \
  --input ../ui/dist \
  --key-uri //Alice \
  --strategies waves-4
```

```bash
bun run benchmark:strategies \
  --input ../ui/dist \
  --account alice \
  --password 123456 \
  --keystore-path /path/to/keystore \
  --strategies all
```

## Strategy Set

The article speaks about eight approaches. The results table split the wave-based approach into multiple concrete concurrency rows, so `all` expands to every published row:

| Strategy name | Meaning |
|---|---|
| `sequential-1` | Submit one watched store transaction at a time and wait for inclusion before sending the next block. |
| `waves-4` | Submit blocks in waves of `4` with `Promise.all`, then wait for the whole wave to settle. |
| `waves-16` | Same as `waves-4`, but with `16` watched submissions per wave. |
| `waves-64` | Same as `waves-4`, but with `64` watched submissions per wave. This is the stress case for node-side stability. |
| `pipeline-16` | Keep `16` watched submissions in flight as a sliding window instead of discrete waves. |
| `fire-and-forget-all` | Pre-assign nonces and submit all watched store transactions immediately, then settle them afterwards. |
| `batched-fire-and-forget-32` | Queue watched submissions in batches of `32` without waiting between batches. |
| `batch-all-4` | Wrap `4` store calls inside a single `Utility.batch_all` extrinsic and submit those batch extrinsics sequentially. |
| `chunks-2mb-waves-4` | Re-merkleise the input with a `2 MB` fixed-size importer chunker, then upload with four-wide watched waves. |

## Flags

| Flag | Meaning |
|---|---|
| `--input <path>` | Required file or directory to benchmark. |
| `--strategies <list>` | Comma-separated strategy names or `all`. |
| `--rpc <url>` | Bulletin RPC endpoint. Defaults to the public Paseo endpoint. |
| `--timeout-minutes <n>` | Per-strategy timeout. |
| `--import-chunk-size <bytes>` | Baseline importer chunk size. The `chunks-2mb-waves-4` row overrides this to `2 MB`. |
| `--output <path>` | Explicit aggregate JSON output path. |
| `--list-strategies` | Print the supported strategy names and exit. |
| `--help` | Print CLI help and exit. |

## Notes

- The harness uses isolated worker processes, one strategy at a time.
- The aggregate JSON captures status, elapsed time, completed blocks, throughput, transactions per second, reconnect count, errors, and memory usage.
- The public Bulletin RPC endpoint is a shared environment. Absolute timings can differ from the article’s representative run even when the overall pattern is similar.
- If you want to compare strategies, keep the input dataset and RPC endpoint constant across runs.

## Related Files

- Strategy harness: `packages/cli/benchmarks/strategy-benchmark.ts`
- Size benchmark harness: `packages/cli/benchmarks/benchmark.ts`