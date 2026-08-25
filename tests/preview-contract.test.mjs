import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const FIXTURE_TABS = Object.freeze([
  { id: 1, windowId: 1, title: "Example", url: "https://example.com/" },
]);

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function runPreviewRuntime({ href, browser }) {
  const context = {
    URL,
    structuredClone,
    location: {
      href,
      origin: "http://127.0.0.1:4173",
      assign: () => undefined,
    },
    localStorage: storage(),
    document: { documentElement: { dataset: {} } },
    __TAB_SHELF_FIXTURE__: { tabs: structuredClone(FIXTURE_TABS) },
  };
  if (browser !== undefined) context.browser = browser;
  vm.runInNewContext(readFileSync("scripts/preview-runtime.js", "utf8"), context);
  return context;
}

test("injects preview scripts only for the explicit preview query", async () => {
  const { injectPreviewBootstrap } = await import("../scripts/serve-preview.mjs");
  const html = '<main></main><script type="module" src="shelf.mjs"></script>';

  assert.equal(
    injectPreviewBootstrap(html, new URL("http://127.0.0.1:4173/shelf.html")),
    html,
  );
  assert.equal(
    injectPreviewBootstrap(html, new URL("http://127.0.0.1:4173/shelf.html?preview=0")),
    html,
  );
  const injected = injectPreviewBootstrap(
    html,
    new URL("http://127.0.0.1:4173/shelf.html?preview=1"),
  );
  assert.match(injected, /__preview__\/fixture\.js\?preview=1/);
  assert.match(injected, /__preview__\/runtime\.js\?preview=1/);
  assert.ok(injected.indexOf("__preview__") < injected.indexOf("shelf.mjs"));
});

test("never replaces a real Safari extension runtime", () => {
  const safariBrowser = { owned: true };
  const result = runPreviewRuntime({
    href: "http://127.0.0.1:4173/shelf.html?preview=1",
    browser: safariBrowser,
  });

  assert.equal(result.browser, safariBrowser);
});

test("keeps the preview runtime disabled without the exact query", () => {
  const result = runPreviewRuntime({
    href: "http://127.0.0.1:4173/shelf.html",
  });

  assert.equal(result.browser, undefined);
});

test("installs deterministic local Safari APIs only in preview mode", async () => {
  const result = runPreviewRuntime({
    href: "http://127.0.0.1:4173/shelf.html?preview=1",
  });

  assert.equal(typeof result.browser.tabs.query, "function");
  assert.equal(result.browser.runtime.getURL(""), "http://127.0.0.1:4173/");
  assert.equal(
    result.browser.runtime.getURL("settings.html"),
    "http://127.0.0.1:4173/settings.html?preview=1",
  );
  assert.deepEqual(
    structuredClone(await result.browser.tabs.query({})),
    FIXTURE_TABS,
  );
  assert.equal(result.document.documentElement.dataset.renderReady, "pending");
});

test("keeps preview storage keys separate and emits local change records", async () => {
  const result = runPreviewRuntime({
    href: "http://127.0.0.1:4173/shelf.html?preview=1",
  });
  const changes = [];
  const listener = (change, area) => changes.push([structuredClone(change), area]);
  result.browser.storage.onChanged.addListener(listener);

  await result.browser.storage.local.set({
    "tabShelf.preferences.v1": { schema: "tabShelf.preferences.v1", preset: "mist-teal" },
  });
  await result.browser.storage.local.set({
    "tabShelf.workspace.v1": { schema: "tabShelf.workspace.v1", revision: 1 },
  });

  assert.deepEqual(
    structuredClone(await result.browser.storage.local.get("tabShelf.preferences.v1")),
    { "tabShelf.preferences.v1": { schema: "tabShelf.preferences.v1", preset: "mist-teal" } },
  );
  assert.deepEqual(
    structuredClone(await result.browser.storage.local.get("tabShelf.workspace.v1")),
    { "tabShelf.workspace.v1": { schema: "tabShelf.workspace.v1", revision: 1 } },
  );
  assert.deepEqual(
    structuredClone(await result.browser.storage.local.get({ missing: undefined })),
    { missing: undefined },
  );
  assert.deepEqual(changes, [
    [{
      "tabShelf.preferences.v1": {
        oldValue: undefined,
        newValue: { schema: "tabShelf.preferences.v1", preset: "mist-teal" },
      },
    }, "local"],
    [{
      "tabShelf.workspace.v1": {
        oldValue: undefined,
        newValue: { schema: "tabShelf.workspace.v1", revision: 1 },
      },
    }, "local"],
  ]);

  result.browser.storage.onChanged.removeListener(listener);
  await result.browser.storage.local.set({ "tabShelf.workspace.v1": { revision: 2 } });
  assert.equal(changes.length, 2);
});

test("production extension modules never read preview fixtures", () => {
  const production = [
    "extension/background.js",
    "extension/popup.mjs",
    "extension/settings.mjs",
    "extension/shelf.mjs",
    "extension/platform/safari-gateway.mjs",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(production, /tests\/fixtures|preview-runtime|__TAB_SHELF_FIXTURE__/u);
});

test("WebKit renderer is local-only and captures the two acceptance viewports", () => {
  const source = readFileSync("scripts/render-preview.swift", "utf8");

  assert.match(source, /import WebKit/u);
  assert.match(source, /document\.fonts\.ready/u);
  assert.match(source, /document\.fonts\.ready\.then\([^"]+\); '\w+'/u);
  assert.match(source, /data-render-ready/u);
  assert.match(source, /scrollWidth/u);
  assert.match(source, /querySelectorAll\('\.site-card'\)/u);
  assert.match(source, /close-tab/u);
  assert.match(source, /settings\.html/u);
  assert.match(source, /preset-button/u);
  assert.match(source, /querySelectorAll\('\.preset-button'\)\[4\]/u);
  assert.match(source, /Storm Horizon/u);
  assert.ok(source.indexOf("stage=theme-switch") < source.indexOf("takeSnapshot"));
  assert.match(source, /1440[\s\S]*900/u);
  assert.match(source, /900[\s\S]*900/u);
  assert.match(source, /127\.0\.0\.1|localhost/u);
  assert.doesNotMatch(source, /URLSession|NSURLConnection/u);
});
