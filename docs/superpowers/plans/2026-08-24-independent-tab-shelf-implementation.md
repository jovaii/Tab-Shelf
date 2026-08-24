# Independent Tab Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Safari-only Tab Shelf utility from an empty repository, with independently authored tab grouping, cleanup actions, theme controls, toolbar UI, and a local macOS container.

**Architecture:** Pure JavaScript modules own tab and preference rules; a narrow Safari adapter owns browser APIs; DOM modules render the shelf, settings, and toolbar popover; Apple tooling later wraps the completed extension in a native macOS app. The implementation has no third-party runtime packages, imports no earlier settings, and keeps all platform-specific behavior behind one adapter.

**Tech Stack:** Safari Web Extension Manifest V3, browser WebExtension APIs, ECMAScript modules, HTML, CSS, Node 24 built-in test runner, Swift/Apple SafariServices packaging, WebKit visual smoke tests.

## Global Constraints

- Safari on the current Mac is the only supported browser and platform acceptance target.
- Use the new identifiers `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`.
- Do not read, copy, translate, adapt, or migrate predecessor source, tests, configuration, scripts, documentation, assets, settings, history, identifiers, or license notices.
- Keep predecessor identity values out of every tracked file and generated product file.
- Use no third-party runtime packages, web fonts, stock images, or icon packs.
- Use system fonts, CSS-drawn controls, and newly authored generated icons.
- Store preferences only under `tabShelf.preferences.v1` and reject every other schema.
- Make no application-owned network requests and include no telemetry.
- Use Apache License 2.0 with `Copyright 2026 James Li / Jovaii`.
- Write public product documentation in English.
- Use test-first RED-GREEN-REFACTOR cycles and commit after each independently passing task.
- Tasks 1–8 run with the currently installed Command Line Tools. Task 9 requires full Xcode because Apple’s official Safari packager and `xcodebuild` are not currently installed.

---

### Task 1: Independent Repository Contract and Release Audit

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `README.md`
- Create: `MEMORY.md`
- Create: `package.json`
- Create: `scripts/audit-repository.mjs`
- Create: `tests/project-contract.test.mjs`

**Interfaces:**
- Consumes: an optional external UTF-8 prohibited-terms file and optional comparison root supplied only at release time.
- Produces: `npm test`, `npm run audit`, and a zero-dependency repository contract used by every later task.

- [ ] **Step 1: Write the failing repository contract test**

```js
// tests/project-contract.test.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("uses the independent product identity", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.name, "tab-shelf");
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.devDependencies ?? {}, {});
  assert.match(readFileSync("NOTICE", "utf8"), /^Tab Shelf\nCopyright 2026 James Li \/ Jovaii\n$/);
});

test("contains no vendored dependency tree", () => {
  assert.equal(existsSync("node_modules"), false);
  assert.equal(existsSync("package-lock.json"), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/project-contract.test.mjs`

Expected: FAIL because `package.json` and `NOTICE` do not exist.

- [ ] **Step 3: Add the independent project metadata**

Create `package.json` with this exact dependency-free shape:

```json
{
  "name": "tab-shelf",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "license": "Apache-2.0",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "audit": "node scripts/audit-repository.mjs"
  }
}
```

Create `NOTICE` exactly as asserted, add the standard Apache License 2.0 text to `LICENSE`, document Safari-only local usage in `README.md`, place the user’s pre-run task/time rule and independence boundary in `MEMORY.md`, and ignore only generated directories and macOS metadata:

```gitignore
.DS_Store
build/
dist/
native/generated/
```

- [ ] **Step 4: Implement the release audit CLI**

Implement these functions in `scripts/audit-repository.mjs`:

