# Dotns UI

Frontend application for managing usernames registered on **dotns**.


## Prerequisites

* Bun `>= 1.2`
* Node.js `>= 18` (required by some tooling)
* Access to a Paseo RPC endpoint (WebSocket)

## Installation

Clone the repository and move into the UI directory:

```bash
git clone https://github.com/paritytech/dotns-ui
cd dotns-ui
```

Install dependencies:

```bash
bun install
```

Generate Polkadot API descriptors:

```bash
bunx papi add paseo -w wss://paseo-asset-hub-next-rpc.polkadot.io
```

This generates the `.papi/` directory required by `polkadot-api`.

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

* `.papi/` is generated locally and should not be edited by hand.
* If `.papi/descriptors` is missing, dependency resolution will fail. Always run `papi` after a fresh clone.
* The UI assumes contracts and chain metadata are already deployed and available.
