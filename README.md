# Tab Shelf

Tab Shelf is a Safari-only personal utility for organizing open tabs on the current Mac. It replaces Safari's new-tab page with a calm visual shelf, groups ordinary web tabs by domain, highlights duplicate pages, and provides focused cleanup and appearance controls.

## Features

- One consistent card per domain in a responsive grid.
- A distinct card accent per domain, derived locally from an available favicon with a stable privacy-safe fallback.
- Full tab titles with safe two-line truncation and tooltips.
- Activate a tab, close one tab, close a domain, or close extra shelf pages.
- Toolbar badge and popover for the current web-tab count.
- Four authored themes: Quiet Neutral, Mist Teal, Ice Lavender, and Neon Bloom.
- Custom solid, linear-gradient, radial-gradient, and local-image backgrounds.
- Adjustable image fit, blur, image opacity, overlay, card opacity, text mode, contrast, and accent color.
- Local theme export and import through `tab-shelf-preferences-v1.json`.
- An editorial system-font pairing with readable multilingual tab titles.
- Keyboard focus, reduced-motion support, semantic HTML, and responsive layouts.

## Privacy

Tab Shelf runs inside Safari on the current Mac. No telemetry, analytics, advertising, or account data is collected, and the application makes no network requests of its own. The extension requests only Safari's `tabs` and `storage` permissions. Preferences and an optional personal background image remain in Safari's local extension storage.

Card accents sample only favicon pixels already loaded by Safari. If an image cannot be read, Tab Shelf uses a deterministic color derived from the domain name; it does not fetch another image or send the domain to a service.

The source uses no third-party runtime packages, remote fonts, stock images, or icon packs. Artwork in `extension/icons/` is generated locally from `scripts/generate-icons.swift`.

## Requirements

- A current macOS release with Safari Web Extension support.
- Node.js 24 or newer for the dependency-free test and audit commands.
- Full Xcode only when generating the official macOS App container.

No package installation step is required.

## Temporary Safari installation

1. Open Safari → Settings → Advanced and enable **Show features for web developers**.
2. Open Safari → Settings → Developer and enable **Allow unsigned extensions**.
3. Select **Add Temporary Extension…** and choose the `extension` folder that directly contains `manifest.json`.
4. Open Safari → Settings → Extensions and enable **Tab Shelf** for the current profile.
5. Open a new Safari tab.

Safari resets unsigned-extension permission after it fully quits. See [the local Safari acceptance checklist](docs/testing/local-safari-acceptance.md) before testing close actions against disposable tabs.

## Theme Studio

Open the toolbar popover or the round settings control on the shelf, then select **Theme settings**. Changes save automatically on this Mac. Background images are resized and compressed locally before storage; PNG, JPEG, and WebP are accepted.

Use **Export theme** to download `tab-shelf-preferences-v1.json`. **Import theme** accepts only the current validated Tab Shelf schema. **Reset appearance** restores Quiet Neutral.

## Development checks

Run the entire dependency-free test and repository audit:

```bash
npm run check
```

Run either part separately:

```bash
npm test
npm run audit
```

The audit checks the tracked product, dependency inventory, symlink boundary, product identity, and optional generated App resources without sending repository contents elsewhere.

## Local WebKit preview

Start the loopback-only preview server:

```bash
npm run preview
```

In a second terminal, render both acceptance viewports and exercise close, settings-navigation, and theme-selection journeys:

```bash
npm run render:preview
```

Screenshots are written to `build/screenshots/`. Synthetic tabs are injected only for the explicit local `?preview=1` URL when Safari's extension API is absent. Production files under `extension/` do not read the preview fixture.

## Official macOS App

The App uses bundle identifiers `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`. Install full Xcode, open it once to finish component setup, then run:

```bash
npm run package:macos
npm run install:macos
```

Packaging uses Apple's `safari-web-extension-packager`, builds Release, checks both bundle identifiers, signs the nested extension and outer App ad hoc, verifies signatures, and creates:

- `build/Tab Shelf.app`
- `dist/Tab-Shelf-1.0.0.zip`

The installer verifies the new App before changing `/Applications`. If `/Applications/Tab Shelf.app` already exists, it is moved to a timestamped sibling backup. A failed copy is retained separately and the verified backup is restored. The scripts never recursively delete build or application data.

The App bundle includes [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Project layout

- `extension/` — Safari Web Extension manifest, pages, modules, styles, and icons.
- `scripts/` — audits, local preview, WebKit rendering, artwork, packaging, and installation.
- `tests/` — dependency-free Node tests and synthetic fixtures.
- `docs/testing/` — current Safari and release acceptance records.

## Limitations

- Official App packaging requires full Xcode; Command Line Tools alone do not include Apple's Safari packager.
- A temporary extension may need to be added again after Safari restarts.
- **Save for later** is visibly disabled and reserved for a future version.
- Real Safari close actions should be tested with disposable tabs because closed pages may contain unsaved work.

## Uninstall

For a temporary extension, disable **Tab Shelf** in Safari → Settings → Extensions or fully quit Safari.

For the packaged App, first disable its Safari extension, quit **Tab Shelf**, and move `/Applications/Tab Shelf.app` to Trash. Timestamped `.backup-…` and `.failed-…` siblings are intentionally retained for recovery and can be reviewed separately.

## License

Copyright 2026 James Li / Jovaii.

Tab Shelf source code is licensed under the Apache License 2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