```js
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

function assertSafeRoot(path, label) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  return absolute;
}

export function listTrackedFiles(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "buffer" });
  if (result.status !== 0) throw new Error("Unable to enumerate tracked files");
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

export function scanTerms({ root, files, terms }) {
  const lowered = terms.map((term) => term.normalize("NFKC").toLocaleLowerCase("en-US"));
  const findings = [];
  for (const path of files) {
    const content = readFileSync(resolve(root, path)).toString("utf8").normalize("NFKC").toLocaleLowerCase("en-US");
    for (const term of lowered) if (term && content.includes(term)) findings.push({ path, termDigest: sha256(term) });
  }
  return findings;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashFiles({ root, files }) {
  return new Map(files.map((path) => [sha256(readFileSync(resolve(root, path))), path]));
}

function walkFiles(root, directory = root, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Comparison roots must not contain symlinks");
    if (entry.isDirectory()) {
      if (entry.name !== ".git") walkFiles(root, absolute, output);
    } else if (entry.isFile()) output.push(relative(root, absolute).split(sep).join("/"));
  }
  return output.sort();
}

export function compareWholeFileHashes({ candidateRoot, comparisonRoot }) {
  const candidate = hashFiles({ root: candidateRoot, files: listTrackedFiles(candidateRoot) });
  const comparison = hashFiles({ root: comparisonRoot, files: walkFiles(comparisonRoot) });
  return [...candidate].filter(([digest]) => comparison.has(digest)).map(([digest, candidatePath]) => ({
    digest,
    candidatePath,
    comparisonPath: comparison.get(digest),
  }));
}

export function assertNoDependencyTrees(root) {
  for (const name of ["node_modules", "vendor", "Pods", "Carthage"]) {
    try { lstatSync(resolve(root, name)); } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Dependency tree is not allowed: ${name}`);
  }
}

export function runAudit({ root, prohibitedTermsFile, comparisonRoot, productRoot }) {
  const repositoryRoot = assertSafeRoot(root, "Repository root");
  const tracked = listTrackedFiles(repositoryRoot);
  assertNoDependencyTrees(repositoryRoot);
  const terms = prohibitedTermsFile
    ? readFileSync(prohibitedTermsFile, "utf8").split(/\r?\n/u).map((term) => term.trim()).filter(Boolean)
    : [];
  const productFiles = productRoot ? walkFiles(assertSafeRoot(productRoot, "Product root")) : [];
  const findings = scanTerms({ root: repositoryRoot, files: tracked, terms });
  if (productRoot) findings.push(...scanTerms({ root: productRoot, files: productFiles, terms }));
  const equalFiles = comparisonRoot
    ? compareWholeFileHashes({ candidateRoot: repositoryRoot, comparisonRoot: assertSafeRoot(comparisonRoot, "Comparison root") })
    : [];
  if (findings.length || equalFiles.length) throw new Error("Independent release audit failed");
  return { trackedFiles: tracked.length, dependencyCount: 0, prohibitedMatches: 0, wholeFileMatches: 0 };
}
```

The CLI reads `TAB_SHELF_PROHIBITED_TERMS_FILE` and `TAB_SHELF_COMPARISON_ROOT` only when set, rejects symlinks for both inputs, scans tracked files plus an optional generated product root, checks Git commit author/subject/body text, computes SHA-256 with `node:crypto`, and returns a nonzero exit on any match or unexpected whole-file equality. It never writes the external terms into the repository or report output.

- [ ] **Step 5: Verify GREEN**

Run: `npm test`

Expected: all repository contract tests PASS.

Run: `npm run audit`

Expected: `PASS product=Tab Shelf tracked_files=<positive count> dependencies=0`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore LICENSE NOTICE README.md MEMORY.md package.json scripts/audit-repository.mjs tests/project-contract.test.mjs
git commit -m "chore: establish independent Tab Shelf project"
```

### Task 2: Pure Tab Inventory and Cleanup Rules

**Files:**
- Create: `extension/core/tab-model.mjs`
- Create: `tests/tab-model.test.mjs`

