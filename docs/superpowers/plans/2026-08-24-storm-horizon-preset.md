# Storm Horizon Theme Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an original CSS-only Storm Horizon preset to Theme Studio, verify it visually in the shelf, install the rebuilt Safari App, and publish the verified English source.

**Architecture:** Extend the existing immutable `THEME_PRESETS` data with one Version 1-compatible six-stop linear gradient and add its visible metadata to the settings renderer. Reuse the current validator, CSS-variable runtime, Safari storage gateway, and preview harness; no schema, image asset, dependency, or permission changes are required.

**Tech Stack:** Safari Web Extension, dependency-free JavaScript ES modules, CSS gradients, Node 24 built-in tests, native Swift/WebKit screenshots, Xcode 26.6.

## Global Constraints

- Safari on the current Mac only; no Chrome runtime or build path.
- The preset name is `Storm Horizon` and its note is `Navy sky, coral horizon`.
- Use only an original CSS gradient; do not add the reference bitmap, text, logo, signature, watermark, or attribution.
- Keep `tabShelf.preferences.v1` unchanged and add no preference keys.
- Add no image file, data URL, network request, host permission, package, or runtime dependency.
- Keep all public product documentation in English.
- Preserve the existing light-text palette, domain-specific card accents, keyboard focus, reduced-motion support, and multilingual typography.

---

### Task 1: Authored Preset Data and Settings Option

**Files:**
- Modify: `tests/preferences.test.mjs`
- Modify: `tests/theme-runtime.test.mjs`
- Modify: `tests/settings-contract.test.mjs`
- Modify: `extension/core/preferences.mjs`
- Modify: `extension/settings.mjs`

**Interfaces:**
- Consumes: `theme(options)`, `THEME_PRESETS`, `themeCssVariables(preferences)`, and the existing `PRESET_META` renderer.
- Produces: `THEME_PRESETS["storm-horizon"]` as a frozen Version 1 preference object and a fifth visible settings card.

- [x] **Step 1: Write failing preset, runtime, and settings metadata tests**

Update the authored-preset expectation in `tests/preferences.test.mjs`:

```js
test("uses only the new preference schema and five authored presets", () => {
  assert.equal(PREFERENCE_KEY, "tabShelf.preferences.v1");
  assert.equal(DEFAULT_PREFERENCES.schema, PREFERENCE_KEY);
  assert.deepEqual(
    Object.keys(THEME_PRESETS),
    ["quiet-neutral", "mist-teal", "ice-lavender", "neon-bloom", "storm-horizon"],
  );
  assert.equal(Object.isFrozen(DEFAULT_PREFERENCES), true);
  assert.equal(Object.isFrozen(THEME_PRESETS["storm-horizon"].background.stops), true);
});
```

Add this focused test to `tests/theme-runtime.test.mjs`:

```js
test("maps Storm Horizon to an original six-stop ocean glow", () => {
  const variables = themeCssVariables(THEME_PRESETS["storm-horizon"]);

  assert.equal(
    variables["--page-background"],
    "linear-gradient(180deg, #061923 0%, #092b39 46%, #302631 58%, #ff6255 65%, #2189a5 74%, #072638 100%)",
  );
  assert.equal(variables["--text-mode"], "light");
  assert.equal(variables["--card-background"], "rgb(12 17 20 / 84%)");
  assert.equal(variables["--color-accent-solid"], "#f2b632");
  assert.equal(variables["--background-image"], "none");
});
```

Extend the JavaScript contract in `tests/settings-contract.test.mjs`:

```js
assert.match(javascript, /"storm-horizon": \{ name: "Storm Horizon", note: "Navy sky, coral horizon" \}/u);
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/preferences.test.mjs tests/theme-runtime.test.mjs tests/settings-contract.test.mjs
```

Expected: FAIL because the fifth preset and settings metadata do not exist.

- [x] **Step 3: Add the immutable Storm Horizon preset**

Append this entry after `neon-bloom` in `extension/core/preferences.mjs`:

```js
"storm-horizon": theme({
  name: "storm-horizon",
  background: {
    kind: "linear",
    color: "#061923",
    angle: 180,
    stops: [
      { color: "#061923", position: 0 },
      { color: "#092b39", position: 46 },
      { color: "#302631", position: 58 },
      { color: "#ff6255", position: 65 },
      { color: "#2189a5", position: 74 },
      { color: "#072638", position: 100 },
    ],
  },
  overlayColor: "#04141e",
  overlayOpacity: 0.14,
  cardOpacity: 0.84,
  textMode: "light",
  contrastBoost: true,
  accentColor: "#f2b632",
}),
```

