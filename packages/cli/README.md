# dotns developer CLI

A command-line tool for registering and managing `.dot` domains on Polkadot.

## Installation

```bash
npm install -g @parity/dotns-cli
```

<details>
<summary>Other package managers</summary>

| Package Manager | Command                             |
| :-------------- | :---------------------------------- |
| npm             | `npm install -g @parity/dotns-cli`  |
| yarn            | `yarn global add @parity/dotns-cli` |
| pnpm            | `pnpm add -g @parity/dotns-cli`     |
| bun             | `bun add -g @parity/dotns-cli`      |

</details>

Verify:

```bash
dotns --version
```

## Quick Start

```bash
bun install
bun run build
```

> **Note**: Throughout this README, `dotns` refers to the built CLI. During development, replace `dotns` with `bun run dev`.

## Authentication

All write operations require an explicit signing account. The CLI refuses to sign transactions with
the shared public dev account; configure one of these methods before registering, transferring,
delegating, publishing, or changing records:

```bash
# Keystore
dotns --keystore-path ./keystore --password test-password --account default <command>

# Mnemonic
dotns --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" <command>

# Development key URI
dotns --key-uri //Alice <command>
```

Set environment variables to simplify usage:

```bash
export DOTNS_KEYSTORE_PATH=./keystore
export DOTNS_KEYSTORE_PASSWORD=test-password

# Then simply use --account
dotns register domain --account karim --name coolname42
dotns content set dotns bafybei... --account karim
dotns pop status --account karim
```

Read-only commands can run without configured credentials. In that case the CLI uses a shared dev
account only as the origin for read calls.

Auth precedence is explicit: command-line `--mnemonic` / `--key-uri` wins first. If you pass
`--account`, `--keystore-path`, or `--password`, the CLI uses the encrypted keystore and will not
let ambient `DOTNS_MNEMONIC` / `DOTNS_KEY_URI` shadow the selected account. Without keystore hints,
env auth is used before the default keystore.

New keystore passwords supplied interactively, with `--password`, or with
`DOTNS_KEYSTORE_PASSWORD` must be at least 6 characters. Decryption remains compatible with
existing keystores.

## Environment Variables

| Variable                  | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `DOTNS_ENV`               | DotNS environment (`paseo-v2`; default `paseo-v2`) |
| `DOTNS_KEYSTORE_PATH`     | Path to keystore directory                         |
| `DOTNS_KEYSTORE_PASSWORD` | Keystore password                                  |
| `DOTNS_RPC`               | Asset Hub RPC endpoint                             |
| `DOTNS_MNEMONIC`          | BIP39 mnemonic phrase                              |
| `DOTNS_KEY_URI`           | Substrate key URI                                  |

Select an environment with either an environment variable or a per-command option:

```bash
# Default: Paseo V2
dotns account is-whitelisted 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Explicitly use Paseo V2 for this shell
export DOTNS_ENV=paseo-v2
dotns account is-whitelisted 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Or override for a single command
dotns --env paseo-v2 account is-whitelisted 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
dotns account whitelist 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY --env paseo-v2 --key-uri //Alice
```

`--rpc` still overrides the endpoint URL, but it does not change the selected DotNS contract addresses. Use `--env`/`DOTNS_ENV` to select the DotNS deployment.

## Commands

### Register Domains

All registration commands require authentication.

```bash
# Register a NoStatus name (stem ≥ 9, open to all)
dotns --password test-password register domain --account default --name coolwebsite

# Register a name that requires PoP Lite (stem 6-8 + 2-digit suffix)
dotns --password test-password register domain --account default --name premium12

# Register a name that requires PoP Full (stem 6-8, no suffix)
dotns --password test-password register domain --account default --name premium

# Governance registration (stem ≤ 5, reserved names)
dotns --password test-password register domain --account default --name short --governance

# Register for another owner
dotns --password test-password register domain --account default --name coolwebsite --owner 0x000000000000000000000000000000000000dEaD

# Register and transfer
dotns --password test-password register domain --account default --name coolwebsite --transfer --to 0x000000000000000000000000000000000000dEaD

# With reverse record
dotns --password test-password register domain --account default --name coolwebsite --reverse

# Auto-retry on failure, resuming from the cached commitment (here, up to 3 times)
dotns --password test-password register domain --account default --name coolwebsite --retry 3
```

