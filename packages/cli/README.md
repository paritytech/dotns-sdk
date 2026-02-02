# dotns developer CLI

A command-line tool for registering and managing `.dot` domains on Polkadot Asset Hub.

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

Set `DOTNS_KEYSTORE_PATH` and `DOTNS_KEYSTORE_PASSWORD` environment variables to simplify keystore usage:

```bash
export DOTNS_KEYSTORE_PATH=./keystore
export DOTNS_KEYSTORE_PASSWORD=test-password

# Then simply use --account
dotns register --account karim --name coolname42
dotns content set dotns bafybei... --account karim
dotns pop set lite --account karim
```

## Commands

### Register Domains

All registration commands require authentication.

```bash
# With keystore
dotns --password test-password register --account default --name coolname42

# With mnemonic
dotns --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" register --name coolname42

# With PoP Lite status
dotns --password test-password register --account default --name alice99 --status lite

# With PoP Full status
dotns --password test-password register --account default --name premium --status full

# Governance registration (≤5 chars, reserved names)
dotns --password test-password register --account default --name short --governance

# Register for another owner
dotns --password test-password register --account default --name coolname42 --owner 0x000000000000000000000000000000000000dEaD

# Register and transfer
dotns --password test-password register --account default --name coolname42 --transfer --to 0x000000000000000000000000000000000000dEaD
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
```

### List Domains

```bash
# With keystore
dotns --password test-password list --account default

# With mnemonic
dotns --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" list

# With key-uri
dotns --key-uri //Alice list
```

### Content Hash

View does not require authentication:

```bash
dotns content view dotns
```

Set requires authentication:

```bash
# With keystore
dotns --password test-password content set dotns bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi --account default

# With mnemonic
dotns --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk" content set dotns bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi

# With key-uri
dotns --key-uri //Alice content set dotns bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
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
# Upload file with keystore
dotns --keystore-path ./keystore --password test-password bulletin upload ./image.png

# With chunking for large files
dotns --keystore-path ./keystore --password test-password bulletin upload ./large-file.zip --force-chunked --chunk-size 1048576

# Print contenthash
dotns --keystore-path ./keystore --password test-password bulletin upload ./site.html --print-contenthash

# Custom RPC
dotns --keystore-path ./keystore --password test-password bulletin upload ./image.png --bulletin-rpc wss://bulletin.dotspark.app
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

### Account Info

```bash
dotns account info --key-uri //Alice
dotns account info --mnemonic "bottom drive obey lake curtain smoke basket hold race lonely fit walk"
dotns account info --password test-password --account default
```

## Domain Classification

| Type     | Length               | Requirements      |
| -------- | -------------------- | ----------------- |
| Reserved | ≤5 chars             | Governance only   |
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
bun run dev <command>    # Run without building
bun run typecheck        # Type checking
bun test                 # Run tests
```
