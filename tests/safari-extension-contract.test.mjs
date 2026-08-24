import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const EXTENSION_ROOT = resolve("extension");
const ICON_SIZES = Object.freeze([16, 32, 48, 64, 96, 128, 256, 512]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function manifest() {
  return JSON.parse(readFileSync("extension/manifest.json", "utf8"));
}

function assertOwnedPath(path) {
  assert.equal(typeof path, "string");
  const absolute = resolve(EXTENSION_ROOT, path);
  assert.equal(absolute.startsWith(`${EXTENSION_ROOT}${sep}`), true);
  assert.equal(existsSync(absolute), true, `Missing extension file: ${path}`);
}

test("declares only the Safari product contract", () => {
  const value = manifest();

  assert.equal(value.manifest_version, 3);
  assert.equal(value.name, "Tab Shelf");
  assert.equal(value.short_name, "Tab Shelf");
  assert.deepEqual([...value.permissions].sort(), ["storage", "tabs"]);
  assert.equal(value.chrome_url_overrides.newtab, "shelf.html");
  assert.equal(value.action.default_popup, "popup.html");
  assert.deepEqual(value.background.scripts, ["background.js"]);
  assert.equal("type" in value.background, false);
  assert.equal("host_permissions" in value, false);
  assert.equal("content_scripts" in value, false);
  assert.equal("externally_connectable" in value, false);
  assert.equal("web_accessible_resources" in value, false);
});

test("keeps every declared extension path inside the package", () => {
  const value = manifest();
  for (const path of [
    value.chrome_url_overrides.newtab,
    value.action.default_popup,
    ...value.background.scripts,
    ...Object.values(value.icons),
    ...Object.values(value.action.default_icon),
  ]) {
    assertOwnedPath(path);
  }
});

test("contains deterministic PNG artwork at every declared size", () => {
  const value = manifest();
  assert.deepEqual(Object.keys(value.icons).map(Number), ICON_SIZES);

  for (const size of ICON_SIZES) {
    const path = resolve(EXTENSION_ROOT, value.icons[String(size)]);
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 8).equals(PNG_SIGNATURE), true);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test("background badge counts only ordinary web tabs", async () => {
  const context = { URL };
  const source = `${readFileSync("extension/background.js", "utf8")}\n`
    + ";globalThis.__tabShelfTest = { countVisibleWebTabs, refreshBadge };";
  runInNewContext(source, context);
  const { countVisibleWebTabs, refreshBadge } = context.__tabShelfTest;
  assert.equal(countVisibleWebTabs([
    { url: "https://example.com" },
    { url: "http://localhost:3080" },
    { url: "about:blank" },
    { url: "safari-web-extension://owned/shelf.html" },
  ]), 2);

  const calls = [];
  await refreshBadge({
    tabs: { query: async () => [{ url: "https://example.com" }] },
    action: {
      setBadgeText: async (value) => calls.push(["text", value]),
      setBadgeBackgroundColor: async (value) => calls.push(["color", value]),
    },
  });
  assert.deepEqual(structuredClone(calls), [
    ["text", { text: "1" }],
    ["color", { color: "#2f6f68" }],
  ]);
});

test("popover is local, English, and exposes its two destinations", () => {
  const html = readFileSync("extension/popup.html", "utf8");
  const javascript = readFileSync("extension/popup.mjs", "utf8");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="theme-color" content="#[a-f0-9]{6}">/iu);
  assert.match(html, /id="web-tab-count"/);
  assert.match(html, /id="open-shelf"/);
  assert.match(html, /id="open-settings"/);
  assert.match(html, /<script type="module" src="popup\.mjs"><\/script>/);
  assert.doesNotMatch(`${html}\n${javascript}`, /https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket/iu);
  assert.doesNotMatch(javascript, /globalThis\.chrome|\bchrome\./u);
});
