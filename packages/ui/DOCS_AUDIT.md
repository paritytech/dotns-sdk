# Documentation Audit Report

## Scope

Reviewed all 40 documentation pages in `src/views/docs/`, the navigation configuration in `src/lib/docsNav.ts`, all shared doc components in `src/components/docs/`, all interactive demo components in `src/components/docs/interactive/`, and the router configuration in `src/router/index.ts`. Verified technical claims against contract source in `../dotns` and SDK source in `../dotns-sdk`. Checked cross-referencing between every page. Assessed information architecture, structural consistency, precision, example quality, and correctness.

Audit date: 7 March 2026.

---

## Information Architecture Summary

### Current top-level structure

The sidebar navigation defines seven groups in this order:

| # | Group | Pages | Role |
|---|-------|-------|------|
| 1 | Introduction | 3 | Entry point, motivation, quick start |
| 2 | Protocol | 10 | Concept-level explanations of system behaviour |
| 3 | Contracts | 9 | Per-contract API reference |
| 4 | Decentralized Web | 5 | dWeb hosting, Bulletin chain, gateway |
| 5 | Tools | 2 | CLI and Web UI reference |
| 6 | Use Cases | 6 | Application patterns (identity, DAOs, portfolios) |
| 7 | Guides | 5 | Step-by-step task walkthroughs |

### Assessment against the target model

The documentation has a recognisable architecture with a clear entry point (Introduction), a concept layer (Protocol), a reference layer (Contracts), and task-focused content (Guides, Use Cases). However, several structural gaps weaken the system:

1. **Guides are placed last.** Developers looking for "how do I do X" must scroll past Use Cases in the sidebar. Guides should precede Use Cases or sit immediately after the concept/reference sections.

2. **No dedicated API reference layer.** The Contracts section serves as both concept documentation and API reference on the same pages. Function signatures, parameter tables, and conceptual explanations share a single page per contract with no separation.

3. **No installation page.** Prerequisites are split between Getting Started (wallet, tokens) and the first guide (wallet specifics, faucet links). There is no single page that covers: install the CLI, connect to the testnet, and run your first command.

4. **Missing type definitions.** Key types used across multiple contracts — `Registration`, `PriceWithMeta`, `PopStatus`, `SubnodeRecord` — are not documented in any single location. Developers must infer struct layouts from code examples.

5. **Weak cross-section linking.** Guides mention contract names in prose without linking to their pages. Introduction does not link to Contracts or Guides.

---

## 1. Structural Issues

### 1.1 Guides placed after Use Cases in navigation

- **Severity:** Major
- **Page/section:** `docsNav.ts` — Guides is group 7, Use Cases is group 6
- **Problem:** A developer following the natural learning path (concepts → reference → doing things) reaches Use Cases before Guides. Use Cases describe application patterns; Guides describe how to complete specific tasks. The expected order is reversed.
- **Why it matters:** New developers looking for step-by-step instructions must scroll past abstract use-case pages. This slows onboarding.
- **Fix:** Move Guides to position 5 (after Tools), Use Cases to position 6.

### 1.2 No installation/setup page

- **Severity:** Major
- **Page/section:** Introduction section (3 pages: What is DotNS, Why DotNS, Getting Started)
- **Problem:** Getting Started lists prerequisites (wallet, PAS tokens) but does not cover: CLI installation, SDK installation, testnet RPC configuration, or running a first command. These are scattered across Tools/CLI and the first guide.
- **Why it matters:** A developer cannot reach a working state from the Getting Started page alone. The first runnable example appears on the CLI page, which is 20+ pages deep in the sidebar.
- **Fix:** Either expand Getting Started to include a minimal CLI installation + first command sequence, or add a dedicated "Installation" or "Quick Start" page at position 3 in the Introduction group.

### 1.3 Contract pages mix reference and concept content

- **Severity:** Moderate
- **Page/section:** All 8 contract pages (`ControllerPage.vue`, `RegistryPage.vue`, etc.)
- **Problem:** Each contract page contains: a conceptual description, deployed address, function signatures with parameter tables, a code example, and callout boxes with conceptual guidance. This is a single page doing double duty as both concept and reference.
- **Why it matters:** A developer looking up a function signature must scroll past conceptual prose. A developer reading about the system's design must navigate around parameter tables. Neither audience is well served.
- **Fix:** Either split each contract page into two (concept + API reference), or introduce clear in-page anchors and a table of contents that separates "Overview" from "API Reference" within each page.

### 1.4 Registration struct undocumented as a type

