# Card Colour and Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every domain card a favicon-informed, privacy-preserving identity colour and refine the system typography used by the shelf.

**Architecture:** Add one focused UI colour module that owns deterministic domain fallbacks, pixel sampling, colour normalization, and local CSS-variable application. The existing shelf renderer applies fallback variables synchronously and opportunistically replaces them after the first favicon loads; CSS consumes only local semantic roles while global themes continue to own page and control colours.

**Tech Stack:** Safari Web Extension, dependency-free JavaScript ES modules, CSS custom properties, Canvas 2D, Node 24 built-in tests, native WebKit screenshots, Xcode 26.6.

## Global Constraints

- Safari on the current Mac only; no Chrome runtime or build path.
- Do not add website permissions, remote services, font files, stock assets, or runtime dependencies.
- Do not change `tabShelf.preferences.v1` or persist sampled colours.
- Use system-installed fonts and the existing semantic-token system.
- Keep card surfaces neutral and colour supplementary to text and structure.
- Keep all public documentation in English.

---

### Task 1: Domain Accent Model

**Files:**
- Create: `extension/ui/site-accent.mjs`
- Create: `tests/site-accent.test.mjs`

**Interfaces:**
- Produces: `fallbackAccentForDomain(domain: string): string`
- Produces: `representativeAccent(pixelData: Uint8ClampedArray, fallback: string): string`
- Produces: `extractAccentFromImage(image: HTMLImageElement, fallback: string): string`
- Produces: `applySiteAccent(node: HTMLElement, colour: string): Readonly<Record<string, string>>`

- [x] **Step 1: Write failing fallback and pixel tests**

```js
assert.equal(fallbackAccentForDomain("example.com"), fallbackAccentForDomain("example.com"));
assert.notEqual(fallbackAccentForDomain("example.com"), fallbackAccentForDomain("another.test"));
assert.equal(representativeAccent(transparentPixels, "#315f67"), "#315f67");
assert.match(representativeAccent(vividPixels, "#315f67"), /^#[a-f0-9]{6}$/u);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/site-accent.test.mjs`

Expected: FAIL because `extension/ui/site-accent.mjs` does not exist.

- [x] **Step 3: Implement deterministic fallback, pixel filtering, hue bucketing, HSL normalization, canvas error fallback, and CSS-variable application**

```js
export function applySiteAccent(node, colour) {
  const variables = siteAccentVariables(colour);
  for (const [name, value] of Object.entries(variables)) node.style.setProperty(name, value);
  return variables;
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/site-accent.test.mjs`

Expected: all accent tests pass.

### Task 2: Shelf Integration

**Files:**
- Modify: `extension/ui/shelf-view.mjs`
- Modify: `tests/shelf-view.test.mjs`

**Interfaces:**
- Consumes: the focused accent helpers from `extension/ui/site-accent.mjs`.
- Produces: every rendered `.site-card` receives fallback CSS variables immediately and may replace them after its first favicon load.

- [x] **Step 1: Add failing tree and rendering tests**

```js
assert.match(card.accent, /^#[a-f0-9]{6}$/u);
assert.equal(cardNode.style.getPropertyValue("--site-accent"), card.accent);
assert.equal(faviconLoadHandlerCount, 1);
```

- [x] **Step 2: Run the shelf-view test and verify RED**

Run: `node --test tests/shelf-view.test.mjs`

Expected: FAIL because cards do not carry or apply local accents.

- [x] **Step 3: Apply fallback accents synchronously and attach extraction only to the first favicon in each card**

```js
const accent = fallbackAccentForDomain(group.key);
return Object.freeze({ role: "site-card", key: group.key, accent, children });
```

- [x] **Step 4: Run shelf-view and accent tests and verify GREEN**

Run: `node --test tests/site-accent.test.mjs tests/shelf-view.test.mjs`

Expected: all focused tests pass.

### Task 3: Card Colour and Typography CSS

**Files:**
- Modify: `extension/shared/tokens.css`
- Modify: `extension/shelf.css`
- Modify: `tests/shelf-contract.test.mjs`

**Interfaces:**
- Consumes: `--site-accent`, `--site-accent-soft`, `--site-accent-border`, and `--site-accent-text` on each card.
- Produces: a full-width four-pixel identity band, local marker and hover treatments, and the approved system typography hierarchy.

- [x] **Step 1: Add failing CSS contracts for local accent roles and typography**

```js
assert.match(css, /--font-body:\s*"Avenir Next"/u);
assert.match(css, /--font-body:[^;]*"PingFang SC"/u);
assert.match(css, /\.site-card::before[^}]*inset-inline:\s*0/isu);
assert.match(css, /\.tab-row__title[^}]*font-size:\s*var\(--text-body\)/isu);
```

- [x] **Step 2: Run shelf contracts and verify RED**

Run: `node --test tests/shelf-contract.test.mjs`

Expected: FAIL on the absent font and card-accent contracts.

- [x] **Step 3: Update the existing tokens and card rules without adding fonts or dependencies**

```css
--font-body: "Avenir Next", "SF Pro Text", "PingFang SC", -apple-system, sans-serif;
--site-accent: var(--color-accent-solid);
.site-card::before { inset-inline: 0; block-size: 4px; background: var(--site-accent); }
```

- [x] **Step 4: Run the CSS contracts and verify GREEN**

Run: `node --test tests/shelf-contract.test.mjs`

Expected: all CSS and contrast tests pass.

### Task 4: Documentation and Visual Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/local-safari-acceptance.md`
- Modify: `docs/testing/release-acceptance.md`

**Interfaces:**
- Documents the favicon-informed fallback, system typography, current test count, Xcode packaging status, and manual Safari acceptance boundary.

- [x] **Step 1: Update English documentation and test-count evidence**

```md
- Favicon-informed domain accents with a deterministic privacy-preserving fallback.
- System-only editorial typography using Avenir Next, SF Pro, and PingFang SC fallbacks.
```

- [x] **Step 2: Run all automated checks**

Run: `npm run check`

Expected: all tests and the repository audit pass.

- [x] **Step 3: Render and inspect both WebKit acceptance viewports**

Run: `npm run preview`, then `npm run render:preview`

Expected: adjacent cards have distinguishable accents, typography is readable, dimensions remain exact, and no overflow is present.

### Task 5: Package, Install, and Publish

**Files:**
- Generated: `build/Tab Shelf.app`
- Generated: `dist/Tab-Shelf-1.0.0.zip`

**Interfaces:**
- Produces the verified local App and the public GitHub source update.

- [x] **Step 1: Rebuild with Xcode Sign to Run Locally**

Run: `npm run package:macos`

Expected: `BUILD SUCCEEDED`, strict nested and outer signature verification passes.

- [x] **Step 2: Install and register exactly one extension instance**

Run: `npm run install:macos`

Expected: `/Applications/Tab Shelf.app` is installed and `pluginkit` lists one `com.jovaii.tabshelf.extension` path under `/Applications`.

- [x] **Step 3: Commit and push the verified English source release**

```bash
git add extension tests README.md docs
git commit -m "feat: restore card identity and typography"
git push origin main
```

Expected: the public `main` SHA matches the verified source commit content and the public audit reports zero prohibited identity matches.
