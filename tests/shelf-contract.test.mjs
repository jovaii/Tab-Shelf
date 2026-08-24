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
  assert.match(html, /id="card-grid" class="card-grid"/);
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

test("application modules never inject HTML strings", () => {
  const javascript = [
    "extension/ui/dom.mjs",
    "extension/ui/shelf-view.mjs",
    "extension/shelf.mjs",
  ].map(source).join("\n");

  assert.doesNotMatch(javascript, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/iu);
});