- **Severity:** Major
- **Page/section:** ControllerPage, RegistrationPage, YourFirstDomainGuide
- **Problem:** The `Registration` struct is referenced in 6+ pages but its field definitions (`label`, `owner`, `secret`, `reserved`) are never documented in a single location. The ControllerPage says parameter type is "Registration" with description "Struct containing label, owner, secret, resolver, and address data" — but the actual fields differ (no `resolver` or `address` fields in the current contract).
- **Why it matters:** A developer cannot implement a registration flow without knowing the struct layout. The prose description of fields does not match the actual struct.
- **Fix:** Add a "Type Definitions" subsection to the Contracts Overview page, or document the struct inline on the ControllerPage with a complete field table.

### 1.5 "The 8 Contracts" duplicated between Introduction and Architecture

- **Severity:** Minor
- **Page/section:** `IntroductionPage.vue` (line 78), `ArchitecturePage.vue` (line 17)
- **Problem:** Both pages list all 8 contracts with name and description. The Architecture page additionally shows addresses and a relationship diagram. The Introduction page shows only names and descriptions.
- **Why it matters:** If a contract is added or renamed, two pages must be updated. The Introduction listing adds no information beyond what Architecture provides.
- **Fix:** Remove the contract grid from IntroductionPage or replace it with a brief mention linking to Architecture.

---

## 2. Coherence Issues

### 2.1 PoP terminology inconsistent across pages

- **Severity:** Moderate
- **Pages:** IntroductionPage, PopPage, PopRulesPage, RegistrationPage, ControllerPage, multiple guides
- **Inconsistency:** Four variations appear:
  - "Proof of Personhood" (capitalised, no hyphens) — 27 instances
  - "proof-of-personhood" (lowercase, hyphenated) — 11 instances
  - "proof of personhood" (lowercase, no hyphens) — scattered
  - "PoP" (acronym) — 89+ instances
- **Why it matters:** The lack of a canonical first-mention pattern means developers cannot predict how the term will appear.
- **Fix:** Standardise to "Proof of Personhood (PoP)" on first mention per page, then "PoP" exclusively afterwards. Use the hyphenated form only as a compound modifier before a noun (e.g. "proof-of-personhood check").

### 2.2 Contract function docs lack consistent return value documentation

- **Severity:** Major
- **Pages:** All 8 contract pages
- **Inconsistency:** Some functions document return values in prose (e.g. `available(label)` — "Checks whether a label is available"), while others do not mention returns at all (e.g. `minCommitmentAge()`, `maxCommitmentAge()`). No contract page uses a structured "Returns" field in the parameter table.
- **Why it matters:** A developer reading the API reference cannot determine what a function returns without reading the code example.
- **Fix:** Add a "Returns" row to `DocParamTable` or add a dedicated returns section below each function. Document the type and semantics for every function.

### 2.3 Sidebar spelling inconsistency: "Decentralized" vs British English

- **Severity:** Minor
- **Page/section:** `docsNav.ts` line 50 — "Decentralized Web"
- **Inconsistency:** The project MEMORY.md specifies "Use British English". The sidebar uses American spelling "Decentralized". Some page content uses "decentralised".
- **Why it matters:** Mixed spelling creates a perception of inattention.
- **Fix:** Decide on one convention and apply it to navigation, headings, and body text.

### 2.4 Some contract pages have no parameter tables for read-only functions

- **Severity:** Moderate
- **Pages:** ControllerPage (`minCommitmentAge`, `maxCommitmentAge` — no DocParamTable), compared with the same page's `available` and `commit` functions which do have parameter tables
- **Inconsistency:** Functions with no parameters still benefit from a return-type section, but the pattern is not applied uniformly.
- **Why it matters:** Developers scanning the page for structured information find gaps.
- **Fix:** Add return-type information even for parameterless functions. Use a uniform section template for every function.

### 2.5 CliPage uses custom tab implementation instead of DocTabs

- **Severity:** Minor
- **Page/section:** `CliPage.vue` — installation method selector uses inline button-based tabs
- **Inconsistency:** Every other tabbed section in the docs uses the `DocTabs` component.
- **Why it matters:** A small consistency gap that increases maintenance burden if the DocTabs API changes.
- **Fix:** Replace the custom tab implementation with `DocTabs`.

---

## 3. Precision Issues

### 3.1 Registration struct description does not match actual fields

- **Severity:** Critical
- **Page/section:** ControllerPage, `makeCommitment` parameter description (line 59)
- **Problematic wording:** "Struct containing label, owner, secret, resolver, and address data"
- **Why it weakens clarity:** The actual `Registration` struct in the contract contains `label`, `owner`, `secret`, and `reserved` (boolean). The docs mention "resolver" and "address data" which are not struct fields. A developer reading this description will expect a different interface.
- **Fix direction:** Replace with the actual field names and types.

