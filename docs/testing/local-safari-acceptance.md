# Local Safari Acceptance

This checklist covers the independent Tab Shelf Safari Web Extension on the current Mac. It uses no external service, account, runtime package, or remote asset.

## Automated and packaged result — 25 August 2026

The deterministic local WebKit run passed at 1440 × 900 and 900 × 900. Eighteen recorded stages across the two viewports verified:

- six domain cards from eight synthetic web tabs, organized into four category sections;
- stable 3-column desktop and 2-column compact card widths with no horizontal document overflow;
- dedicated accessible card and category handles;
- same-category reordering and a cross-category move into a new `Preview Focus` custom category;
- saved workspace order and assignment after reload;
- **Reset tab layout** restoring automatic categories while preserving Storm Horizon;
- the exact `Tab Shelf by James Li` credit;
- one-tab close reducing the visible count from eight to seven;
- navigation from the shelf to Theme Studio;
- selection of Storm Horizon applying light text and returning to the shelf before capture;
- final PNG output at the requested pixel dimensions.

The repository contract tests also verify the Safari-only browser API, minimal `tabs` and `storage` permissions, local-only settings, five authored themes, safe preference import, deterministic automatic classification, bounded workspace storage, immutable organization actions, pointer cancellation, keyboard alternatives, and independent PNG artwork.

The visual contract additionally verifies domain-specific card accents, privacy-safe favicon sampling with deterministic fallback colors, and the approved multilingual typography stack.

The final source baseline passed 312/312 automated tests. Repository audit and source readiness passed with zero runtime dependencies, zero prohibited product-identity matches, and zero release-secret findings. Generated-project readiness, the Xcode Release build, recoverable installation, strict App/extension signatures, embedded legal-file checks, and byte-for-byte installed source checks passed for Tab Shelf 1.0.0 build 1. A read-only system query reported exactly one registered `com.jovaii.tabshelf.extension` entry at `/Applications/Tab Shelf.app`.

Four release visuals use only real Tab Shelf UI and representative synthetic content. Independent visual QA approved all four after two bounded crop/composition findings passed retest; no P0/P1/P2/P3 remains.

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

Prepare the manual run with a clean disposable Safari window:

1. Open one disposable page each on `chatgpt.com`, `linkedin.com`, and `deepl.com`, plus a second different `linkedin.com` page.
2. Open the same disposable DeepL URL a second time to create one canonical duplicate.
3. Open a new tab for Tab Shelf, then open one additional Tab Shelf page so **Close extra shelves** can be tested.
4. Record the active appearance, select Storm Horizon if no appearance has been chosen, and avoid capturing any personal tab title or URL.
5. Perform close actions only after every organization and persistence check has passed.

| Scenario | Expected result | Status |
| --- | --- | --- |
| New tab replacement | A new Safari tab opens the Tab Shelf page | Pending in the current Safari profile |
| Automatic classification | Disposable domains appear once under deterministic local categories | Pending in the current Safari profile |
| Duplicate detection | Two disposable tabs with the same canonical URL are visibly marked as duplicates | Pending in the current Safari profile |
| Domain accents | Cards are visually distinct; readable favicons may refine their stable fallback colors | Pending in the current Safari profile |
| Same-category drag | Drag the two same-category domain cards by their handles; the exact order remains after reopening Tab Shelf | Pending in the current Safari profile |
| Cross-category drag | Drag one domain by its handle into another category; the manual assignment remains after reopening Tab Shelf | Pending in the current Safari profile |
| Category drag | Drag a category by its handle; the category order remains after reopening Tab Shelf | Pending in the current Safari profile |
| Custom category | Create `Review`, move a disposable domain into it, rename it `Review Later`, and confirm the 40-character input bound | Pending in the current Safari profile |
| Collapse persistence | Collapse `Review Later`, reopen Tab Shelf, and confirm that it remains collapsed | Pending in the current Safari profile |
| Safe custom delete | Delete `Review Later`; its domain returns to automatic classification and no Safari tab closes | Pending in the current Safari profile |
| Keyboard card move | Use the card move menu to move a disposable domain earlier, later, and to another category | Pending in the current Safari profile |
| Keyboard category move | Use the category move menu to move a category earlier and later | Pending in the current Safari profile |
| Concurrent shelf pages | Change layout with two shelf pages open; both converge without duplicate cards or lost order | Pending in the current Safari profile |
| Activate tab | Selecting a title focuses its Safari window and tab | Pending in the current Safari profile |
| Close one | The selected disposable tab closes and the count updates | Pending in the current Safari profile |
| Close a domain | All disposable tabs in that domain close | Pending in the current Safari profile |
| Extra shelves | When two shelf pages exist, **Close extra shelves** keeps the current one | Pending in the current Safari profile |
| Toolbar count | The badge and popover count only ordinary HTTP(S) tabs | Pending in the current Safari profile |
| Theme persistence | A chosen preset remains after closing and reopening a new tab | Pending in the current Safari profile |
| Custom appearance | Color, gradient, image, opacity, blur, text mode, and accent controls update the preview | Pending in the current Safari profile |
| Appearance reset | **Reset appearance** restores Quiet Neutral without changing the saved tab layout | Pending in the current Safari profile |
| Layout reset | After restoring Storm Horizon, **Reset tab layout** restores automatic categories and default ordering without changing the theme or closing tabs | Pending in the current Safari profile |
| Export | Export downloads `tab-shelf-preferences-v1.json` | Pending in the current Safari profile |
| Valid import | A file exported by Tab Shelf restores the same theme | Pending in the current Safari profile |
| Invalid import | Another schema or malformed JSON is rejected without changing the saved theme | Pending in the current Safari profile |
| Keyboard | Visible focus reaches settings, category handles and menus, card handles and menus, tab titles, close actions, and theme controls in logical order | Pending in the current Safari profile |
| Reduced motion | With Reduce Motion enabled, transitions and scrolling avoid unnecessary animation | Pending in the current Safari profile |

## Release boundary

Automated source, WebKit, generated-project, package, installation, signature, and single-registration acceptance are complete. Real Safari profile actions remain an explicit manual confirmation because macOS Automation did not return Safari Apple Events in this execution context and tab actions can focus or close the user's real tabs. Full Xcode 26.6 is available on this Mac and the official local `.app` packaging flow is operational; the current build remains ad-hoc signed for personal use rather than Apple Distribution signed for App Store upload.
