> [!WARNING]
> This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk and obtain legal advice as appropriate - DYOR.
>
> Parity doesn’t deploy the code but may update it based on community feedback.
>
> If you experience problems with any product or service that was built on or deployed from this code, you should contact the third party who deployed the code in its amended form, not Parity.

# dotns-sdk

This repository is the home for dotNS developer client tooling. The goal is to make dotNS interactions reproducible, auditable, and consistent across environments and languages.

**dotNS** refers to the protocol. Repository, package, and binary names use lowercase (for example `dotns-sdk`, `@parity/dotns-cli`, `dotns`).

dotNS will be accessed from multiple surfaces: scripts, command-line tools, web apps, backend services, indexers. If each surface re-implements name parsing, ABI handling, network configuration, and transaction encoding, behaviour drifts. Drift shows up as subtle incompatibilities: a name that validates in one place but not another, a call encoded differently across clients, or a release that “works” for one consumer and breaks another.

This monorepo exists to concentrate shared logic in one place, with explicit boundaries, shared primitives, and a small set of versioned artefacts that multiple runtimes can consume.

## Status

This is reference and proof-of-concept tooling for the dotNS protocol, intended for reference and experimentation. Unless a specific release states otherwise, it has not received a full security audit; see [SECURITY.md](./SECURITY.md) for the security status and disclosure process. The defaults target Paseo and its Bulletin chain; point the configuration at your own network before relying on it elsewhere.

## Scope

**Client-side** here means off-chain code that reads and writes dotNS contracts. The repository is cross-platform:

- TypeScript packages are the primary surface, using Bun workspaces under `packages/*`.
- Rust crates may be added when they reduce duplication or provide tooling that should not depend on Node, under `crates/*` as a Cargo workspace. None exist yet.
- ABIs are synced from the contracts releases into `packages/cli/abis/` by `scripts/sync-abis.mjs`. Once a second runtime needs them, cross-language artefacts (ABIs, deployment addresses, schemas) move to `shared/*` as the source of truth. The contracts themselves live in the main dotNS repository, [paritytech/dotns](https://github.com/paritytech/dotns).

## What belongs here

Examples:
- name parsing, normalisation, and validation
- namehash helpers and deterministic encodings
- contract call wrappers and typed interfaces
- network configuration and deployment address sets
- scripts that operate across networks (smoke tests, migrations, verification)
- higher-level flows (register, set resolver records, set reverse, Store writes) as composable functions

The CLI's named operations are also exported as a programmatic SDK (`@parity/dotns-cli/core`) that
takes a caller-supplied signer, including QR-paired mobile wallets. See the CLI README's
"Programmatic SDK" section and the [SDK docs page](https://dotns.paseo.li/#/docs/tools/sdk).

Non-goals:
- the contracts themselves
- UI code that is primarily presentation
- one-off scripts that are not expected to be maintained
- ad hoc protocol extensions that are not implemented in the contracts

## Repository structure

- `packages/*`: TypeScript packages (Bun workspace)
  - `packages/cli`: the `@parity/dotns-cli` command-line tool and its programmatic SDK (`@parity/dotns-cli/core`). This is what releases publish.
  - `packages/ui`: a web app. It is not maintained at present, does not work against current deployments, and is neither released nor deployed by CLI releases.
- `crates/*`: Rust crates (Cargo workspace, optional; not present yet)
- `shared/*`: cross-language artefacts (ABIs, deployments, schemas; not present yet)
- `scripts/*`: repo-level scripts (fetch / generate / check)

The intent is to keep a small set of packages and crates with clear boundaries:
- **core** modules are pure and dependency-light
- **integration** modules talk to networks and contracts
- **apps** (if any) compose the above but do not duplicate protocol logic

The repository may start with a single package. The structure exists to make growth predictable.

## ABIs and contract releases

This repository consumes ABIs published from the dotNS contracts repository as release assets. Tooling must not depend on local build artefacts from the contracts repository.

This is required for reproducibility: a given `dotns-sdk` commit should be able to target a specific contracts release without requiring a developer to compile contracts locally or infer which artefact set is current.

ABIs are treated as generated inputs and must not be edited by hand. Updates are performed by `scripts/sync-abis.mjs`, which fetches a specific contracts release tag and writes the results into `packages/cli/abis/`. Consumers across languages must read from the same canonical ABI bundle.

## Development (TypeScript)

Install dependencies:

```bash
bun install
```

Run typechecking and tests in the CLI package:

```bash
bun run --cwd packages/cli typecheck
bun run --cwd packages/cli test:unit
```

Build the CLI package:

```bash
bun run --cwd packages/cli build
```

If you add repo-level scripts, keep them in `scripts/` and make them callable via the root `package.json` scripts. Prefer deterministic inputs (explicit network, explicit release tag).

## Development (Rust, if present)

Rust crates live under `crates/*` and are built with Cargo. They should treat `shared/*` as the canonical input for ABIs and deployments and must not duplicate protocol rules in an incompatible way.

Typical commands:

```bash
cargo test --workspace
cargo build --workspace
```

## Adding a new package or crate

Add a new module only when you can state a clear boundary. **I want a new package** is not a boundary. **This code is pure name parsing and should not depend on RPC clients** is a boundary.

Rules of thumb:

* If it can be pure, make it pure. Put it in its own package or crate with minimal dependencies.
* Avoid circular dependencies. If two modules need shared types, extract the shared types.
* Do not import contract JSON from arbitrary paths. Use the synced ABI bundle (`packages/cli/abis/`).
* Keep APIs small and testable without a live chain.

### TypeScript package checklist

1. Create a directory under `packages/<name>`.
2. Add a `package.json` with a scoped name (for example `@parity/<name>`), `type: "module"`, and standard scripts (`build`, `test`, `typecheck` if needed).
3. Add a local `tsconfig.json`.
4. Wire internal dependencies using `workspace:*`.
5. Add at least one test that asserts behaviour at the boundary you are introducing.

Minimal `package.json` template:

```json
{
  "name": "@parity/<name>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "bunx tsc -p tsconfig.json",
    "test": "bun test"
  }
}
```

Then run:

```bash
bun install
bun run build
bun test
```

### Rust crate checklist (if adding Rust)

1. Create `crates/<name>` and add it to the Cargo workspace.
2. Keep dependencies minimal and avoid embedding network assumptions that belong in `shared/*`.
3. Consume ABIs and deployments from `shared/*`; do not copy them.
4. Add unit tests for parsing, encoding, and invariants.

## Quality bar

This repository exists to reduce protocol drift, so it must never become a new source of it.

Prefer:

* Deterministic behaviour over convenience defaults
* Explicit inputs over environment magic
* Small modules with tests over large **kitchen sink** helpers
* Changes accompanied by invariant-style tests, especially when touching name parsing, hashing, or transaction encoding

If a change alters how a name is interpreted or how a transaction is encoded, treat it like a consensus change for clients: document it, test it, and assume downstream consumers will break if it is ambiguous.

## Security

Before deploying it for real use cases, you are responsible for:

- Reviewing the code yourself: we publish a reference implementation
- Checking that the dependencies are up to date and free of known vulnerabilities
- Securing your own fork or deployment environment (keys, secrets, network configuration)
- Tracking the latest tagged release/commits for security fixes; older releases are not backported (exceptions might apply)

For Parity's security disclosure process, and Bug Bounty program, feel free to visit:  https://parity.io/bug-bounty

## License

Licensed under the MIT License. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Security policy and disclosure: see [SECURITY.md](./SECURITY.md).