### 3.2 No error/revert conditions documented for any function

- **Severity:** Major
- **Page/section:** All contract pages
- **Problematic pattern:** No function documentation mentions what causes a revert. For example, `register()` reverts if called before `minCommitmentAge` or after `maxCommitmentAge`, but this is only mentioned in a callout box below the code example, not in the function's own section.
- **Why it weakens clarity:** Developers handling errors must discover revert conditions by trial or by reading Solidity source.
- **Fix direction:** Add an "Errors" or "Reverts when" subsection to each transaction function.

### 3.3 "6 seconds" commitment age stated as fact without qualification

- **Severity:** Moderate
- **Page/section:** GettingStartedPage (line 71), YourFirstDomainGuide, RegistrationPage
- **Problematic wording:** "Wait at least 6 seconds" / "6 seconds on Paseo"
- **Why it weakens clarity:** The commitment age is a configurable contract parameter (`minCommitmentAge`), not a protocol constant. If the value changes, multiple pages must be updated. No page explains that this value is read from the contract.
- **Fix direction:** State that the minimum wait is determined by the `minCommitmentAge()` function, note the current Paseo value parenthetically, and link to the Controller contract page.

### 3.4 Vague description of pricing formula in multiple locations

- **Severity:** Moderate
- **Page/section:** PopPage (pricing table), PopRulesPage (PoP-gated tiers section)
- **Problematic pattern:** The pricing table shows discrete values but does not show the formula inline. The PopRulesPage mentions "length-based fee" without specifying the multiplier.
- **Why it weakens clarity:** The pricing curve component shows the formula interactively, but a developer reading only the static documentation cannot derive prices.
- **Fix direction:** Show the piecewise formula directly in the pricing table or adjacent prose: `price = startingPrice × (15 − length)` for 9 ≤ length ≤ 14. Already partially addressed by the new "Fee Formula" section on PopPage, but PopRulesPage should cross-link to it.

---

## 4. Example Issues

### 4.1 Code examples reference undefined ABI variables

- **Severity:** Critical
- **Page/section:** ControllerPage code example (line 239), RegistryPage, ResolverPage, and 5 other contract pages
- **Example problem:** All code examples use `controllerAbi`, `registryAbi`, `resolverAbi`, etc. without defining them or showing where to import them from. The ABI is not available as a published npm package.
- **Why it matters:** A developer copying the code example will get `ReferenceError: controllerAbi is not defined`. The example is not runnable as written.
- **Fix:** Either show a minimal inline ABI fragment for the called function, or add a comment explaining where to obtain the ABI (e.g. "ABI available at github.com/paritytech/dotns/abis/").

### 4.2 Code examples missing `walletClient` setup

- **Severity:** Major
- **Page/section:** ControllerPage code example (line 248 uses `walletClient.account.address`, line 261 uses `walletClient.writeContract`)
- **Example problem:** The code creates a `publicClient` for reads but uses an undefined `walletClient` for writes. No setup for `walletClient` is shown.
- **Why it matters:** The example demonstrates the complete registration flow but is not self-contained. A developer must know how to create a viem wallet client for Polkadot, which is non-trivial.
- **Fix:** Either show the walletClient creation (even as a placeholder with comment), or split read-only and write examples and mark the write example as requiring additional setup.

### 4.3 Interactive demos not present on contract pages

- **Severity:** Moderate
- **Page/section:** All 8 contract pages
- **Example problem:** Protocol pages have 2-3 interactive demos each. Guide pages have 1-2. Contract pages have zero interactive demos despite having the most technical content.
- **Why it matters:** Contract pages are where developers go to test specific function calls. The infrastructure exists (TryItSection, 8 interactive components) but is not used on contract pages.
- **Fix:** Add relevant TryItSection demos to contract pages. For example: TryCheckAvailability on ControllerPage, TryResolveName on ResolverPage, TryClassifyName on PopRulesPage.

### 4.4 dWeb code examples are bash-only

- **Severity:** Moderate
- **Page/section:** BulletinPage, HostingPage, DeployWorkflowPage
- **Example problem:** All dWeb examples use bash/curl commands only. No TypeScript/SDK examples are provided, unlike the rest of the documentation.
- **Why it matters:** Developers integrating dWeb hosting programmatically must translate bash examples to their language of choice.
- **Fix:** Add TypeScript examples alongside bash examples using DocTabs to switch between them.

---

## 5. Correctness Concerns