### Resume and manage commitments

Registration is a two-step commit-reveal: the commit lands on-chain, then after the
minimum commitment age the reveal completes the mint. If the reveal is interrupted
(crash, network drop, closed terminal), the commitment is cached locally so it can be
resumed rather than restarted. The reveal secret is encrypted at rest with your
credential (keystore password, CLI/env mnemonic, or CLI/env key URI); the rest of the record is
plaintext so it can be listed and cleared without unlocking.

Records live under `~/.dotns/registrations/` (override with `DOTNS_REGISTRATION_DIR`).

```bash
# Resume the most recent interrupted registration
dotns --password test-password register retry --account default

# Resume a specific cached commitment by name
dotns --password test-password register retry coolname42 --account default

# List cached commitments and their on-chain status
dotns register list

# Review cached commitments: purges completed ones, then prompts for any pending
dotns --password test-password register clear --account default

# Review one cached commitment by name
dotns --password test-password register clear coolname42 --account default

# Non-interactively discard pending commitments
dotns register clear --discard

# Non-interactively discard one pending commitment
dotns register clear coolname42 --discard

# Non-interactively complete pending commitments
dotns --password test-password register clear --register --account default

# Non-interactively complete one pending commitment
dotns --password test-password register clear coolname42 --register --account default
```

Unnamed `register clear --discard` and `register clear --register` intentionally apply to every
pending cached commitment for the selected account and environment. Passing a name scopes the action
to that one commitment.

### Register Subnames

```bash
# Register a subname under an existing domain
dotns --password test-password register subname --name blog --parent coolname42 --account default

# Register subname for a different owner
dotns --password test-password register subname --name blog --parent coolname42 --owner 0x000000000000000000000000000000000000dEaD --account default
```

### Lookup (no auth required)

```bash
# Domain information
dotns lookup name dotns

# Check ownership
dotns lookup owner-of dotns

# Using alias
dotns lookup oo dotns

# Using --name flag
dotns lookup --name dotns

# JSON output
dotns lookup name dotns --json
```

### Transfer Domains

```bash
# Transfer to EVM address
dotns lookup transfer coolname42 --destination 0x000000000000000000000000000000000000dEaD

# Transfer to Substrate address
dotns lookup transfer coolname42 --destination 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Transfer to domain label
dotns lookup transfer coolname42 --destination alice

# JSON output
dotns lookup transfer coolname42 --destination alice --json
```

### Content Hash

View does not require authentication:

```bash
dotns content view dotns
```

Set requires authentication:

```bash
dotns --password test-password content set dotns bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi --account default
```

### Text Records

View does not require authentication:

```bash
dotns text view dotns email
dotns text view dotns url
```

Set requires authentication (reads from stdin if value is omitted):

```bash
# Set a text record
dotns --password test-password text set alice email "alice@example.com" --account default

# Set from stdin
echo "https://alice.dev" | dotns --password test-password text set alice url --account default
```

### Proof of Personhood

The CLI reads PoP status directly from the personhood precompile at
`0x000000000000000000000000000000000a010000` using the `bytes32("dotns")`
context. Returned tiers are `none`, `lite`, `full`, or `reserved`; DotNS does
not set this status. `pop info` also reports whether the account is whitelisted
for governance-reserved registrations (independent of the PoP tier) and any
names pending settlement into the Label Store (run `store sync` to settle them).

```bash
# Check PoP status from the personhood precompile
dotns pop --password test-password --account default status
dotns pop status --password test-password --account default
dotns pop --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" status
dotns pop --key-uri //Alice status

# Full info: status, whitelist eligibility, and pending names
dotns pop --password test-password --account default info
dotns pop --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" info
dotns pop --key-uri //Alice info
```

