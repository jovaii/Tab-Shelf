# Independent Tab Shelf Design

## Status

Approved for implementation on 24 August 2026.

## Product Goal

Tab Shelf is a small, Safari-only personal utility for the current Mac. It replaces Safari's new-tab page with a calm visual shelf that groups open tabs by website, makes tab cleanup fast, and lets the owner personalize the background and reading contrast.

The product is developed as a new and independent work. It is not a continuation, fork, port, or modification of any predecessor project.

## Independence Boundary

The following rules are mandatory:

- Start from this empty repository and its new Git history.
- Do not copy, translate, adapt, or migrate source code, tests, configuration, build scripts, documentation, images, icons, fonts, or other assets from any predecessor project.
- Do not import settings or stored data from an earlier application.
- Implement only the user-confirmed functional requirements and visual direction.
- Use a new architecture, file structure, storage schema, bundle identifiers, icons, and product copy.
- Use no third-party runtime packages, web fonts, stock images, or icon packs.
- Use system fonts, CSS-drawn interface symbols, and newly authored artwork only.
- Keep predecessor names, authors, repository links, package identifiers, and license notices out of every tracked file, generated product file, commit message, tag, release note, and public repository field.
- Do not connect this local repository to an existing remote repository containing predecessor history.
- Before publication, perform a normal repository-wide identity scan, whole-file hash comparison, generated-bundle scan, dependency inventory, and fresh-clone test.

The independence check is a practical product-release check, not a forensic evidence system. It creates no encrypted ledger, historical archive, secondary backup requirement, or exhaustive hosted-service capture.

## Ownership and License

- Product: Tab Shelf
- Brand: Jovaii
- Author: James Li
- Copyright notice: `Copyright 2026 James Li / Jovaii`
- Project license: Apache License 2.0

The root `LICENSE` will contain the standard Apache License 2.0 text. Source headers are optional; where present, they use only the copyright notice above and an Apache-2.0 SPDX identifier.

Because the initial product has no bundled third-party code, fonts, images, or packages, it will not need a third-party notices file. If a dependency is added later, its license must be reviewed before it enters the repository or App bundle.

## Supported Environment

- Safari on the current Mac only.
- Apple Silicon and Intel compatibility are desirable when the installed SDK supports a universal build, but only the current Mac is an acceptance requirement.
- No Chrome support, Chrome build, Chrome test, or Chrome runtime path.
- Local ad-hoc signing is sufficient for the first personal release.
- Developer ID signing and notarization are optional later release work and are not required for the first independent build.

## Version 1 Functional Scope

### New-tab shelf

- Replace Safari's new-tab page through a Safari Web Extension manifest override.
- Display a greeting, date, open-tab count, settings button, and the product credit `Tab Shelf by James Li`.
- Load quickly without a redirect page or remote network dependency.

### Tab inventory

- Read normal Safari browser tabs through the Web Extension tabs API.
- Exclude the current shelf page and non-web internal pages from the visible inventory.
- Normalize host names and group tabs by website domain.
- Display each group as one uniform card in a responsive grid.
- Keep every card structurally consistent: header, tab rows, and a footer action area.
- Cards use equal visual rhythm rather than masonry or merged blocks.
- Long titles use a two-line clamp while preserving the full title in an accessible tooltip.
- Activate a selected tab, close one tab, close a domain group, and close extra shelf pages while retaining the current one.
- Show a duplicate-page indicator when the same normalized URL is open more than once.

### Toolbar control

- Provide a small Safari toolbar popover.
- Show the current visible web-tab count.
- Offer direct actions to open the shelf and open theme settings.

### Theme settings

- Include three newly authored visual presets based only on abstract color direction:
  - Mist Teal: pale atmospheric gray into deep teal.
  - Ice Lavender: cool cyan into soft lavender.
  - Neon Bloom: near-black with a restrained magenta glow.
- Include one neutral default preset suitable for daily use.
- Allow a solid color, linear gradient, or radial gradient.
- Allow two to six gradient color stops.
- Allow a local background image chosen by the user, stored only on the current Mac.
- Allow background fit, blur, image opacity, overlay color, overlay intensity, card opacity, text appearance, contrast boost, and accent color.
- Persist settings in the extension's local storage using a new `tabShelf.preferences.v1` schema.
- Support reset, JSON export, and JSON import for this new schema only.

### Privacy and network behavior

- Store all preferences locally.
- Send no telemetry or analytics.
- Make no application-owned network requests.
- Website favicons may be displayed only when Safari exposes an existing tab favicon URL; the application must not contact a favicon service.
- Request only the Safari extension permissions needed for tab inventory, local storage, and new-tab behavior.

## Visual Direction

The interface should feel like a quiet editorial desk rather than a browser administration panel.

