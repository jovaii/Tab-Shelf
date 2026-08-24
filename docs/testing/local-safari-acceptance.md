# Local Safari Acceptance

This checklist covers the independent Tab Shelf Safari Web Extension on the current Mac. It uses no external service, account, runtime package, or remote asset.

## Automated result — 24 August 2026

The deterministic local WebKit run passed at 1440 × 900 and 900 × 900. Each viewport verified:

- six equal domain cards from eight synthetic web tabs;
- no horizontal document overflow;
- the exact `Tab Shelf by James Li` credit;
- one-tab close reducing the visible count from eight to seven;
- navigation from the shelf to Theme Studio;
- selection of Neon Bloom changing the document to light text;
- final PNG output at the requested pixel dimensions.

The repository contract tests also verify the Safari-only browser API, minimal `tabs` and `storage` permissions, local-only settings, four authored themes, safe preference import, and independent PNG artwork.

The visual contract additionally verifies domain-specific card accents, privacy-safe favicon sampling with deterministic fallback colors, and the approved multilingual typography stack.

## Repeat the local WebKit run

From the repository root, start the loopback-only preview server:

```bash
node scripts/serve-preview.mjs --host 127.0.0.1 --port 4173
```

In a second terminal, render and exercise both viewports:

```bash
SWIFT_MODULECACHE_PATH=/private/tmp/tab-shelf-swift-cache \
CLANG_MODULE_CACHE_PATH=/private/tmp/tab-shelf-swift-cache \
swift scripts/render-preview.swift \
  'http://127.0.0.1:4173/shelf.html?preview=1' \
  build/screenshots
```

Preview data is injected only for an exact `?preview=1` request when no real Safari extension API exists. Files under `extension/` never read the synthetic fixture.

## Add the temporary extension to Safari

1. Open Safari → Settings → Advanced and enable **Show features for web developers**.
2. Open Safari → Settings → Developer and enable **Allow unsigned extensions**. Safari resets this switch after it fully quits.
3. Select **Add Temporary Extension…**.
4. Choose this repository's `extension` folder, the folder that directly contains `manifest.json`.
5. Open Safari → Settings → Extensions, locate **Tab Shelf**, and enable it for the current profile.
6. Open a new Safari tab. The page title, toolbar item, and extension name must all read **Tab Shelf**.

The temporary extension is for local testing only. It is not an installed or signed macOS application and may need to be added again after Safari restarts.

## Current-profile manual checklist

Use disposable test tabs for close actions. Do not test closing against tabs containing unsaved work.

| Scenario | Expected result | Status |
| --- | --- | --- |
| New tab replacement | A new Safari tab opens the Tab Shelf page | Pending in the current Safari profile |
| Real tab grouping | Ordinary HTTP(S) tabs appear once under their domain | Pending in the current Safari profile |
| Domain accents | Cards are visually distinct; readable favicons may refine their stable fallback colors | Pending in the current Safari profile |
| Activate tab | Selecting a title focuses its Safari window and tab | Pending in the current Safari profile |
| Close one | The selected disposable tab closes and the count updates | Pending in the current Safari profile |
| Close a domain | All disposable tabs in that domain close | Pending in the current Safari profile |
| Extra shelves | When two shelf pages exist, **Close extra shelves** keeps the current one | Pending in the current Safari profile |
| Toolbar count | The badge and popover count only ordinary HTTP(S) tabs | Pending in the current Safari profile |
| Theme persistence | A chosen preset remains after closing and reopening a new tab | Pending in the current Safari profile |
| Custom appearance | Color, gradient, image, opacity, blur, text mode, and accent controls update the preview | Pending in the current Safari profile |
| Reset | **Reset appearance** restores Quiet Neutral | Pending in the current Safari profile |
| Export | Export downloads `tab-shelf-preferences-v1.json` | Pending in the current Safari profile |
| Valid import | A file exported by Tab Shelf restores the same theme | Pending in the current Safari profile |
| Invalid import | Another schema or malformed JSON is rejected without changing the saved theme | Pending in the current Safari profile |
| Keyboard | Visible focus reaches settings, tab titles, close actions, and theme controls in logical order | Pending in the current Safari profile |

## Release boundary

Automated WebKit acceptance is complete. Real Safari profile actions remain an explicit manual confirmation because they can focus or close the user's real tabs. Full Xcode 26.6 is available on this Mac and the official local `.app` packaging flow is operational; the current build remains ad-hoc signed for personal use rather than Developer ID signed and notarized for distribution.