### Bulletin Storage

All bulletin commands require authentication.

```bash
# Upload file
dotns --password test-password bulletin upload ./image.png --account default

# Upload directory
dotns --password test-password bulletin upload ./dist --account default

# Upload directory with concurrency control (max: 4)
dotns --password test-password bulletin upload ./dist --concurrency 4 --account default

# Force chunked upload for large files (streams from disk, low memory)
dotns --password test-password bulletin upload ./large-file.zip --force-chunked --chunk-size 1048576 --account default

# Resume an interrupted upload
dotns --password test-password bulletin upload ./large-file.zip --force-chunked --resume --account default

# Retry transient failures (default: 5, capped at 20)
dotns --password test-password bulletin upload ./dist --max-retries 10 --account default

# Print contenthash
dotns --password test-password bulletin upload ./site.html --print-contenthash --account default

# JSON output
dotns --password test-password bulletin upload ./image.png --json --account default

# Upload profiling
dotns --password test-password bulletin upload ./dist --profile-upload --account default
dotns --password test-password bulletin upload ./dist --profile-upload --profile-output ./report.json --account default

# Custom RPC
dotns --password test-password bulletin upload ./image.png --bulletin-rpc wss://paseo-bulletin-next-rpc.polkadot.io --account default

# Skip history
dotns --password test-password bulletin upload ./image.png --no-history --account default
```

`bulletin upload --cache` writes the uploaded CID to your on-chain Store on the selected DotNS
Asset Hub environment. When overriding Bulletin with `--bulletin-rpc` or `DOTNS_BULLETIN_RPC`,
also pass the matching `--env` or `DOTNS_ENV`, and, when needed, `--rpc` for the Asset Hub Store
write. In this custom-Bulletin mode, `--env` / `DOTNS_ENV` uses that environment's configured
Asset Hub RPC and ignores ambient `DOTNS_RPC`; pass `--rpc` to override it deliberately.

### Bulletin History

```bash
# List upload history
dotns bulletin history

# List as JSON
dotns bulletin history --json

# Remove entry by CID
dotns bulletin history:remove bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi

# Clear all history
dotns bulletin history:clear
```

### Bulletin Authorization

Authorise accounts to upload to Bulletin chain. Requires sudo.

```bash
# Authorise account
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty

# With custom limits
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --transactions 500000 --bytes 549755813888

# Force re-authorisation
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --force

# JSON output
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --json

# Custom RPC
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --bulletin-rpc wss://paseo-bulletin-next-rpc.polkadot.io
```

### Bulletin Status

Check authorisation status for an account.

```bash
# Check status
dotns bulletin status 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty

# JSON output
dotns bulletin status 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --json

# Resolve account from keystore
dotns --password test-password bulletin status --account default
```

### Account Management

```bash
# Store mnemonic
dotns auth --keystore-path ./keystore --password test-password set --account default --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk"

# Store key-uri
dotns auth --keystore-path ./keystore --password test-password set --account alice --key-uri //Alice

# List stored accounts
dotns auth --keystore-path ./keystore --password test-password list

# Switch default account
dotns auth --keystore-path ./keystore --password test-password use default

# Remove account
dotns auth --keystore-path ./keystore --password test-password remove default

# Clear all credentials
dotns auth --keystore-path ./keystore clear
```

### Account

```bash
# Print substrate address (no RPC needed)
dotns account address --key-uri //Alice

# Account info (balances, mapping status)
dotns account info --key-uri //Alice

# Map Substrate account to EVM address
dotns --password test-password account map --account default

# Check if address is mapped on-chain
dotns account is-mapped 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Check if address is whitelisted
dotns account is-whitelisted 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Whitelist an address (admin only)
dotns --key-uri //Alice account whitelist 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY

# Remove from whitelist
dotns --key-uri //Alice account whitelist 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY --remove
```

