# dotns developer CLI

A command-line tool for registering and managing `.dot` domains on Polkadot.

## Installation

Download the latest release and install it:

```bash
gh release download --pattern "dotns-cli-*.tgz" --repo paritytech/dotns-sdk
npm install -g ./dotns-cli-*.tgz
```

Or download and install manually:

```bash
gh release download --pattern "dotns-cli-*.tgz" --repo paritytech/dotns-sdk
npm install -g ./dotns-cli-<version>.tgz
```

<details>
<summary>Other package managers</summary>

| Package Manager   | Command                                       |
| :---------------- | :-------------------------------------------- |
| yarn              | `yarn global add ./dotns-cli-<version>.tgz`   |
| bun (macOS/Linux) | `bun add -g "$(pwd)/dotns-cli-<version>.tgz"` |
| bun (Windows)     | `bun add -g "$PWD\dotns-cli-<version>.tgz"`   |

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

All write operations require authentication. The CLI supports three methods:

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
dotns pop set lite --account karim
```

## Environment Variables

| Variable                  | Description                |
| ------------------------- | -------------------------- |
| `DOTNS_KEYSTORE_PATH`     | Path to keystore directory |
| `DOTNS_KEYSTORE_PASSWORD` | Keystore password          |
| `DOTNS_RPC`               | Asset Hub RPC endpoint     |
| `DOTNS_MNEMONIC`          | BIP39 mnemonic phrase      |
| `DOTNS_KEY_URI`           | Substrate key URI          |
| `DOTNS_MIN_BALANCE_PAS`   | Minimum balance in PAS     |

## Commands

### Register Domains

All registration commands require authentication.

```bash
# Register a base domain
dotns --password test-password register domain --account default --name coolname42

# With PoP Lite status
dotns --password test-password register domain --account default --name alice99 --status lite

# With PoP Full status
dotns --password test-password register domain --account default --name premium --status full

# Governance registration (≤5 chars, reserved names)
dotns --password test-password register domain --account default --name short --governance

# Register for another owner
dotns --password test-password register domain --account default --name coolname42 --owner 0x000000000000000000000000000000000000dEaD

# Register and transfer
dotns --password test-password register domain --account default --name coolname42 --transfer --to 0x000000000000000000000000000000000000dEaD

# With reverse record
dotns --password test-password register domain --account default --name coolname42 --reverse
```

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

```bash
# Set PoP status with keystore
dotns pop --password test-password --account default set lite
dotns pop set full --password test-password --account default

# Set PoP status with mnemonic
dotns pop --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" set lite

# Set PoP status with key-uri
dotns pop --key-uri //Alice set lite

# View account info
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
dotns --password test-password bulletin upload ./image.png --bulletin-rpc wss://paseo-bulletin-rpc.polkadot.io --account default

# Skip history
dotns --password test-password bulletin upload ./image.png --no-history --account default
```

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
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --bulletin-rpc wss://paseo-bulletin-rpc.polkadot.io
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

```bash
# Show Store address and deployment status
dotns --password test-password store info --account default

# List all values
dotns --password test-password store list --account default

# Get / set / delete values
dotns --password test-password store get mykey --account default
dotns --password test-password store set mykey "my value" --account default
dotns --password test-password store delete mykey --account default

# Authorization management
dotns --password test-password store check 0x000000000000000000000000000000000000dEaD --account default
dotns --password test-password store authorize 0x000000000000000000000000000000000000dEaD --account default
dotns --password test-password store unauthorize 0x000000000000000000000000000000000000dEaD --account default

# DotNS controller authorisation
dotns --password test-password store authorize-controller 0x000000000000000000000000000000000000dEaD --account default
dotns --password test-password store unauthorize-controller 0x000000000000000000000000000000000000dEaD --account default

# Ensure all required authorizations
dotns --password test-password store ensure-auth --account default

# JSON output (all subcommands)
dotns --password test-password store info --json --account default
```

## Domain Classification

| Type     | Length               | Requirements      |
| -------- | -------------------- | ----------------- |
| Reserved | 5 chars or less      | Governance only   |
| PoP Full | 6-8 chars            | Full verification |
| PoP Lite | 6-8 chars + 2 digits | Lite verification |
| NoStatus | 9+ chars + 2 digits  | Open registration |

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
