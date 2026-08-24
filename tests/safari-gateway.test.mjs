import assert from "node:assert/strict";
import test from "node:test";
import { preferencesFromPreset } from "../extension/core/preferences.mjs";
import {
  TabShelfPlatformError,
  createSafariGateway,
} from "../extension/platform/safari-gateway.mjs";

function fakeBrowser(overrides = {}) {
  return {
    tabs: {
      query: async () => [],
      getCurrent: async () => ({ id: 1 }),
      get: async (id) => ({ id, windowId: 10 }),
      update: async () => undefined,
      remove: async () => undefined,
      create: async ({ url }) => ({ id: 20, url }),
      ...overrides.tabs,
    },
    windows: {
      update: async () => undefined,
      ...overrides.windows,
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined,
        ...overrides.storageLocal,
      },
    },
    runtime: {
      getURL: (path) => `safari-web-extension://independent/${path}`,
      ...overrides.runtime,
    },
    action: {
      setBadgeText: async () => undefined,
      setBadgeBackgroundColor: async () => undefined,
      ...overrides.action,
    },
  };
}

test("requires the Safari browser namespace", () => {
  assert.throws(() => createSafariGateway(undefined), /Safari browser API/);
  assert.throws(() => createSafariGateway({ tabs: {} }), /Safari browser API/);
});

test("lists tabs and returns the current extension tab", async () => {
  const gateway = createSafariGateway(fakeBrowser({
    tabs: {
      query: async (query) => [{ id: 4, query }],
      getCurrent: async () => ({ id: 9, url: "safari-web-extension://independent/shelf.html" }),
    },
  }));

  assert.deepEqual(await gateway.listTabs(), [{ id: 4, query: {} }]);
  assert.equal((await gateway.getCurrentTab()).id, 9);
  assert.equal(gateway.extensionOrigin(), "safari-web-extension://independent/");
});

test("activates a tab and focuses its owning window", async () => {
  const calls = [];
  const gateway = createSafariGateway(fakeBrowser({
    tabs: {
      update: async (id, patch) => calls.push(["tab", id, patch]),
      get: async () => ({ windowId: 42 }),
    },
    windows: {
      update: async (id, patch) => calls.push(["window", id, patch]),
    },
  }));

  await gateway.activateTab(8);

  assert.deepEqual(calls, [
    ["tab", 8, { active: true }],
    ["window", 42, { focused: true }],
  ]);
});

test("closes a unique non-empty set of valid tab identifiers", async () => {
  const calls = [];
  const gateway = createSafariGateway(fakeBrowser({
    tabs: { remove: async (ids) => calls.push(ids) },
  }));

  await gateway.closeTabs([8, 4, 8]);

  assert.deepEqual(calls, [[8, 4]]);
  await assert.rejects(() => gateway.closeTabs([]), /No tab identifiers/);
  await assert.rejects(() => gateway.closeTabs([null]), /Invalid tab identifier/);
});

test("loads the default preferences only when storage is empty", async () => {
  const emptyGateway = createSafariGateway(fakeBrowser());
  assert.equal((await emptyGateway.getPreferences()).preset, "quiet-neutral");

  const invalidGateway = createSafariGateway(fakeBrowser({
    storageLocal: { get: async () => ({ "tabShelf.preferences.v1": { schema: "wrong" } }) },
  }));
  await assert.rejects(() => invalidGateway.getPreferences(), /Stored preferences are invalid/);
});

test("validates and stores a detached preference document", async () => {
  const writes = [];
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: { set: async (value) => writes.push(value) },
  }));
  const preferences = preferencesFromPreset("mist-teal");

  await gateway.setPreferences(preferences);
  preferences.preset = "custom";

  assert.equal(writes[0]["tabShelf.preferences.v1"].preset, "mist-teal");
});

test("opens only owned extension pages", async () => {
  const opened = [];
  const gateway = createSafariGateway(fakeBrowser({
    tabs: { create: async (request) => opened.push(request) },
  }));

  await gateway.openShelf();
  await gateway.openSettings();

  assert.deepEqual(opened, [
    { url: "safari-web-extension://independent/shelf.html" },
    { url: "safari-web-extension://independent/settings.html" },
  ]);
});

test("sets a bounded badge count and hides zero", async () => {
  const calls = [];
  const gateway = createSafariGateway(fakeBrowser({
    action: {
      setBadgeText: async (value) => calls.push(["text", value]),
      setBadgeBackgroundColor: async (value) => calls.push(["color", value]),
    },
  }));

  await gateway.setBadge(12);
  await gateway.setBadge(0);

  assert.deepEqual(calls, [
    ["text", { text: "12" }],
    ["color", { color: "#2f6f68" }],
    ["text", { text: "" }],
    ["color", { color: "#2f6f68" }],
  ]);
  await assert.rejects(() => gateway.setBadge(-1), /badge count/);
});

test("normalizes platform failures without exposing a page URL", async () => {
  const sensitiveUrl = "https://private.example.test/account?token=secret";
  const gateway = createSafariGateway(fakeBrowser({
    tabs: { query: async () => { throw new Error(`Cannot read ${sensitiveUrl}`); } },
  }));

  await assert.rejects(
    () => gateway.listTabs(),
    (error) => {
      assert.equal(error instanceof TabShelfPlatformError, true);
      assert.equal(error.code, "TAB_QUERY_FAILED");
      assert.equal(error.message.includes(sensitiveUrl), false);
      assert.equal("cause" in error, false);
      return true;
    },
  );
});