**Interfaces:**
- Consumes: raw Safari tab records `{id, windowId, active, title, url, favIconUrl}` and the current shelf tab ID.
- Produces: `isVisibleWebTab`, `canonicalPageUrl`, `groupKeyForUrl`, `buildShelfModel`, `planCloseGroup`, and `planCloseExtraShelves`.

- [ ] **Step 1: Write failing tab-model tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShelfModel,
  canonicalPageUrl,
  planCloseExtraShelves,
} from "../extension/core/tab-model.mjs";

test("groups visible web tabs by normalized host", () => {
  const model = buildShelfModel([
    { id: 1, windowId: 10, title: "One", url: "https://www.example.com/a" },
    { id: 2, windowId: 10, title: "Two", url: "https://example.com/b" },
    { id: 3, windowId: 10, title: "Internal", url: "safari://startpage" },
  ], { currentShelfTabId: 99, extensionOrigin: "safari-web-extension://independent" });
  assert.equal(model.visibleTabCount, 2);
  assert.deepEqual(model.groups.map((group) => [group.key, group.tabs.length]), [["example.com", 2]]);
});

test("marks canonical URL duplicates without discarding either tab", () => {
  assert.equal(canonicalPageUrl("https://example.com/a/#part"), "https://example.com/a");
  const model = buildShelfModel([
    { id: 1, windowId: 10, title: "One", url: "https://example.com/a" },
    { id: 2, windowId: 11, title: "Two", url: "https://example.com/a#section" },
  ], { currentShelfTabId: 99, extensionOrigin: "safari-web-extension://independent" });
  assert.equal(model.duplicatePageCount, 1);
  assert.equal(model.groups[0].tabs.every((tab) => tab.isDuplicate), true);
});