Append this visible option to `PRESET_META` in `extension/settings.mjs`:

```js
"storm-horizon": { name: "Storm Horizon", note: "Navy sky, coral horizon" },
```

- [x] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test tests/preferences.test.mjs tests/theme-runtime.test.mjs tests/settings-contract.test.mjs
```

Expected: all focused tests pass with no warnings.

- [x] **Step 5: Commit the preset implementation**

```bash
git add extension/core/preferences.mjs extension/settings.mjs tests/preferences.test.mjs tests/theme-runtime.test.mjs tests/settings-contract.test.mjs
git diff --cached --check
git commit -m "feat: add Storm Horizon theme preset"
```

### Task 2: Visual Acceptance Journey and English Documentation

**Files:**
- Modify: `tests/preview-contract.test.mjs`
- Modify: `tests/project-contract.test.mjs`
- Modify: `scripts/render-preview.swift`
- Modify: `README.md`
- Modify: `docs/testing/local-safari-acceptance.md`
- Modify: `docs/testing/release-acceptance.md`

**Interfaces:**
- Consumes: the fifth `.preset-button`, preview `localStorage`, `#open-shelf`, and the existing two native WebKit viewports.
- Produces: screenshots of the shelf after Storm Horizon is selected and public documentation that records five themes and 86 automated tests.

- [x] **Step 1: Write failing preview and documentation contracts**

Extend the WebKit renderer contract in `tests/preview-contract.test.mjs`:

```js
assert.match(source, /querySelectorAll\('\.preset-button'\)\[4\]/u);
assert.match(source, /Storm Horizon/u);
assert.ok(source.indexOf("stage=theme-switch") < source.indexOf("takeSnapshot"));
```

Extend `tests/project-contract.test.mjs`:

```js
assert.match(readme, /Five authored themes:[^\n]*Storm Horizon/u);
assert.match(acceptance, /86\/86 automated tests passed/);
```

- [x] **Step 2: Run the two contracts and verify RED**

Run:

```bash
node --test tests/preview-contract.test.mjs tests/project-contract.test.mjs
```

Expected: FAIL because the renderer still selects button index 3 and public documentation still records four themes and 85 tests.

- [x] **Step 3: Make the native WebKit journey select and capture Storm Horizon**

In `scripts/render-preview.swift`, remove the pre-settings snapshot block, select button index 4, and use the following acceptance flow after Theme Studio opens:

```swift
_ = try evaluate("document.querySelectorAll('.preset-button')[4].click(); 'clicked'", in: webView)
guard waitForValue(
    "light",
    script: "document.documentElement.getAttribute('data-text-mode')",
    in: webView
) else {
    throw PreviewFailure(message: "Storm Horizon did not switch text mode for \(viewport.name)")
}
guard waitForValue(
    "true",
    script: "String(getComputedStyle(document.documentElement).getPropertyValue('--page-background').includes('#ff6255'))",
    in: webView
) else {
    throw PreviewFailure(message: "Storm Horizon gradient was not applied for \(viewport.name)")
}
print("PASS viewport=\(viewport.name) stage=theme-switch")

_ = try evaluate("document.querySelector('#open-shelf').click(); 'clicked'", in: webView)
guard waitForValue("/shelf.html", script: "location.pathname", in: webView),
      waitForValue("true", script: renderReadyScript, in: webView),
      waitForValue("light", script: "document.documentElement.getAttribute('data-text-mode')", in: webView) else {
    throw PreviewFailure(message: "Storm Horizon shelf did not reload for \(viewport.name)")
}
```

After that block, retain the existing `WKSnapshotConfiguration`, `takeSnapshot`, and PNG-write block so `shelf-desktop.png` and `shelf-compact.png` depict Storm Horizon.

- [x] **Step 4: Update all public English theme and acceptance text**

Change the README feature line to:

```md
- Five authored themes: Quiet Neutral, Mist Teal, Ice Lavender, Neon Bloom, and Storm Horizon.
```

In `docs/testing/local-safari-acceptance.md`, replace the Neon Bloom journey and four-theme wording with:

```md
- selection of Storm Horizon applying light text and returning to the shelf before capture;

The repository contract tests also verify the Safari-only browser API, minimal `tabs` and `storage` permissions, local-only settings, five authored themes, safe preference import, and independent PNG artwork.
```

