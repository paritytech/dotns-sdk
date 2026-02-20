# DotNS Deploy Example

A minimal static site deployed to Polkadot via DotNS.

This example demonstrates using the reusable `deploy.yml` workflow from `dotns-sdk` to upload a static site to the Bulletin chain and bind it to a `.dot` domain.

## How it works

The reusable workflow handles everything: Bulletin storage, subname registration, and contenthash binding. The only thing you provide is a build artifact and a mnemonic.

- **Production** (push to `main`): uploads to Bulletin → sets contenthash on `my-app.dot`
- **Preview** (pull request): uploads to Bulletin → registers subname → sets contenthash on `pr42.my-app.dot`

See `workflows/` for example workflow files covering different patterns.

## Setup

1. **Add your mnemonic** as a repository secret named `DOTNS_MNEMONIC`
2. **Copy a workflow** from `workflows/` into your repo's `.github/workflows/`
3. **Push to main** or open a PR

Set `register-base: true` if you want the workflow to register the base domain automatically. Otherwise, register it beforehand via the CLI or at https://dotns.paseo.li.

## Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `dotns-mnemonic` | Yes | BIP39 mnemonic for DotNS on-chain operations (register, contenthash) |
| `bulletin-mnemonic` | No | BIP39 mnemonic for Bulletin uploads (defaults to `//Alice` dev seed) |

## Workflow inputs

All inputs accepted by the reusable `deploy.yml` workflow:

| Input | Default | Description |
|-------|---------|-------------|
| `basename` | *(required)* | Base domain without `.dot` |
| `artifact-name` | *(required)* | Name of the uploaded build artifact |
| `mode` | `preview` | `preview` (subname deploy) or `production` (basename deploy) |
| `subname-format` | `pr-number` | `pr-number`, `branch`, or `sha-short` (ignored in production mode) |
| `subname-suffix` | | Optional suffix to avoid store key collisions across base domains |
| `register-base` | `false` | Register base domain if not already owned |
| `key-uri` | | Substrate key URI for dev/test (e.g. `//Alice`) |
| `bulletin-rpc` | CLI default | Bulletin chain WebSocket RPC endpoint override |
| `rpc` | CLI default | DotNS chain WebSocket RPC endpoint override |
| `parallel` | `true` | Upload directory blocks in parallel |
| `upload-concurrency` | `15` | Number of parallel block uploads |
| `skip-cache` | `false` | Skip deployment cache and force re-upload |
| `max-retries` | `3` | Max retry attempts per step for transient RPC failures |
| `retry-delay` | `15` | Seconds to wait between retries |

## Project structure

```
examples/deploy/site/
├── index.html                    # Static site (single file)
├── preview.yml                   # Minimal PR-only preview
├── workflows/
│   ├── deploy.yml                # Production deploy (push to main)
│   ├── preview.yml               # PR previews + production on merge
│   ├── branch-names.yml          # Branch-name subnames + manual dispatch
│   ├── custom-rpc.yml            # Custom RPC endpoints (local chain)
│   └── mono-repo.yml             # Multiple apps from a monorepo
└── README.md
```
