# Security policy

## Security status

This repository contains the DotNS client SDK and tooling: reference and proof-of-concept libraries,
a command-line tool, and examples for interacting with the DotNS protocol. It is intended for
reference and experimentation, not as a production-ready artefact.

Unless a specific release states otherwise, this repository has **not** received a full security
audit. Use in production or production-like contexts should only follow an independent security
review of the relevant code, configuration, and the environment it runs in.

Even where no Parity-operated production deployment exists today, this code may be consumed by third
parties in live applications, or reused in future production contexts once published.

## Static analysis

The codebase is checked on every pull request by automated tooling, currently linting and
formatting (Biome), type-checking (TypeScript), and dependency and supply-chain scanning (Socket).
All findings raised by these tools have been reviewed and are deemed false positives or accepted
non-issues for this codebase. They are retained for transparency rather than as a list of
outstanding defects, so a tool reporting a finding is not in itself grounds for a vulnerability
report. If you believe a specific finding has genuine, demonstrable impact, raise it through the
disclosure process below with the evidence required under "What to report".

## Supported versions

Security fixes are provided only for versions, packages, or branches actively maintained by Parity.
Experimental, archived, deprecated, or explicitly-unsupported packages, examples, or branches may
not be triaged unless the issue affects maintained packages, Parity-operated infrastructure, user
funds, private keys, signing flows, or transaction integrity.

## Bug bounty scope

This repository is **not** in scope for Parity's paid bug bounty programme unless explicitly listed
in the official bounty scope at the time of submission. Reports may still be reviewed through
responsible disclosure, but bounty eligibility applies only where the affected asset or vulnerability
class is explicitly in scope.

## What to report

Report an issue only if it demonstrates realistic impact against one or more of:

- Parity-operated production infrastructure or deployed services;
- maintained packages downstream users are expected to consume;
- user funds or assets;
- private keys, seed phrases, signer flows, or key-management boundaries;
- transaction construction, integrity, or signing intent;
- remote code execution or credential compromise in a realistic deployment.

## Out of scope (unless shown to cause realistic high-impact harm)

Local-development-only issues; demo/example/testnet-only issues; missing rate limiting in local
examples; dependency reports without a working exploit path or that don't affect shipped packages;
hypothetical attack paths; "this code is unaudited"; documented known limitations; unsafe use
contrary to documented warnings; issues requiring access to internal Parity systems not in scope.

## Reporting a qualifying issue

Do **not** open a public issue for a qualifying vulnerability. Email **security@parity.io** with:

- the affected repository, package, commit, branch, or release;
- clear reproduction steps and realistic impact;
- whether it affects production infrastructure, maintained packages, user funds, keys, signing, or
  only local/demo/testnet usage;
- any proof of concept, logs, or generated code involved;
- assumptions required for exploitation.

## Researcher expectations

Don't access, modify, or delete data that isn't yours; don't disrupt services; don't extract keys or
secrets beyond what's needed to demonstrate impact safely; don't test against production systems not
in scope; no social engineering or physical attacks; don't disclose publicly until Parity has had a
reasonable opportunity to remediate.

## Safe-use guidance

Before relying on this SDK in any production or production-like context, review at minimum: how the
consuming application generates, stores, and destroys keys, seeds, and signers; whether signing
prompts display transaction intent before approval; whether transactions are built against the
intended chain, account, and network; whether examples rely on test or unstable endpoints; whether
inputs such as names and addresses are validated before use; and whether dependencies are pinned and
reviewed before being shipped.