### 5.1 Registration struct field mismatch

- **Severity:** Critical
- **Page/section:** ControllerPage, `makeCommitment` parameter description
- **Concern:** Documentation says the Registration struct contains "label, owner, secret, resolver, and address data". The actual struct in the contract (`../dotns/contracts/controller/DotnsRegistrarController.sol`) contains `label`, `owner`, `secret`, `reserved`.
- **Evidence:** The code example on the same page correctly shows `reserved: false` (line 250), contradicting the parameter description above it.
- **Code verification required:** Yes — verify the exact current fields of the `Registration` struct.

### 5.2 `priceWithCheck` vs `priceWithoutCheck` missing distinction

- **Severity:** Major
- **Page/section:** PopRulesPage
- **Concern:** The page documents both functions but does not clearly state that `priceWithCheck` will revert for reserved/PoP-gated names while `priceWithoutCheck` returns metadata without reverting. This is a critical behavioural distinction for integrators.
- **Evidence:** The function descriptions use similar wording. A developer may choose the wrong function and encounter unexpected reverts.
- **Code verification required:** Partial — the naming convention suggests check vs no-check semantics, but the docs should state this explicitly.

### 5.3 Commitment age values may be outdated

- **Severity:** Moderate
- **Page/section:** GettingStartedPage, YourFirstDomainGuide, RegistrationPage
- **Concern:** Multiple pages state "6 seconds" as the commitment wait time. This value is read from the contract's `minCommitmentAge()` function and can be changed by governance.
- **Evidence:** The store code in `useDomainStore.ts` line 320 adds 2 seconds to the on-chain value as a buffer, suggesting the raw value may differ from what is documented.
- **Code verification required:** Yes — query current `minCommitmentAge()` on Paseo.

### 5.4 Missing `setAddr` documentation on ResolverPage

- **Severity:** Moderate
- **Page/section:** ResolverPage
- **Concern:** The resolver's `addr(node)` read function is documented, but the corresponding `setAddr(node, address)` write function may not be documented with the same detail. Requires verification that all write functions on the resolver have complete documentation.
- **Code verification required:** Yes — compare documented functions against the Resolver ABI.

---

## 6. Repair Plan

### Phase 1: Fix navigation and entry points

**Objective:** Ensure a developer can reach a working state within the first 3 pages.

**Tasks:**
1. Move Guides above Use Cases in `docsNav.ts`.
2. Add a "Quick Start" subsection to Getting Started that shows: install CLI, configure testnet, register a name in 3 commands.
3. Add RouterLinks from IntroductionPage to Contracts Overview and Guides section.
4. Add RouterLinks from Getting Started to the first guide ("Your First Domain").

**Expected outcome:** A new developer reaches a runnable example within 2 pages.

### Phase 2: Separate concepts from reference

**Objective:** Make contract pages usable as both concept overview and API reference without mixing.

**Tasks:**
1. Add in-page anchors and a "Functions" table of contents to each contract page.
2. Add "Returns" documentation to every function.
3. Add "Reverts when" documentation to every transaction function.
4. Document the `Registration`, `PriceWithMeta`, `PopStatus`, and `SubnodeRecord` types in a single "Type Definitions" section on the Contracts Overview page.
5. Fix the Registration struct description on ControllerPage.

**Expected outcome:** Contract pages serve as reliable API reference with complete type, parameter, return, and error documentation.

### Phase 3: Standardise component and API pages

**Objective:** Every contract page follows the same template.

**Tasks:**
1. Define a contract page template: Header → Deployed Address → Overview → Functions (each with signature, badge, description, parameters, returns, errors) → Code Example → Callouts → Navigation.
2. Apply the template to all 8 contract pages.
3. Replace custom tabs on CliPage with DocTabs.
4. Add at least one TryItSection to each contract page.
5. Add "Returns" capability to `DocParamTable` or create a `DocReturnsTable` component.

**Expected outcome:** All contract pages are structurally identical and contain complete function documentation.

### Phase 4: Repair examples and cross-links

**Objective:** Every code example is self-contained and every concept mention links to its documentation.

**Tasks:**
1. Add inline ABI fragments or ABI source comments to all code examples.
2. Add walletClient setup to write-operation examples.
3. Add RouterLinks from guide prose to contract pages where contracts are mentioned.
4. Add TypeScript examples alongside bash examples on dWeb pages.
5. Add contextual cross-links from PopRulesPage to the PopPage fee formula section.

**Expected outcome:** Code examples can be copied and run. Developers can navigate from any mention of a contract or concept to its documentation.

### Phase 5: Final consistency pass