### Store

Your User Store is a per-account, owner-bound key/value store. Claim it once,
then read and write values. Names you register are tracked separately in your
Label Store (see `store names`).

```bash
# Claim your User Store (required once before setting values)
dotns --password test-password store claim --account default

# Show Store address and deployment status
dotns --password test-password store info --account default

# List all values
dotns --password test-password store list --account default

# Get / set / delete values
dotns --password test-password store get mykey --account default
dotns --password test-password store set mykey "my value" --account default
dotns --password test-password store delete mykey --account default

# List the .dot names in your Label Store, and cached CIDs
dotns --password test-password store names --account default
dotns --password test-password store cids --account default

# Settle any pending names from the PoP controller into your Label Store
dotns --password test-password store sync --account default

# JSON output (all subcommands)
dotns --password test-password store info --json --account default
```

### Delegate

Grant another account control of your names. Per-name delegation surrenders full
control of a single name; record delegation lets an operator edit records across
all your names. Operators may be an EVM address, SS58 address, or `.dot` label.

```bash
# Delegate full control of one name
dotns --password test-password delegate set coolname42 alice --account default

# Revoke the delegate on a name
dotns --password test-password delegate revoke coolname42 --account default

# Show the current delegate for a name (no auth)
dotns delegate status coolname42

# Let an operator edit records on all your names
dotns --password test-password delegate records alice --account default

# Revoke record-editing access
dotns --password test-password delegate records alice --revoke --account default

# Show whether an operator may edit your records (no auth)
dotns delegate records-status alice
```

### Set Primary Name

Set the primary (reverse) name resolvers return for your account. You can only
set a name you own; there is no on-chain "clear" beyond pointing it at a
different name or transferring the current one away.

```bash
# Set one of your names as the primary
dotns --password test-password primary set coolname42 --account default

# Show the primary name for an account (defaults to your own, no auth)
dotns primary status
dotns primary status 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
```

### Escrow

Names registered without PoP verification (NoStatus) hold a refundable deposit
in escrow. Release a name to start its cooldown, withdraw the deposit onto the
pull-payment ledger, then claim your balance.

```bash
# Show the escrow position for a name (no auth)
dotns escrow status coolwebsite

# List all your positions and the total locked
dotns --password test-password escrow positions --account default

# Show your claimable pull-payment balance
dotns --password test-password escrow balance --account default

# Release a name to start its refund cooldown
dotns --password test-password escrow release coolwebsite --account default

# After cooldown, move the released deposit onto the pull-payment ledger
dotns --password test-password escrow withdraw coolwebsite --account default

# Drain the pull-payment ledger
dotns --password test-password escrow claim-withdrawal --account default

# List entries in the time-locked refund ledger
dotns --password test-password escrow refunds list --account default

# Claim a refund entry (or several) once its cooldown elapses
dotns --password test-password escrow refunds claim <entryId> --account default
dotns --password test-password escrow refunds claim-batch <id1> <id2> --account default
```

## Domain Classification

A name's tier is decided by its **stem length** — the label length excluding an
optional trailing digit suffix. The suffix must be either absent or exactly two
digits; any other trailing-digit count is rejected.

| Type     | Stem length | Digit suffix | Requirement       |
| -------- | ----------- | ------------ | ----------------- |
| Reserved | ≤ 5         | none or 2    | Governance only   |
| PoP Full | 6–8         | none         | Full verification |
| PoP Lite | 6–8         | exactly 2    | Lite verification |
| NoStatus | ≥ 9         | none or 2    | Open to all       |

## Transfer Recipients

The `--to` flag accepts:

- EVM address: `0x000000000000000000000000000000000000dEaD`
- Substrate address: `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
- Domain label: `alice` (resolves to owner of `alice.dot`)

## Development

```bash
bun run dev <command>
bun run typecheck
bun run lint
bun run lint:fix
bun run format
bun run format:fix
bun test
```

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

## License

Apache-2.0
