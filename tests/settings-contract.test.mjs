import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

test("settings page exposes the complete Version 1 controls", () => {
  const html = source("extension/settings.html");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1>Theme studio<\/h1>/);
  assert.match(html, /id="preset-grid"/);
  for (const id of [
    "background-kind",
    "background-color",
    "gradient-angle",
    "gradient-stops",
    "add-gradient-stop",
    "background-image",
    "image-fit",
    "blur-px",
    "image-opacity",
    "overlay-color",
    "overlay-opacity",
    "card-opacity",
    "text-mode",
    "contrast-boost",
    "accent-color",
    "reset-theme",
    "export-theme",
    "import-theme",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<script type="module" src="settings\.mjs"><\/script>/);
  assert.doesNotMatch(html, /https?:\/\//iu);
  assert.doesNotMatch(html, /on(?:click|load|error)=/iu);
});

test("settings code is local-only and never injects imported markup", () => {
  const javascript = `${source("extension/settings.mjs")}\n${source("extension/ui/theme-runtime.mjs")}`;

  assert.doesNotMatch(javascript, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/iu);
  assert.doesNotMatch(javascript, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/iu);
  assert.match(javascript, /tab-shelf-preferences-v1\.json/);
  assert.match(javascript, /MAX_BACKGROUND_IMAGE_BYTES/);
});

test("settings styles preserve readable controls and a responsive preview", () => {
  const css = source("extension/settings.css");

  assert.match(css, /\.settings-layout\s*\{[^}]*display:\s*grid/isu);
  assert.match(css, /\.preset-grid\s*\{[^}]*display:\s*grid/isu);
  assert.match(css, /\.settings-preview/);
  assert.match(css, /input[^{}]*\{[^}]*font-size:\s*1rem/isu);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /prefers-reduced-motion/u);
});

test("shelf loads and applies saved preferences", () => {
  const javascript = source("extension/shelf.mjs");

  assert.match(javascript, /gateway\.getPreferences\(\)/);
  assert.match(javascript, /applyTheme\(document\.documentElement, preferences\)/);
});
