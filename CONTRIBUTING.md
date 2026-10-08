# Contributing to dotns-sdk

These guidelines apply to the dotns-sdk repository. Contributions are welcome via issues, pull
requests, reviews, and testing feedback. Project scope and structure live in [README.md](./README.md);
this file is the contributor mechanics.

## Types of contributing

1. Opening an issue
   - Check whether an issue already exists before creating a new one.
   - If a related issue exists, add details there; do not open a duplicate.
   - Use issues for bug reports, feature requests, and process suggestions.

2. Resolving an issue
   - Fix with code, tests, documentation, or by demonstrating expected behaviour.
   - Reference the issue number in the pull request and commit messages where relevant.

3. Reviewing open pull requests
   - Review for correctness, type safety, test coverage, naming, and ergonomics.
   - Flag potential edge cases, especially around name parsing, hashing, and transaction encoding.

## Opening an issue

When opening an issue, include:

- A short, specific title.
- Expected vs actual behaviour.
- A minimal reproduction where possible (a test or a short script).
- Environment details if relevant (Bun version, package, network, contracts release tag).

If you are proposing an API or behaviour change, describe:

- The problem being solved.
- Compatibility and migration considerations.
- Any security or UX implications.

## Opening a pull request

- Open pull requests against the `main` branch.
- Link the issue being addressed (or describe the motivation if there is no issue).
- Keep pull requests focused. If a change has multiple concerns, split it into smaller PRs.

Before opening a pull request:

- Install dependencies: `bun install`
- Format: `bun run format`
- Lint: `bun run lint`
- Type-check: `bun run --cwd packages/cli typecheck`
- Run the tests: `bun run --cwd packages/cli test:unit`
- Add or update tests for new behaviour, especially anything that changes how a name is interpreted
  or how a transaction is encoded.
- Keep changes small enough to review, or explain the design trade-offs clearly.

## Standards

1. Formatting and linting
   - All code should pass ESLint, Prettier and `tsc` type-checking.

2. Public APIs
   - Keep exported functions and types documented and stable.
   - Treat a change to name interpretation or transaction encoding as a breaking change for clients:
     document it, test it, and assume downstream consumers will break if it is ambiguous.

3. Generated inputs
   - ABIs are generated inputs synced from the dotNS contracts releases. Do not edit them by hand;
     update them through the sync script.

## Releasing

Releases publish the CLI (`@parity/dotns-cli`) from `v*` tags. The web UI in `packages/ui` is not released.

1. A pull request that changes the CLI bumps `packages/cli/package.json` past the latest `v*` tag; the release guard fails it otherwise.
2. To release, tag a commit on `main` with `v<version>` and push the tag. A tag on any other commit is refused.
3. The release workflow builds and packs the CLI, then waits for a reviewer to approve the `releases` environment. On approval it creates the GitHub release and starts the npm publish.

The release notes are generated: the supported dotNS protocol releases and networks, read from `SUPPORTED_PROTOCOL_VERSIONS` and the environment list in `packages/cli/src/utils/constants.ts`, then the merged pull requests. Breaking changes, when a release has any, are added to the published release by hand. When the CLI starts supporting a new dotNS protocol release, add it to `SUPPORTED_PROTOCOL_VERSIONS`: the CLI refuses a network that does not declare one of the listed releases.

## Reporting security issues

Do not open public issues for security vulnerabilities. Follow the disclosure process in
[SECURITY.md](./SECURITY.md).
