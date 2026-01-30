# dotns-sdk

This repository is the home for DotNS client tooling. The goal is to make DotNS interactions reproducible, auditable, and consistent across environments and languages.

“DotNS” refers to the protocol. Repository, package, and binary names use lowercase (for example `dotns-sdk`, `@dotns/*`).

DotNS will be accessed from multiple surfaces: scripts, command-line tools, web apps, backend services, indexers. If each surface re-implements name parsing, ABI handling, network configuration, and transaction encoding, behaviour drifts. Drift shows up as subtle incompatibilities: a name that validates in one place but not another, a call encoded differently across clients, or a release that “works” for one consumer and breaks another.

This monorepo exists to concentrate shared logic in one place, with explicit boundaries, shared primitives, and a small set of versioned artefacts that multiple runtimes can consume.

## Scope

“Client-side” here means off-chain code that reads and writes DotNS contracts. The repository is cross-platform:

- TypeScript packages are the primary surface, using Bun workspaces under `packages/*`.
- Rust crates may exist when they reduce duplication or provide tooling that should not depend on Node, under `crates/*` as a Cargo workspace.
- Shared artefacts that must be consistent across languages (ABIs, deployment addresses, schemas) live in `shared/*` (for example `shared/abi/`, `shared/deployments/`, `shared/schemas/`) and are treated as the source of truth for cross-runtime consumers. The contracts themselves live in the main DotNS repository can be found [here](https://github.com/paritytech/dotns)

## What belongs here

Examples:
- name parsing, normalisation, and validation
- namehash helpers and deterministic encodings
- contract call wrappers and typed interfaces
- network configuration and deployment address sets
- scripts that operate across networks (smoke tests, migrations, verification)
- higher-level flows (register, set resolver records, set reverse, Store writes) as composable functions

Non-goals:
- the contracts themselves
- UI code that is primarily presentation
- one-off scripts that are not expected to be maintained
- ad hoc protocol extensions that are not implemented in the contracts

## Repository structure

- `packages/*`: TypeScript packages (Bun workspace)
- `crates/*`: Rust crates (Cargo workspace, optional)
- `shared/*`: cross-language artefacts (ABIs, deployments, schemas)
- `scripts/*`: repo-level scripts (fetch / generate / check)

The intent is to keep a small set of packages and crates with clear boundaries:
- “core” modules are pure and dependency-light
- “integration” modules talk to networks and contracts
- “apps” (if any) compose the above but do not duplicate protocol logic

The repository may start with a single package. The structure exists to make growth predictable rather than ad hoc.

## ABIs and contract releases

This repository consumes ABIs published from the DotNS contracts repository as release assets. Tooling must not depend on local build artefacts from the contracts repository.

This is required for reproducibility: a given `dotns-sdk` commit should be able to target a specific contracts release without requiring a developer to compile contracts locally or infer which artefact set is current.

ABIs are treated as generated inputs and must not be edited by hand. Updates must be performed by a script that fetches a specific contracts release tag and writes the results into `shared/abi/` (or a dedicated ABI package if needed). Consumers across languages must read from the same canonical ABI bundle.

## Development (TypeScript)

Install dependencies:

```bash
bun install
````

Run typechecking and tests:

```bash
bun run typecheck
bun test
```

Build all workspace packages:

```bash
bun run build
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

Add a new module only when you can state a clear boundary. “I want a new package” is not a boundary. “This code is pure name parsing and should not depend on RPC clients” is a boundary.

Rules of thumb:

* If it can be pure, make it pure. Put it in its own package or crate with minimal dependencies.
* Avoid circular dependencies. If two modules need shared types, extract the shared types.
* Do not import contract JSON from arbitrary paths. Use the canonical ABI bundle under `shared/*`.
* Keep APIs small and testable without a live chain.

### TypeScript package checklist

1. Create a directory under `packages/<name>`.
2. Add a `package.json` with a scoped name (for example `@dotns/<name>`), `type: "module"`, and standard scripts (`build`, `test`, `typecheck` if needed).
3. Add a local `tsconfig.json` extending the root `tsconfig.base.json`.
4. Wire internal dependencies using `workspace:*`.
5. Add at least one test that asserts behaviour at the boundary you are introducing.

Minimal `package.json` template:

```json
{
  "name": "@dotns/<name>",
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
3. Prefer consuming ABIs and deployments from `shared/*` rather than copying them.
4. Add unit tests for parsing, encoding, and invariants.

## Quality bar

This repository exists to reduce protocol drift, not to create a new source of drift.

Prefer:

* Deterministic behaviour over convenience defaults
* Explicit inputs over environment magic
* Small modules with tests over large “kitchen sink” helpers
* Changes accompanied by invariant-style tests, especially when touching name parsing, hashing, or transaction encoding

If a change alters how a name is interpreted or how a transaction is encoded, treat it like a consensus change for clients: document it, test it, and assume downstream consumers will break if it is ambiguous.

