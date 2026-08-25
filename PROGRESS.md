# Tab Shelf Release Progress

## Current State

`QA-IN-PROGRESS`

The approved independent product and smart-category workspace are implemented. Task 9 has completed the automated baseline, approval Web views, generated-project validation, local macOS rebuild, recoverable installation, signature checks, single-extension registration check, and updated privacy-safe visuals. Real Safari profile journeys remain open before this state can become `VERIFIED-LOCAL`.

## Execution Ledger

| Phase | Status | Current evidence | Stop signal |
| --- | --- | --- | --- |
| Specification | Complete | Approved design `1c06e1d` and plan `0e32e1d` | Commercial or privacy direction changes |
| Implementation | Complete through Task 9 source/build | Smart categories, pointer and keyboard ordering, custom groups, separate workspace persistence/reset, release configuration, host, public docs, and App Store material | Work expands beyond the approved product |
| Focused verification | Complete | 312/312 tests, audit, source/generated readiness, signatures, WebKit approval views, and updated synthetic visuals | P0/P1, repeated unexplained failure, or missing core-loop evidence |
| Local Safari acceptance | Pending owner confirmation | Installed 1.0.0 build 1 and exactly one registered extension | Any real-tab action is not safely limited to disposable tabs |
| GitHub and Apple delivery | Not started | Exact external gates preserved below | Owner/account/remote state cannot be verified |

## Evidence Ledger

### Repository and automated candidate

FACT: The release branch is `feature/independent-v1`; the final candidate commit is recorded after the documentation and installed-source alignment checks complete.

FACT: `npm run check` passed 312/312 tests. Repository audit reported zero runtime dependencies and zero prohibited or whole-file matches. Source readiness reported Tab Shelf 1.0.0 build 1 with outgoing network entitlement off and zero detected secrets.

SOURCE: Commands executed on 25 August 2026 and local QA run `artifacts/qa/qa-2026-08-25-001/`.

### Generated project, build, and installation

FACT: Xcode 26.6 build 17F113 generated and built the Release App from the tracked Xcode 26.6 profile. `npm run check:app-store` passed with network entitlement off and zero detected secrets.

FACT: `build/Tab Shelf.app` and its embedded extension passed strict ad-hoc signature verification. The bundle identifiers are `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`; `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` are embedded.

FACT: Tab Shelf 1.0.0 build 1 is installed and running from `/Applications/Tab Shelf.app`. A read-only `pluginkit` query reported exactly one registered Tab Shelf extension. The previous installation is retained as a recoverable sibling backup and is not registered as a second extension.

SOURCE: Local package, readiness, install, codesign, plist, process, and pluginkit checks on 25 August 2026.

### Product visuals

FACT: Four original synthetic-data visuals exist under `docs/assets/`: the updated category-workspace hero, Theme Studio, native host states, and an exact 1280 × 640 category-workspace social preview. The updated hero and social preview passed final visual inspection without private browsing data.

SOURCE: Deterministic WebKit output and final visual inspection on 25 August 2026.

### Open local evidence

FACT: macOS Automation did not return Safari Apple Events in the current execution context. No real Safari tab action was reported as passed from that blocked automation route.

NEXT: The owner completes the disposable-tab checklist in `docs/testing/local-safari-acceptance.md`; then rerun all checks and change this state to `VERIFIED-LOCAL`.

SUCCESS: No open P0/P1, all core Safari journeys pass, no P1/P2 visual issue remains, and final signatures/readiness pass against the committed candidate.

## External Gates

- GitHub remote mutation is deferred until local implementation and QA pass and the exact repository, branch, commit, commands, impact, rollback, and cost are presented for approval.
- Apple Distribution archive creation, validation/upload, USD 9.99 pricing activation, and App Review submission are deferred until the enrolled Apple team and App Store Connect state are verified and the exact external action is approved.