test("closes only other shelf pages", () => {
  assert.deepEqual(planCloseExtraShelves([
    { id: 7, url: "safari-web-extension://independent/shelf.html" },
    { id: 8, url: "safari-web-extension://independent/shelf.html" },
    { id: 9, url: "https://example.com" },
  ], { currentShelfTabId: 7, extensionOrigin: "safari-web-extension://independent" }), [8]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/tab-model.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the pure model**

Use `URL` parsing only. Accept `http:` and `https:`, lower-case host names, remove only a leading `www.`, remove fragments for duplicate comparison, keep queries, sort groups by case-insensitive display name, and sort tabs by original query order. Never mutate input records.

Export this stable model shape:

```js
{
  visibleTabCount,
  duplicatePageCount,
  shelfTabCount,
  groups: [{ key, label, tabs: [{ id, windowId, title, url, favIconUrl, canonicalUrl, isDuplicate }] }]
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/core/tab-model.mjs tests/tab-model.test.mjs
git commit -m "feat: model Safari tabs independently"
```

### Task 3: Theme Presets and Preference Validation

**Files:**
- Create: `extension/core/preferences.mjs`
- Create: `tests/preferences.test.mjs`

**Interfaces:**
- Consumes: unknown JSON values from local storage or import text.
- Produces: `PREFERENCE_KEY`, `DEFAULT_PREFERENCES`, `THEME_PRESETS`, `validatePreferences`, `importPreferences`, and `exportPreferences`.

- [ ] **Step 1: Write failing preference tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  PREFERENCE_KEY,
  THEME_PRESETS,
  importPreferences,
} from "../extension/core/preferences.mjs";

test("uses only the new preference schema", () => {
  assert.equal(PREFERENCE_KEY, "tabShelf.preferences.v1");
  assert.deepEqual(Object.keys(THEME_PRESETS), ["quiet-neutral", "mist-teal", "ice-lavender", "neon-bloom"]);
});

test("rejects another schema without returning partial settings", () => {
  assert.throws(() => importPreferences('{"schema":"another.preferences.v1"}'), /Unsupported preference schema/);
});

test("rejects unsafe or oversized background data", () => {
  assert.throws(() => importPreferences(JSON.stringify({
    schema: "tabShelf.preferences.v1",
    backgroundImage: "data:text/html;base64,PGgxPk5vPC9oMT4=",
  })), /background image/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/preferences.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement presets and closed validation**

The validator admits only these keys and clamps no invalid value silently:

```js
{
  schema,
  preset,
  background: { kind, color, angle, stops },
  backgroundImage,
  imageFit,
  blurPx,
  imageOpacity,
  overlayColor,
  overlayOpacity,
  cardOpacity,
  textMode,
  contrastBoost,
  accentColor,
}
```

Allow hex colors only, two to six stops with positions from 0 through 100, blur from 0 through 40, opacity values from 0 through 1, `cover|contain|fill`, `auto|light|dark`, and PNG/JPEG/WebP data URLs no larger than 4 MiB decoded. Reject unknown keys and unsafe prototypes.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/core/preferences.mjs tests/preferences.test.mjs
git commit -m "feat: define independent theme preferences"
```

### Task 4: Safari Platform Gateway

**Files:**
- Create: `extension/platform/safari-gateway.mjs`
- Create: `tests/safari-gateway.test.mjs`

**Interfaces:**
- Consumes: the Safari-provided `browser` namespace.
- Produces: `createSafariGateway(browserApi)` with `listTabs`, `activateTab`, `closeTabs`, `getPreferences`, `setPreferences`, `openShelf`, `openSettings`, and `setBadge`.

- [ ] **Step 1: Write failing gateway tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createSafariGateway } from "../extension/platform/safari-gateway.mjs";

test("activates a tab and its owning window", async () => {
  const calls = [];
  const gateway = createSafariGateway({
    tabs: {
      update: async (id, patch) => calls.push(["tab", id, patch]),
      get: async () => ({ windowId: 42 }),
    },
    windows: { update: async (id, patch) => calls.push(["window", id, patch]) },
    storage: { local: {} },
    runtime: { getURL: (path) => `safari-web-extension://independent/${path}` },
  });
  await gateway.activateTab(8);
  assert.deepEqual(calls, [["tab", 8, { active: true }], ["window", 42, { focused: true }]]);
});

test("refuses an empty close request", async () => {
  const gateway = createSafariGateway({ tabs: {}, windows: {}, storage: { local: {} }, runtime: {} });
  await assert.rejects(() => gateway.closeTabs([]), /No tab identifiers/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/safari-gateway.test.mjs`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the adapter**

Require a real `browser` namespace and do not add another browser namespace fallback. Normalize callback failures into `TabShelfPlatformError` without including full page URLs in error text. Batch tab removal once, read and write only `PREFERENCE_KEY`, and construct extension URLs only with `browser.runtime.getURL`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/platform/safari-gateway.mjs tests/safari-gateway.test.mjs
git commit -m "feat: add Safari platform gateway"
```

### Task 5: Uniform Shelf Interface

**Files:**
- Create: `extension/shared/tokens.css`
- Create: `extension/ui/dom.mjs`
- Create: `extension/ui/shelf-view.mjs`
- Create: `extension/shelf.html`
- Create: `extension/shelf.css`
- Create: `extension/shelf.mjs`
- Create: `tests/shelf-view.test.mjs`
- Create: `tests/shelf-contract.test.mjs`

**Interfaces:**
- Consumes: the `buildShelfModel` result, validated preferences, and gateway action callbacks.
- Produces: `buildShelfTree(model)`, safe `renderShelf(document, root, model, callbacks)`, and semantic action events `{type, tabId?, tabIds?}`.

- [ ] **Step 1: Write failing view and structure tests**

Test that two groups always produce sibling article nodes under one card-grid tree, every card has header, tab-list, and footer children, titles remain text values rather than HTML, buttons carry accessible labels, and no card contains another card.

```js
test("renders every website as one structurally equal card", () => {
  const tree = buildShelfTree({
    visibleTabCount: 2,
    duplicatePageCount: 0,
    shelfTabCount: 1,
    groups: [
      { key: "alpha.test", label: "Alpha", tabs: [{ id: 1, title: "One", url: "https://alpha.test" }] },
      { key: "beta.test", label: "Beta", tabs: [{ id: 2, title: "Two", url: "https://beta.test" }] },
    ],
  });
  assert.equal(tree.role, "card-grid");
  assert.equal(tree.children.length, 2);
  for (const card of tree.children) {
    assert.equal(card.role, "site-card");
    assert.deepEqual(card.children.map((child) => child.role), ["site-card-header", "site-card-tabs", "site-card-footer"]);
    assert.equal(card.children.flatMap((child) => child.children ?? []).some((child) => child.role === "site-card"), false);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/shelf-view.test.mjs tests/shelf-contract.test.mjs`

Expected: FAIL because shelf modules and files do not exist.

- [ ] **Step 3: Implement safe DOM helpers and shelf rendering**

`extension/ui/dom.mjs` exports `element(document, tag, options)` and never accepts raw HTML. `shelf-view.mjs` first creates the pure tree tested above, then maps the closed tree roles to DOM nodes through `renderShelf(document, root, model, callbacks)`. Each tab row exposes activate, bookmark-placeholder, and close actions; the placeholder remains disabled and titled `Save for later is planned` so Version 1 does not invent incomplete persistence.

- [ ] **Step 4: Implement the visual system**

Use semantic variables in `tokens.css` and this grid contract in `shelf.css`:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
  align-items: stretch;
  gap: clamp(0.875rem, 1.4vw, 1.25rem);
}

.site-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-block-size: 15rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
```

Use the system serif stack only for the greeting/section label, the system sans stack for controls, body text at 14 px or larger, metadata at 12 px or larger, two-line clamping with a `title` attribute, tabular counts, visible `:focus-visible`, and `prefers-reduced-motion`.

- [ ] **Step 5: Wire live actions and recoverable errors**

`shelf.mjs` loads tabs and preferences, renders once, and refreshes after close operations. It displays a permission empty-state on query failure and a non-blocking `role="status"` message for one action failure. It never inserts page titles, hosts, URLs, or import text through `innerHTML`.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/shared extension/ui extension/shelf.html extension/shelf.css extension/shelf.mjs tests/shelf-view.test.mjs tests/shelf-contract.test.mjs
git commit -m "feat: build the Tab Shelf dashboard"
```

### Task 6: Settings, Preset Preview, and Local Image Controls

**Files:**
- Create: `extension/ui/theme-runtime.mjs`
- Create: `extension/settings.html`
- Create: `extension/settings.css`
- Create: `extension/settings.mjs`
- Create: `tests/theme-runtime.test.mjs`
- Create: `tests/settings-contract.test.mjs`

**Interfaces:**
- Consumes: validated preferences and `THEME_PRESETS`.
- Produces: `themeCssVariables(preferences)`, settings-form serialization, preview, reset, import, export, and local-image compression rejection/acceptance.

- [ ] **Step 1: Write failing theme-runtime tests**

```js
test("maps Mist Teal to semantic CSS variables", () => {
  const variables = themeCssVariables(THEME_PRESETS["mist-teal"]);
  assert.match(variables["--page-background"], /gradient/);
  assert.equal(variables["--color-accent"], "#3bc2b2");
  assert.equal(variables["--text-mode"], "dark");
});

test("creates ordered gradient stops", () => {
  const variables = themeCssVariables(validPreferencesWithStops([80, 20]));
  assert.ok(variables["--page-background"].indexOf("20%") < variables["--page-background"].indexOf("80%"));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/theme-runtime.test.mjs tests/settings-contract.test.mjs`

Expected: FAIL because settings modules and documents do not exist.

- [ ] **Step 3: Implement theme variables and settings form**

Render four preset buttons with real miniature CSS previews. Place advanced controls in Background, Surface, Typography, and Transfer fieldsets. Apply live preview through CSS custom properties only. Persist only after validation succeeds.

- [ ] **Step 4: Implement image, reset, import, and export paths**

Accept PNG/JPEG/WebP from a file input, use `createImageBitmap` and canvas to constrain the longest edge to 1600 px, encode WebP at 0.84 quality when supported and JPEG otherwise, reject output above 4 MiB, and revoke every object URL. Import into an isolated object, validate it completely, then save atomically. Export with a new filename `tab-shelf-preferences-v1.json`.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/ui/theme-runtime.mjs extension/settings.html extension/settings.css extension/settings.mjs tests/theme-runtime.test.mjs tests/settings-contract.test.mjs
git commit -m "feat: add personal theme settings"
```

### Task 7: Safari Manifest, Toolbar Popover, Badge, and New Artwork

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.mjs`
- Create: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.mjs`
- Create: `scripts/generate-icons.swift`
- Create: `extension/icons/` generated PNG files
- Create: `tests/safari-extension-contract.test.mjs`

**Interfaces:**
- Consumes: the completed extension pages and Safari gateway.
- Produces: a self-contained temporary-installable Safari Web Extension folder with new icons at 16, 32, 48, 64, 96, 128, 256, and 512 px.

- [ ] **Step 1: Write the failing manifest contract test**

```js
test("declares only the Safari product contract", () => {
  const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Tab Shelf");
  assert.deepEqual(manifest.permissions.sort(), ["storage", "tabs"]);
  assert.equal(manifest.chrome_url_overrides.newtab, "shelf.html");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.background.service_worker, "background.mjs");
  assert.equal(manifest.background.type, "module");
  assert.equal("host_permissions" in manifest, false);
});
```

Also assert that every declared icon exists and starts with the PNG signature, every manifest path stays under `extension/`, and no content scripts or externally connectable origins exist.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/safari-extension-contract.test.mjs`

Expected: FAIL because the manifest does not exist.

- [ ] **Step 3: Implement manifest and background badge**

Use Manifest V3, `tabs` and `storage` only, `chrome_url_overrides.newtab = "shelf.html"`, an action popup, and a module service worker. The background module recomputes the count from visible HTTP(S) tabs on startup and tab create/update/remove events, then calls `browser.action.setBadgeText` and `setBadgeBackgroundColor`.

- [ ] **Step 4: Implement the toolbar popover**

The 280 px popover displays the current web-tab count and two buttons: Open Tab Shelf and Theme Settings. It uses the shared tokens, keyboard focus, and gateway URL creation.

- [ ] **Step 5: Generate independent artwork**

`scripts/generate-icons.swift` uses AppKit/CoreGraphics only. Draw a rounded midnight square, three offset shelf lines, and one mint circular tab marker; do not load an input image. Generate each required PNG deterministically and fail if an output is not the requested dimensions.

Run: `swift scripts/generate-icons.swift extension/icons`

Expected: eight valid PNG files and no other output files.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test`

Expected: all tests PASS.

```bash
git add extension/manifest.json extension/background.mjs extension/popup.html extension/popup.css extension/popup.mjs extension/icons scripts/generate-icons.swift tests/safari-extension-contract.test.mjs
git commit -m "feat: package the Safari extension experience"
```

### Task 8: Temporary Safari Installation and WebKit Product QA

**Files:**
- Create: `scripts/serve-preview.mjs`
- Create: `scripts/render-preview.swift`
- Create: `tests/fixtures/tabs.json`
- Create: `docs/testing/local-safari-acceptance.md`

**Interfaces:**
- Consumes: the complete `extension/` directory and deterministic fixture tabs.
- Produces: WebKit screenshots, a temporary Safari installation procedure, and a recorded functional acceptance checklist.

- [ ] **Step 1: Add a fixture-only preview adapter and failing preview contract**

The preview server must inject fixture data only when the URL contains `?preview=1` and the extension runtime is absent. Production extension code must never read the fixture file. Test both conditions before implementing the adapter.

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run: `node --test tests/shelf-contract.test.mjs tests/safari-extension-contract.test.mjs`

Expected before implementation: FAIL on missing preview boundary.

Expected after implementation: PASS with fixture access limited to preview mode.

- [ ] **Step 3: Render desktop and compact WebKit screenshots**

`scripts/render-preview.swift` loads the local preview in `WKWebView`, waits for `document.fonts.ready` and the `data-render-ready` marker, and captures 1440×900 and 900×900 PNGs. It uses WebKit only and makes no remote request.

Run: `node scripts/serve-preview.mjs --host 127.0.0.1 --port 4173`

Run separately: `swift scripts/render-preview.swift http://127.0.0.1:4173/shelf.html?preview=1 build/screenshots`

Expected: two screenshots with uniform cards, readable text, footer credit, and no layout overflow.

- [ ] **Step 4: Temporarily install and test in Safari**

Use Safari Settings → Developer → Add Temporary Extension and select the new repository’s `extension/` folder. Confirm the product appears as `Tab Shelf`, enable it for the current profile, then test new-tab replacement, real tab grouping, activate, close one, close group, close extra shelves, popover count, theme persistence, reset, export, and rejected invalid import.

- [ ] **Step 5: Commit the QA harness**

```bash
git add scripts/serve-preview.mjs scripts/render-preview.swift tests/fixtures/tabs.json docs/testing/local-safari-acceptance.md
git commit -m "test: verify Tab Shelf in WebKit and Safari"
```

### Task 9: Official macOS App Packaging After Xcode Is Available

**Files:**
- Create: `scripts/package-macos.sh`
- Create: `scripts/install-macos.sh`
- Create: `tests/macos-package-contract.test.mjs`
- Generate but do not commit: `native/generated/`
- Generate but do not commit: `build/Tab Shelf.app`
- Generate but do not commit: `dist/Tab-Shelf-1.0.0.zip`

**Interfaces:**
- Consumes: full Xcode with `safari-web-extension-packager`, the tested `extension/` directory, and new bundle identifier `com.jovaii.tabshelf`.
- Produces: an ad-hoc signed `/Applications/Tab Shelf.app` with extension identifier `com.jovaii.tabshelf.extension`.

- [ ] **Step 1: Write the failing packaging contract test**

Test that `package-macos.sh` refuses Command Line Tools-only setups with one actionable message, uses only `safari-web-extension-packager`, passes `--app-name "Tab Shelf"`, `--bundle-identifier com.jovaii.tabshelf`, `--macos-only`, `--swift`, `--copy-resources`, `--no-open`, and `--no-prompt`, and never includes an extension-replacement migration key.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/macos-package-contract.test.mjs`

Expected: FAIL because packaging scripts do not exist.

- [ ] **Step 3: Implement the official packager flow**

The script validates `/Applications/Xcode.app`, selects it only for the current command through `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, verifies the packager help, creates a new nonexisting temporary generation directory, and runs:

```bash
xcrun safari-web-extension-packager extension \
  --project-location native/generated \
  --app-name "Tab Shelf" \
  --bundle-identifier com.jovaii.tabshelf \
  --macos-only \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt
```

It then validates exactly one generated `.xcodeproj`, builds Release into `build/xcode-derived`, resolves exactly one `Tab Shelf.app`, verifies the outer and nested bundle identifiers with `PlistBuddy`, signs the nested extension and outer App ad hoc, validates both with `codesign --verify --strict`, and creates the ZIP with `ditto -c -k --sequesterRsrc --keepParent`.

- [ ] **Step 4: Implement recoverable installation**

`install-macos.sh` resolves exactly `/Applications/Tab Shelf.app`, refuses symlinks, moves an existing installation to a timestamped sibling backup, copies the newly built App, verifies its signatures and identifiers, and opens only the new App. A failed copy restores the backup.

- [ ] **Step 5: Verify GREEN and package**

Run after full Xcode is installed:

```bash
npm test
bash scripts/package-macos.sh
bash scripts/install-macos.sh
```

Expected: all tests PASS, `build/Tab Shelf.app` and `dist/Tab-Shelf-1.0.0.zip` exist, identifiers are exact, signatures verify, and Safari lists the independent extension.

- [ ] **Step 6: Commit scripts and tests**

```bash
git add scripts/package-macos.sh scripts/install-macos.sh tests/macos-package-contract.test.mjs
git commit -m "build: package Tab Shelf for macOS"
```

### Task 10: Final Independence, Fresh Clone, and GitHub-Ready Release

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`
- Create: `docs/testing/release-acceptance.md`
- Modify: `package.json`
- Test: all tests

**Interfaces:**
- Consumes: an external prohibited-terms file, a read-only comparison root, the final tracked tree, and the generated App/ZIP.
- Produces: a clean English repository ready to publish as a new GitHub project with one independent history.

- [ ] **Step 1: Complete English product documentation**

Document features, privacy, Safari temporary installation, official Xcode packaging, local App enablement, theme controls, limitations, build commands, Apache-2.0 ownership, and uninstall steps. Do not mention or link to a predecessor.

- [ ] **Step 2: Run the normal independence checks**

Set `TAB_SHELF_PROHIBITED_TERMS_FILE` to the validated external terms file, `TAB_SHELF_COMPARISON_ROOT` to the read-only comparison source, and the optional product root to `build/Tab Shelf.app`. Run:

```bash
npm test
npm run audit
git diff --check
```

Expected: all tests PASS, prohibited matches `0`, dependencies `0`, unexpected whole-file equality `0`, and diff errors `0`.

- [ ] **Step 3: Verify a fresh clone**

Create a new temporary directory with `mktemp -d`, clone the local repository into a fixed child named `Tab-Shelf`, run `npm test` and `npm run audit`, and remove only the validated temporary directory after recording the successful result. If full Xcode is installed, also package the fresh clone and compare its resource manifest with the primary build.

- [ ] **Step 4: Commit the release state**

```bash
git add README.md CHANGELOG.md docs/testing/release-acceptance.md package.json
git commit -m "docs: prepare Tab Shelf 1.0.0 release"
git status --short
```

Expected: clean worktree.

- [ ] **Step 5: Remote publication gate**

Before any GitHub write, verify the intended account and that the new remote target is either absent or contains no unrelated history. Create a new public repository rather than attaching to a predecessor remote. Push `main`, verify the English README and Apache-2.0 license, clone it credential-free, repeat `npm test` and `npm run audit`, and scan public repository fields. This is the only GitHub mutation phase.

## Execution Schedule

| Task | Estimated engineering time |
|---|---:|
| 1. Repository contract | 45–75 minutes |
| 2. Tab model | 60–90 minutes |
| 3. Preferences | 60–90 minutes |
| 4. Safari gateway | 45–75 minutes |
| 5. Shelf interface | 2–3 hours |
| 6. Settings and themes | 2–3 hours |
| 7. Manifest, toolbar, artwork | 60–90 minutes |
| 8. WebKit and temporary Safari QA | 60–120 minutes |
| 9. macOS App packaging | 1–2 hours after Xcode installation |
| 10. Release audit and fresh clone | 45–90 minutes |

Estimated total active engineering time: 11–18 hours. The largest costs are the independently authored shelf/settings UI, Safari interaction testing, and official macOS packaging. Efficiency comes from completing Tasks 1–7 without waiting for Xcode, using dependency-free Node tests, testing the extension temporarily in Safari, and postponing GitHub publication until one final release gate.
