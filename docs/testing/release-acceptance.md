# Tab Shelf 1.0.0 Release Acceptance

Date: 25 August 2026

Owner: James Li / Jovaii

Target: Safari on the current Mac

## Decision

The automated source, generated-project, deterministic WebKit, local package, installation, signature, registration, and visual candidate is accepted. The overall release remains `QA-IN-PROGRESS` until real Safari profile actions pass.

## Verified

- 312/312 automated tests passed.
- Repository audit passed with zero runtime dependencies and zero prohibited product-identity matches.
- All JavaScript and shell syntax checks passed.
- Eighteen deterministic native WebKit stages passed across 1440 × 900 and 900 × 900: category metrics, stable card widths, handle coverage, same-category order, custom-category creation, cross-category movement, reload persistence, settings navigation, Storm Horizon selection, workspace reset with theme preservation, and one-tab close.
- Four original synthetic-data release visuals were generated from Tab Shelf UI, including an exact 1280 × 640 social preview. Independent review approved all four after two bounded crop/composition fixes passed retest; no visual finding remains.
- Domain cards receive stable, distinct local accents and upgrade from an already-loaded readable favicon without adding a network request or host permission.
- The shelf uses the approved editorial display face and Avenir Next / SF Pro / PingFang body stack with 16px domain headings and 15px tab titles.
- Automatic classification, persistent manual assignment, bounded custom categories, pointer cancellation, keyboard parity, concurrent updates, and separate layout reset passed focused tests.
- App packaging refuses Command Line Tools-only environments before creating output.
- Xcode 26.6 completed the final Release rebuild with the `Tab Shelf` scheme.
- The built App uses `com.jovaii.tabshelf`; its Safari Extension uses `com.jovaii.tabshelf.extension`.
- The App and extension passed strict ad-hoc signature verification for local use.
- `Tab Shelf.app` is installed and running from `/Applications/Tab Shelf.app`; key installed extension sources match the just-built App byte for byte.
- A read-only system registration query reported exactly one registered Tab Shelf extension at version 1.0.0.
- `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` are present in the installed App bundle.

## Current external boundary

Full Xcode is required for repeat builds because Command Line Tools do not provide Apple's `safari-web-extension-packager`. Xcode 26.6 is installed on the current Mac and produced `build/Tab Shelf.app` plus `dist/Tab-Shelf-1.0.0.zip`.

The current App uses an ad-hoc local signature. It is not a Developer ID-signed or notarized distribution build and is not represented as suitable for third-party distribution.

Temporary Safari profile acceptance remains manual. It includes enabling the extension; exercising automatic classification, persistent drag ordering, keyboard alternatives, custom categories, concurrent shelf pages, real tab activation, and disposable close actions; and checking duplicate state, theme persistence, separate appearance/layout resets, export/import, keyboard order, and reduced motion. Follow [local-safari-acceptance.md](local-safari-acceptance.md).

## Release blockers

- No open P0 or P1 software issue is known from completed layers.
- Local App use: no build, installation, signature, or registration blocker.
- Safari profile enablement and real-tab actions remain manual.
- GitHub source and metadata synchronization is complete; no binary consumer release was created. Apple Distribution archive/upload remains behind account-owned prerequisites and explicit submission approval.

## Evidence

- Automated tests: `npm test`
- Repository audit: `npm run audit`
- WebKit run: `npm run preview`, followed by `npm run render:preview`
- Local package: `build/Tab Shelf.app`
- Local archive: `dist/Tab-Shelf-1.0.0.zip`
- Installed App: `/Applications/Tab Shelf.app`
- Local QA report: ignored development artifact under `artifacts/qa/qa-2026-08-25-001/report/index.html`
