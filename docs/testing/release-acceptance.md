# Tab Shelf 1.0.0 Release Acceptance

Date: 24 August 2026

Owner: James Li / Jovaii

Target: Safari on the current Mac

## Decision

The source release is ready for local temporary Safari acceptance. Official App generation and installation remain pending until full Xcode is installed.

## Verified

- 74/74 automated tests passed.
- Repository audit passed with zero runtime dependencies and zero prohibited product-identity matches.
- All JavaScript and shell syntax checks passed.
- Eight deterministic native WebKit journeys passed: shelf metrics, one-tab close, settings navigation, and Neon Bloom selection at 1440 × 900 and 900 × 900.
- Both screenshots had exact requested dimensions, uniform cards, readable text, no horizontal overflow, and the exact `Tab Shelf by James Li` credit.
- Four generated icon and package contract groups passed.
- App packaging refuses Command Line Tools-only environments before creating output.
- Legal package inputs are present: `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md`.

## Current external boundary

Full Xcode is required because Command Line Tools do not provide Apple's `safari-web-extension-packager`. The packaging and recoverable installation scripts are implemented and tested as static contracts, but no claim is made that a signed App or ZIP currently exists.

Temporary Safari profile acceptance remains manual. It includes enabling the extension, exercising real tab activation and disposable close actions, checking theme persistence, export/import/reset, and keyboard order. Follow [local-safari-acceptance.md](local-safari-acceptance.md).

## Release blockers

- No open P0 or P1 software issue.
- Official App release: blocked only by the missing full Xcode installation.
- Temporary local use: ready for the current Safari profile after the manual checklist is completed.

## Evidence

- Automated tests: `npm test`
- Repository audit: `npm run audit`
- WebKit run: `npm run preview`, followed by `npm run render:preview`
- Local QA report: ignored development artifact under `artifacts/qa/qa-2026-08-24-001/report/index.html`
