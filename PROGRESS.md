# Tab Shelf Release Progress

## Current State

`DEPLOY-PREFLIGHT`

The approved independent product and smart-category workspace are implemented. Task 9 completed the automated baseline, approval Web views, generated-project validation, local macOS rebuild, recoverable installation, signature checks, single-extension registration check, and updated privacy-safe visuals. Owner-confirmed Safari acceptance is complete. Apple membership compliance submission was accepted, Apple review is pending, and distribution preflight is the active phase.

## Execution Ledger

| Phase | Status | Current evidence | Stop signal |
| --- | --- | --- | --- |
| Specification | Complete | Approved design `1c06e1d` and plan `0e32e1d` | Commercial or privacy direction changes |
| Implementation | Complete through Task 9 source/build | Smart categories, pointer and keyboard ordering, custom groups, separate workspace persistence/reset, release configuration, host, public docs, and App Store material | Work expands beyond the approved product |
| Focused verification | Complete | 314/314 tests, audit, source/generated readiness, signatures, WebKit approval views, and updated synthetic visuals | P0/P1, repeated unexplained failure, or missing core-loop evidence |
| Local Safari acceptance | Complete | The owner confirmed all 27 disposable-tab scenarios passed on 25 August 2026 | Any later candidate changes after acceptance |
| GitHub and Apple delivery | GitHub complete; Apple preflight active | Public source and metadata are synchronized; Apple accepted the membership compliance submission and review is pending | Apple account or submission state cannot be verified |

## Evidence Ledger

### Repository and automated candidate

FACT: The release branch is `feature/independent-v1`; the final candidate commit is recorded after the documentation and installed-source alignment checks complete.

FACT: `npm run check` passed 314/314 tests. Repository audit reported zero runtime dependencies and zero prohibited or whole-file matches. Source readiness reported Tab Shelf 1.0.0 build 1 with outgoing network entitlement off and zero detected secrets.

SOURCE: Commands executed on 25 August 2026 and local QA run `artifacts/qa/qa-2026-08-25-001/`.

### Generated project, build, and installation

FACT: Xcode 26.6 build 17F113 generated and built the Release App from the tracked Xcode 26.6 profile. `npm run check:app-store` passed with network entitlement off and zero detected secrets.

FACT: `build/Tab Shelf.app` and its embedded extension passed strict ad-hoc signature verification. The bundle identifiers are `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`; `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` are embedded.

FACT: Tab Shelf 1.0.0 build 1 is installed and running from `/Applications/Tab Shelf.app`. A read-only `pluginkit` query reported exactly one registered Tab Shelf extension. The previous installation is retained as a recoverable sibling backup and is not registered as a second extension.

SOURCE: Local package, readiness, install, codesign, plist, process, and pluginkit checks on 25 August 2026.

### Product visuals

FACT: Four original synthetic-data visuals exist under `docs/assets/`: the updated category-workspace hero, Theme Studio, native host states, and an exact 1280 × 640 category-workspace social preview. The updated hero and social preview passed final visual inspection without private browsing data.

SOURCE: Deterministic WebKit output and final visual inspection on 25 August 2026.

### Real Safari acceptance

FACT: macOS Automation did not return Safari Apple Events in the agent execution context, so the product owner completed the bounded disposable-tab procedure manually and confirmed all 27 scenarios passed on 25 August 2026.

SOURCE: Owner confirmation in the current release session and `docs/testing/local-safari-acceptance.md`.

SUCCESS: No open P0/P1, all core Safari journeys pass, no P1/P2 visual issue remains, and final signatures/readiness pass against the committed candidate.

### GitHub synchronization

FACT: Public `jovaii/Tab-Shelf` main contains the verified smart-category source, current English documentation, updated category-workspace visuals, and the non-destructive merge of the earlier public history.

FACT: The public repository description and Safari, macOS, Safari Extension, tab-management, and privacy topics are current. No binary GitHub Release was created.

SOURCE: Authenticated repository, commit, metadata, and remote-main queries on 25 August 2026.

## External Gates

- GitHub source and metadata synchronization is complete. Future remote changes remain limited to verified source commits and explicitly approved release actions.
- Apple Distribution archive creation, validation/upload, USD 9.99 pricing activation, and App Review submission are approved by the owner but remain technically gated until the enrolled Apple team and App Store Connect state are verified.

## App Store Preflight Ledger — 25 August 2026

| Phase | Target elapsed time | Current evidence | Stop signal |
| --- | ---: | --- | --- |
| Account and signing facts | 2–4 minutes | Xcode 26.6 is selected; generated Xcode project exists | No enrolled distribution team or signing identity |
| Candidate verification | 1 minute | Run the exact source/generated checks against the submission source | Any test, audit, entitlement, identifier, or secret check fails |
| Local archive | 1–4 minutes | Use the tracked archive workflow; do not upload automatically | Automatic signing cannot create a valid App Store archive |
| Upload and listing | 5–15 minutes plus Apple processing | Safari acceptance is complete; verify account-owned agreements before upload | Membership, agreement, banking, tax, or App record is incomplete |

FACT: The owner explicitly requested expedited App Store packaging and delivery in the current session.

SOURCE: Current conversation and read-only repository preflight on 25 August 2026.

FACT: Apple membership compliance submission was accepted on 25 August 2026; Apple review is pending. No account identifier, identity document, address, phone number, or other personal enrollment data is stored in this repository.

SOURCE: Owner-provided confirmation screen from the Apple Developer enrollment portal.

FACT: Owner-confirmed Safari acceptance is complete. Post-acceptance generated-project readiness, installed App signature verification, and single-extension registration passed; the final release check passed 314/314 tests.

FACT: All membership-independent App Store preparation is complete: the English listing, conditional privacy answers, ordered App Review notes, final local acceptance record, and a valid 1440 × 900 primary product screenshot are prepared. The submission checklist separates these completed local items from Apple-account and delivery gates.

SOURCE: `docs/app-store/`, `docs/assets/tab-shelf-hero.png`, the 314-test release check, and the owner-confirmed Safari acceptance record on 25 August 2026.

NEXT: Wait for Apple to activate membership, then verify the enrolled Xcode team and signing identity before creating the archive.

SUCCESS: A validated Apple Distribution archive is uploaded to the verified Tab Shelf App Store Connect record, its USD 9.99 price and reviewed metadata are set, and the approved version is submitted for review.
