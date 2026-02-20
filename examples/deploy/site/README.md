# DotNS Deploy Example

A minimal static site deployed to Polkadot via DotNS.

This example demonstrates using the reusable `deploy.yml` workflow from `dotns-sdk` to upload a static site to the Bulletin chain and bind it to a `.dot` domain.

## How it works

1. Push to `main` → builds the site → uploads to Bulletin → sets contenthash on `example.dot`
2. Open a PR → builds the site → uploads to Bulletin → sets contenthash on `pr{number}.example.dot`

The deploy workflow handles everything: Bulletin storage, subname registration, and contenthash binding. The only thing you provide is a build artifact and a mnemonic.

## Setup

1. **Register your base domain** (`example.dot`) through the CLI or contracts before first deploy
2. **Add your mnemonic** as a repository secret named `DOTNS_MNEMONIC`
3. **Push to main** or open a PR

## Repository secrets

| Secret | Description |
|--------|-------------|
| `DOTNS_MNEMONIC` | BIP39 mnemonic for the domain owner account |

## Workflow inputs

The example workflow passes minimal inputs. All optional inputs and their defaults:

| Input | Default | Description |
|-------|---------|-------------|
| `basename` | *(required)* | Base domain without `.dot` |
| `artifact-name` | *(required)* | Name of the uploaded build artifact |
| `subname-format` | `pr-number` | `pr-number`, `branch`, or `sha-short` |
| `register-base` | `false` | Register base domain if not owned |
| `bulletin-rpc` | CLI default | Bulletin chain endpoint override |
| `naming-rpc` | CLI default | Naming chain endpoint override |

## Project structure

```
example/
├── site/
│   └── index.html          # Static site (single file)
├── .github/
│   └── workflows/
│       ├── deploy.yml       # Production deploy (push to main)
│       └── preview.yml      # PR preview deploys
└── README.md
```
