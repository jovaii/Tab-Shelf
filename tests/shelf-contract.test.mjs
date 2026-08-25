import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

test("new-tab document has one semantic shelf structure", () => {
  const html = source("extension/shelf.html");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="theme-color" content="#[a-f0-9]{6}">/iu);
  assert.match(html, /<a class="skip-link" href="#inventory-title">Skip to open tabs<\/a>/u);
  assert.match(html, /<main class="shelf-app"/);
  assert.match(html, /<h1 id="greeting"/);
  assert.match(html, /<h2 id="inventory-title"/);
  assert.match(html, /id="workspace-root" class="workspace-root"/);
  assert.match(html, /id="new-category"/);
  assert.match(html, /id="status" role="status"/);
  assert.match(html, /Tab Shelf by James Li/);
  assert.match(html, /<script type="module" src="shelf\.mjs"><\/script>/);
  assert.doesNotMatch(html, /on(?:click|load|error)=/iu);
  assert.doesNotMatch(html, /https?:\/\//iu);
});

test("styles use one responsive grid without masonry or merged cards", () => {
  const css = `${source("extension/shared/tokens.css")}\n${source("extension/shelf.css")}`;

  assert.match(css, /\.card-grid\s*\{[^}]*display:\s*grid/isu);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,/u);
  assert.match(css, /\.site-card\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/isu);
  assert.doesNotMatch(css, /column-count|masonry/iu);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /-webkit-line-clamp:\s*2/u);
});

test("colors and typography are role-based", () => {
  const css = source("extension/shared/tokens.css");

  for (const token of [
    "--color-bg-page",
    "--color-bg-surface",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-border",
    "--color-separator",
    "--color-accent-solid",
    "--color-focus-ring",
    "--color-destructive-text",
    "--font-display",
    "--font-body",
    "--text-display",
    "--text-body",
    "--text-metadata",
  ]) {
    assert.match(css, new RegExp(`${token.replaceAll("-", "\\-")}:`));
  }
  assert.doesNotMatch(css, /@font-face|\.woff2?|\.ttf|\.otf/iu);
});

test("cards use local site colors and the approved editorial type pairing", () => {
  const tokens = source("extension/shared/tokens.css");
  const css = source("extension/shelf.css");

  assert.match(tokens, /--font-body:\s*"Avenir Next",\s*"SF Pro Text",\s*"PingFang SC"/u);
  assert.match(tokens, /--text-heading:\s*1rem/u);
  assert.match(css, /html\s*\{[^}]*font-kerning:\s*normal[^}]*font-optical-sizing:\s*auto/isu);
  assert.match(css, /\.site-card\s*\{[^}]*--site-accent:\s*var\(--color-accent-solid\)/isu);
  assert.match(css, /\.site-card::before\s*\{[^}]*inset-inline:\s*0[^}]*block-size:\s*4px[^}]*background:\s*var\(--site-accent\)/isu);
  assert.match(css, /\.site-card:hover\s*\{[^}]*border-color:\s*var\(--site-accent-border\)/isu);
  assert.match(css, /\.site-card__marker\s*\{[^}]*color:\s*var\(--site-accent-text\)[^}]*background:\s*var\(--site-accent-soft\)/isu);
  assert.match(css, /\.site-card__title\s*\{[^}]*font-size:\s*var\(--text-heading\)[^}]*font-weight:\s*600/isu);
  assert.match(css, /\.tab-row__title\s*\{[^}]*font-size:\s*var\(--text-body\)[^}]*font-weight:\s*500[^}]*line-height:\s*1\.5/isu);
});

test("application modules never inject HTML strings", () => {
  const javascript = [
    "extension/ui/dom.mjs",
    "extension/ui/shelf-view.mjs",
    "extension/shelf.mjs",
  ].map(source).join("\n");

  assert.doesNotMatch(javascript, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/iu);
});

test("shelf loads, renders, mutates, and recovers the separate workspace", () => {
  const javascript = source("extension/shelf.mjs");

  assert.match(javascript, /gateway\.getWorkspace\(\)/u);
  assert.match(javascript, /buildWorkspaceView\(/u);
  assert.match(javascript, /applyWorkspaceAction\(/u);
  assert.match(javascript, /gateway\.setWorkspace\(/u);
  assert.match(javascript, /Workspace layout could not be saved\./u);
  assert.match(javascript, /Saved workspace layout could not be loaded\./u);
  assert.match(javascript, /dragActive/u);
  assert.match(javascript, /pendingRefresh/u);
  assert.match(javascript, /onWorkspaceChanged/u);
  assert.match(javascript, /createSortableController\(/u);
});

test("shelf owns one bounded category editor without inline handlers", () => {
  const html = source("extension/shelf.html");
  const javascript = source("extension/shelf.mjs");

  assert.match(html, /<dialog id="category-dialog"/u);
  assert.match(html, /<form[^>]*method="dialog"[^>]*id="category-form"/u);
  assert.match(html, /id="category-name"[^>]*maxlength="40"/u);
  assert.match(html, /id="category-cancel"/u);
  assert.match(javascript, /onCreateCategory/u);
  assert.match(javascript, /onEditCategory/u);
  assert.match(javascript, /create-category/u);
  assert.match(javascript, /rename-category/u);
  assert.doesNotMatch(html, /on(?:click|load|error)=/iu);
});