**Objective:** Eliminate terminology and formatting inconsistencies.

**Tasks:**
1. Standardise PoP terminology to "Proof of Personhood (PoP)" first-mention pattern.
2. Standardise spelling convention (British or American) across all pages and the sidebar.
3. Replace hardcoded "6 seconds" with references to `minCommitmentAge()` with current Paseo value noted parenthetically.
4. Verify all contract addresses against `networks.ts` (currently all correct — establish a CI check).
5. Verify all function signatures against current ABIs.

**Expected outcome:** The documentation reads as a single coherent system with consistent terminology and verifiable technical claims.

---

## 7. Priority Table

| Issue | Severity | Effort | Impact | Phase |
|-------|----------|--------|--------|-------|
| Registration struct description wrong | Critical | Low | High | 2 |
| Code examples reference undefined ABIs | Critical | Medium | High | 4 |
| No return values documented | Major | Medium | High | 2 |
| No revert conditions documented | Major | Medium | High | 2 |
| Guides placed after Use Cases | Major | Low | Medium | 1 |
| No installation/quick start page | Major | Medium | High | 1 |
| Type definitions undocumented | Major | Medium | High | 2 |
| walletClient undefined in examples | Major | Low | High | 4 |
| priceWithCheck vs priceWithoutCheck unclear | Major | Low | Medium | 2 |
| Cross-links missing from guides to contracts | Major | Low | Medium | 4 |
| PoP terminology inconsistent | Moderate | Low | Low | 5 |
| Contract pages mix concept and reference | Moderate | High | Medium | 3 |
| Commitment age hardcoded as "6 seconds" | Moderate | Low | Low | 5 |
| No interactive demos on contract pages | Moderate | Medium | Medium | 3 |
| dWeb examples bash-only | Moderate | Medium | Medium | 4 |
| Contract function docs inconsistent structure | Moderate | Medium | Medium | 3 |
| Missing setAddr docs on Resolver | Moderate | Low | Medium | 2 |
| Duplicated contract list (Intro + Architecture) | Minor | Low | Low | 5 |
| CliPage uses custom tabs | Minor | Low | Low | 3 |
| Spelling inconsistency (Decentralized) | Minor | Low | Low | 5 |

---

## 8. Page Template Gaps

### 8.1 Contract function reference template

**Purpose:** Standardise how each function is documented across all contract pages.

**Required sections:**
1. Function signature (monospace, with DocBadge: read-only or transaction)
2. Description (1-2 sentences)
3. Parameters (DocParamTable with name, type, description, required)
4. Returns (type, description)
5. Errors / Reverts when (condition → error message)
6. Minimal example (3-5 lines showing the call)

### 8.2 Type definition template

**Purpose:** Document shared types (structs, enums) used across multiple contracts.

**Required sections:**
1. Type name
2. Source contract
3. Field table (name, type, description)
4. Usage context (which functions accept or return this type)
5. Example construction

### 8.3 Guide page template

**Purpose:** Ensure every guide follows a predictable structure.

**Required sections:**
1. Goal statement (one sentence: what the reader will accomplish)
2. Prerequisites (with links)
3. Steps (numbered, each with code and explanation)
4. Verification (how to confirm the task succeeded)
5. What's next (links to related guides and reference pages)
6. Related contracts (links to contract pages used in the guide)

### 8.4 Use-case page template

**Purpose:** Distinguish use cases from guides by focusing on architecture rather than step-by-step instructions.

**Required sections:**
1. Problem statement
2. Architecture / approach
3. Key contracts and functions involved (with links)
4. Code example (realistic, minimal)
5. Considerations and trade-offs
6. Related guides (links)

---

## 9. Summary

### Three most serious problems

1. **Registration struct description is wrong.** The ControllerPage documents fields that do not exist in the contract. A developer implementing the registration flow will construct an incorrect struct.

2. **Code examples are not runnable.** Every contract page code example references undefined ABI and walletClient variables. A developer cannot copy-paste and execute any example without significant additional work.

3. **No return values or error conditions documented.** Not a single contract function has structured return-type or revert-condition documentation. Developers must read Solidity source to determine what functions return and when they fail.

### Three highest-value fixes

1. **Add return values and error conditions to all contract functions.** This transforms the contract pages from partial reference into complete API documentation. Medium effort, high impact across all integrators.

2. **Fix the Registration struct description and add type definitions.** Low effort, eliminates the most dangerous factual error and fills the most referenced documentation gap.

3. **Add ABI source comments and inline fragments to code examples.** Medium effort, makes every code example copyable and runnable, directly improving developer experience.
