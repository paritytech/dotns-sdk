# Contributing to dotns-sdk

These guidelines apply to the dotns-sdk repository. Contributions are welcome via issues, pull
requests, reviews, and testing feedback. Project scope and structure live in [README.md](./README.md);
this file is the contributor mechanics.

## Types of contributing

1. Opening an issue
   - Check whether an issue already exists before creating a new one.
   - If a related issue exists, add details there rather than duplicating.
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
- Type-check: `bun run typecheck`
- Run the tests: `bun test`
- Add or update tests for new behaviour, especially anything that changes how a name is interpreted
  or how a transaction is encoded.
- Keep changes small enough to review, or explain the design trade-offs clearly.

## Standards

1. Formatting and linting
   - All code should pass Biome formatting and linting and `tsc` type-checking.

2. Public APIs
   - Keep exported functions and types documented and stable.
   - Treat a change to name interpretation or transaction encoding as a breaking change for clients:
     document it, test it, and assume downstream consumers will break if it is ambiguous.

3. Generated inputs
   - ABIs are generated inputs synced from the DotNS contracts releases. Do not edit them by hand;
     update them through the sync script.

## Reporting security issues

Do not open public issues for security vulnerabilities. Follow the disclosure process in
[SECURITY.md](./SECURITY.md).
