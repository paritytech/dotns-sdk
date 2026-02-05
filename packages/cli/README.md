# dotns developer CLI

A command-line tool for registering and managing `.dot` domains on Polkadot.

## Installation
```bash
# From GitHub release
bun add -g https://github.com/parity/dotns-sdk/releases/download/v0.1.0/dotns-cli-0.1.0.tgz

# Or with npm
npm install -g https://github.com/parity/dotns-sdk/releases/download/v0.1.0/dotns-cli-0.1.0.tgz
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
dotns register --account karim --name coolname42
dotns content set dotns bafybei... --account karim
dotns pop set lite --account karim
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DOTNS_KEYSTORE_PATH` | Path to keystore directory |
| `DOTNS_KEYSTORE_PASSWORD` | Keystore password |
| `DOTNS_RPC` | Asset Hub RPC endpoint |
| `DOTNS_MNEMONIC` | BIP39 mnemonic phrase |
| `DOTNS_KEY_URI` | Substrate key URI |
| `DOTNS_MIN_BALANCE_PAS` | Minimum balance in PAS |

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
# Upload file
dotns --password test-password bulletin upload ./image.png --account default

# Upload directory
dotns --password test-password bulletin upload ./dist --account default

# Upload directory in parallel (faster)
dotns --password test-password bulletin upload ./dist --parallel --concurrency 5 --account default

# Force chunked upload for large files
dotns --password test-password bulletin upload ./large-file.zip --force-chunked --chunk-size 1048576 --account default

# Print contenthash
dotns --password test-password bulletin upload ./site.html --print-contenthash --account default

# Custom RPC
dotns --password test-password bulletin upload ./image.png --bulletin-rpc wss://bulletin.dotspark.app --account default

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

Authorize accounts to upload to Bulletin chain. Requires sudo.
```bash
# Authorize account
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty

# With custom limits
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --transactions 500000 --bytes 549755813888

# Custom RPC
dotns --key-uri //Alice bulletin authorize 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty --bulletin-rpc wss://bulletin.dotspark.app
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

| Type | Length | Requirements |
|------|--------|--------------|
| Reserved | 5 chars or less | Governance only |
| PoP Full | 6-8 chars | Full verification |
| PoP Lite | 6-8 chars + 2 digits | Lite verification |
| NoStatus | 9+ chars + 2 digits | Open registration |

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