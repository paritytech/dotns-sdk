# Dotns UI

Frontend application for managing usernames registered on **dotns**.

> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

## Prerequisites

* Bun `>= 1.2`
* Node.js `>= 18` (required by some tooling)
* Access to a Paseo RPC endpoint (WebSocket)

## Installation

Clone the repository and move into the UI directory:

```bash
git clone https://github.com/paritytech/dotns-sdk
cd dotns-sdk/packages/ui
```

Install dependencies:

```bash
bun install
```

## Development

Start the dev server:

```bash
bun run dev
```

The app will be available at the URL shown in the terminal, usually `http://localhost:5173`.

## Build

Create a production build:

```bash
bun run build
```

Preview the production build locally:

```bash
bun run preview
```


## RPC configuration

The project currently targets Paseo. A typical endpoint is:

```text
wss://paseo-asset-hub-next-rpc.polkadot.io
```

RPCs can be adjusted in code or environment configuration depending on deployment needs.

## Notes

* The UI assumes contracts and chain metadata are already deployed and available.

## Security

This is reference code, not a hardened production build. Before deploying it for real use cases, you are responsible for:

* Reviewing the code yourself
* Checking that dependencies are up to date and free of known vulnerabilities
* Securing your own fork or deployment environment (keys, secrets, network configuration)
* Tracking the latest tagged release/commits for security fixes

See [`SECURITY.md`](../../SECURITY.md) for the disclosure process. For Parity's security disclosure process and Bug Bounty program: https://parity.io/bug-bounty

## License

MIT — see [`LICENSE`](../../LICENSE).