In `docs/testing/release-acceptance.md`, record:

```md
- 86/86 automated tests passed.
- Eight deterministic native WebKit journeys passed: shelf metrics, one-tab close, settings navigation, and Storm Horizon selection at 1440 × 900 and 900 × 900.
- Both screenshots capture the Storm Horizon shelf with exact requested dimensions, uniform cards, readable light text, no horizontal overflow, and the exact `Tab Shelf by James Li` credit.
```

- [x] **Step 5: Run the focused contracts and full check**

Run:

```bash
node --test tests/preview-contract.test.mjs tests/project-contract.test.mjs
npm run check
```

Expected: 86/86 tests pass and the repository audit reports `dependencies=0 prohibited=0 whole_file_matches=0`.

- [ ] **Step 6: Commit the acceptance and documentation update**

```bash
git add scripts/render-preview.swift tests/preview-contract.test.mjs tests/project-contract.test.mjs README.md docs/testing/local-safari-acceptance.md docs/testing/release-acceptance.md docs/superpowers/plans/2026-08-24-storm-horizon-preset.md
git diff --cached --check
git commit -m "test: capture Storm Horizon visual acceptance"
```

### Task 3: Visual QA, Packaging, Installation, and GitHub Sync

**Files:**
- Generated: `build/screenshots/shelf-desktop.png`
- Generated: `build/screenshots/shelf-compact.png`
- Generated: `build/Tab Shelf.app`
- Generated: `dist/Tab-Shelf-1.0.0.zip`

**Interfaces:**
- Consumes: the verified source tree, native WebKit renderer, Xcode packager, and recoverable installer.
- Produces: the installed local Safari App, exactly one registered extension instance, and a public GitHub `main` matching the verified source.

- [ ] **Step 1: Render both native WebKit viewports**

Run the loopback-only server:

```bash
npm run preview
```

In a second process run:

```bash
npm run render:preview
```

Expected: eight PASS stages and two PNG files at exactly 1440 × 900 and 900 × 900.

- [ ] **Step 2: Inspect both screenshots**

Verify all of the following:

- a deep navy upper field, narrow coral horizon, cyan lower field, and dark lower water are visible;
- greeting, date, inventory metadata, card content, and footer remain readable in the light appearance;
- domain card identity bands remain distinguishable from the amber global accent;
- cards remain equal, with no merged layout, clipping, or horizontal overflow;
- no reference text, logo, signature, or watermark appears.

- [ ] **Step 3: Rebuild the official local App**

Move only the four exact old generated outputs to a validated `/private/tmp/tab-shelf-pre-storm-build.*` directory, then run:

```bash
npm run package:macos
```

Expected: Xcode reports `BUILD SUCCEEDED`, strict signatures pass, the App identifiers remain `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`, and the App package contains the new preference and settings resources plus all three legal files.

- [ ] **Step 4: Install and verify one Safari extension instance**

```bash
npm run install:macos
```

Expected: `/Applications/Tab Shelf.app` contains byte-identical updated theme resources, passes strict signature verification, and `pluginkit` reports exactly one `com.jovaii.tabshelf.extension` path under `/Applications/Tab Shelf.app`.

- [ ] **Step 5: Run the final completion gate**

```bash
git status --short
npm run check
git diff --check
```

Expected: the worktree is clean after planned commits, 86/86 tests pass, and the audit remains zero for dependencies, prohibited identity text, and whole-file matches.

- [ ] **Step 6: Sync the verified commits to public GitHub without force-push**

Clone `https://github.com/jovaii/Tab-Shelf.git` into a validated `/private/tmp/tab-shelf-github-sync.*` directory, confirm remote `main` has not moved unexpectedly, apply the new local commits, run `npm run check` inside the clone, and push `main:main` without `--force`.

Expected: GitHub API and `git ls-remote` return the same final public SHA, public `main` contains the fifth theme and English documentation, and the public audit passes.

- [ ] **Step 7: Clean temporary artifacts**

After installation and GitHub verification, inspect the exact `/private/tmp/tab-shelf-pre-storm-build.*` and `/private/tmp/tab-shelf-github-sync.*` directories for unexpected links, then remove only those two validated temporary directories. Move the single installer-created old App backup to Trash and unregister every non-current Launch Services path.

Expected: the new App, new build archive, source worktree, and public GitHub remain intact; only the two task-specific temporary directories are permanently removed.
