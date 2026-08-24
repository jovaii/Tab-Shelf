# Tab Shelf 1.0.0 Release Acceptance

Date: 24 August 2026

Owner: James Li / Jovaii

Target: Safari on the current Mac

## Decision

The source release and local macOS App are accepted for use on the current Mac. Safari profile actions remain a manual acceptance boundary.

## Verified

- 74/74 automated tests passed.
- Repository audit passed with zero runtime dependencies and zero prohibited product-identity matches.
- All JavaScript and shell syntax checks passed.
- Eight deterministic native WebKit journeys passed: shelf metrics, one-tab close, settings navigation, and Neon Bloom selection at 1440 × 900 and 900 × 900.
- Both screenshots had exact requested dimensions, uniform cards, readable text, no horizontal overflow, and the exact `Tab Shelf by James Li` credit.
- Four generated icon and package contract groups passed.
- App packaging refuses Command Line Tools-only environments before creating output.
- Xcode 26.6 completed the Release build with the `Tab Shelf` scheme.
- The built App uses `com.jovaii.tabshelf`; its Safari Extension uses `com.jovaii.tabshelf.extension`.
- The App and extension passed strict ad-hoc signature verification for local use.
- `Tab Shelf.app` is installed and running from `/Applications/Tab Shelf.app`.
- `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` are present in the installed App bundle.

## Current external boundary

Full Xcode is required for repeat builds because Command Line Tools do not provide Apple's `safari-web-extension-packager`. Xcode 26.6 is installed on the current Mac and produced `build/Tab Shelf.app` plus `dist/Tab-Shelf-1.0.0.zip`.

The current App uses an ad-hoc local signature. It is not a Developer ID-signed or notarized distribution build and is not represented as suitable for third-party distribution.

Temporary Safari profile acceptance remains manual. It includes enabling the extension, exercising real tab activation and disposable close actions, checking theme persistence, export/import/reset, and keyboard order. Follow [local-safari-acceptance.md](local-safari-acceptance.md).

## Release blockers

- No open P0 or P1 software issue.
- Local App use: no build or installation blocker.
- Safari profile enablement and real-tab actions remain manual.
- Developer ID signing and notarization are outside the current personal-use release.

## Evidence

- Automated tests: `npm test`
- Repository audit: `npm run audit`
- WebKit run: `npm run preview`, followed by `npm run render:preview`
- Local package: `build/Tab Shelf.app`
- Local archive: `dist/Tab-Shelf-1.0.0.zip`
- Installed App: `/Applications/Tab Shelf.app`
- Local QA report: ignored development artifact under `artifacts/qa/qa-2026-08-24-001/report/index.html`