- Use the macOS system sans-serif stack for controls and the system serif stack for the greeting and section title.
- Use a compact type scale with clear roles: display greeting, section heading, card title, body, and metadata.
- Keep body text at or above 14 px and metadata at or above 12 px.
- Use tabular numerals for changing counts.
- Use semantic color tokens for page, surface, text, border, accent, focus, and destructive roles.
- Use one accent hue per theme and reserve it for interactive emphasis.
- Give every card the same radius, border weight, internal padding, row gap, and footer alignment.
- Use one primary grid with responsive columns; never merge neighboring cards or vertically stack two cards inside one grid cell.
- Preserve readable contrast over every preset and custom background with an automatic protective overlay.
- Respect reduced-motion preferences and expose visible keyboard focus.

## Architecture

The product has four small layers with explicit boundaries:

1. `core`: pure functions for URL normalization, tab grouping, duplicate detection, counts, and preference validation. It depends on no browser globals.
2. `platform`: a narrow Safari Web Extension adapter that reads and mutates browser tabs and reads/writes local storage.
3. `ui`: the new-tab page, toolbar popover, and settings page. UI modules consume only `core` models and `platform` interfaces.
4. `native`: a minimal Swift macOS container and Safari extension handler using the new bundle identifiers.

The native container packages the Web Extension and provides only installation guidance. Product behavior remains in independently authored Web Extension modules.

## New Identity

- macOS App display name: `Tab Shelf`
- Safari extension display name: `Tab Shelf`
- App bundle identifier: `com.jovaii.tabshelf`
- Extension bundle identifier: `com.jovaii.tabshelf.extension`
- Preference root key: `tabShelf.preferences.v1`
- Default App location: `/Applications/Tab Shelf.app`

The old application is not overwritten during development. The new bundle identifiers allow side-by-side validation. Removal of any earlier local application happens only after the new build passes acceptance.

## Error Handling

- If tab access is unavailable, show a concise permission message and keep settings available.
- If one tab operation fails, refresh the inventory and show a non-blocking action error without hiding other tabs.
- Reject malformed or unsupported preference imports without changing saved settings.
- If a local background image exceeds the storage budget, reject it with a clear size message; do not silently truncate it.
- Never render imported strings as HTML.
- Unsupported browser URLs remain hidden rather than causing the page to fail.

## Testing Strategy

Development follows test-first cycles.

- Use Node's built-in test runner for pure JavaScript behavior; do not install a test framework.
- Test URL normalization, grouping, duplicate detection, operation planning, preference validation, migration rejection, and error states.
- Test the manifest, bundle identifiers, App names, required files, permission floor, and absence of Chrome-specific paths.
- Test UI structure and design tokens with focused static contract tests.
- Use the current Mac's WebKit for visual smoke screenshots; do not launch Chrome.
- Build the native App, verify the nested extension, inspect code signatures, install side by side, and manually test Safari enablement, new-tab replacement, tab activation, tab closure, settings persistence, and theme contrast.

## Normal Independence Release Check

Before the first GitHub publication and App installation:

1. Confirm this repository has a new root commit and no predecessor remote or history.
2. Scan tracked files, commit metadata, generated App contents, ZIP contents, and proposed public text for predecessor identities and identifiers.
3. Compare SHA-256 hashes of complete tracked and bundled files against the predecessor working copy; any unexpected equality blocks publication.
4. Confirm no third-party packages, fonts, images, or copied license notices are present.
5. Confirm the only root license is Apache-2.0 with the new ownership notice.
6. Clone the proposed repository into a temporary directory and repeat the build and identity scan.

This check is intentionally small, repeatable, and sufficient for a personal utility. It verifies the practical independence boundary without preserving or processing the predecessor's private history.

## Acceptance Criteria

Version 1 is accepted when:

- A fresh local build produces `/Applications/Tab Shelf.app` with the new bundle identifiers.
- Safari lists and enables `Tab Shelf` without relying on the earlier application registration.
- A new Safari tab opens the shelf directly.
- Real open web tabs appear in uniform domain cards.
- Activate, close-one, close-group, close-extra-shelves, and duplicate indicators work.
- The toolbar count and navigation actions work.
- Four presets and custom background controls persist after reopening Safari.
- Text remains readable in all presets and focus is keyboard-visible.
- Automated tests, WebKit smoke checks, build validation, independence checks, and a fresh-clone rebuild pass.
- The repository and App bundle contain no predecessor source, history, identity, license notice, or package identifier.
- The public repository contains English product documentation and the new Apache-2.0 license only.

## Explicitly Out of Scope

- Chrome or another browser.
- Cloud sync, accounts, telemetry, or a backend service.
- App Store distribution, Developer ID notarization, or paid Apple enrollment.
- Importing data or preferences from an earlier application.
- Reusing predecessor source code or assets.
- A forensic archive, encrypted evidence system, secondary backup, or exhaustive GitHub surface verifier.
- Deleting or rewriting an existing GitHub repository during initial development.
