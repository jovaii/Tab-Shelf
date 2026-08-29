import assert from "node:assert/strict";
import test from "node:test";
import { preferencesFromPreset } from "../extension/core/preferences.mjs";
import { createDefaultWorkspace } from "../extension/core/workspace.mjs";
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
      ...(overrides.storageOnChanged
        ? { onChanged: overrides.storageOnChanged }
        : {}),
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

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
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
  assert.equal((await emptyGateway.getPreferences()).preset, "storm-horizon");

  const invalidGateway = createSafariGateway(fakeBrowser({
    storageLocal: { get: async () => ({ "tabShelf.preferences.v1": { schema: "wrong" } }) },
  }));
  await assert.rejects(() => invalidGateway.getPreferences(), /Stored preferences are invalid/);
});

test("reads a valid fallback preference when Safari storage is empty or unavailable", async () => {
  const fallback = memoryStorage({
    "tabShelf.preferences.v1": JSON.stringify(preferencesFromPreset("neon-bloom")),
  });
  const emptyGateway = createSafariGateway(fakeBrowser(), fallback);
  assert.equal((await emptyGateway.getPreferences()).preset, "neon-bloom");

  const unavailableGateway = createSafariGateway(fakeBrowser({
    storageLocal: { get: async () => { throw new Error("unavailable"); } },
  }), fallback);
  assert.equal((await unavailableGateway.getPreferences()).preset, "neon-bloom");
});

test("uses a valid fallback when Safari contains an invalid preference document", async () => {
  const fallback = memoryStorage({
    "tabShelf.preferences.v1": JSON.stringify(preferencesFromPreset("ice-lavender")),
  });
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: { get: async () => ({ "tabShelf.preferences.v1": { schema: "wrong" } }) },
  }), fallback);

  assert.equal((await gateway.getPreferences()).preset, "ice-lavender");
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

test("saves to the fallback when Safari rejects the preference write", async () => {
  const fallback = memoryStorage();
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: { set: async () => { throw new Error("unavailable"); } },
  }), fallback);

  await gateway.setPreferences(preferencesFromPreset("storm-horizon"));

  assert.equal(
    JSON.parse(fallback.getItem("tabShelf.preferences.v1")).preset,
    "storm-horizon",
  );

  const nextPage = createSafariGateway(fakeBrowser({
    storageLocal: {
      get: async () => ({
        "tabShelf.preferences.v1": preferencesFromPreset("quiet-neutral"),
      }),
    },
  }), fallback);
  assert.equal((await nextPage.getPreferences()).preset, "storm-horizon");
});

test("reports a normalized write error only when both preference stores fail", async () => {
  const fallback = {
    getItem: () => null,
    setItem: () => { throw new Error("quota"); },
  };
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: { set: async () => { throw new Error("unavailable"); } },
  }), fallback);

  await assert.rejects(
    () => gateway.setPreferences(preferencesFromPreset("storm-horizon")),
    (error) => {
      assert.equal(error.code, "PREFERENCE_WRITE_FAILED");
      assert.equal(error.message.includes("quota"), false);
      return true;
    },
  );
});

test("loads, validates, stores, resets, and observes the separate workspace", async () => {
  const writes = [];
  const removed = [];
  let changeListener;
  const storageOnChanged = {
    addListener(listener) {
      changeListener = listener;
    },
    removeListener(listener) {
      removed.push(listener);
    },
  };
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: {
      get: async () => ({}),
      set: async (value) => writes.push(value),
    },
    storageOnChanged,
  }));

  const workspace = await gateway.getWorkspace();
  assert.equal(workspace.schema, "tabShelf.workspace.v1");
  await gateway.setWorkspace(workspace);
  assert.equal(writes[0]["tabShelf.workspace.v1"].schema, "tabShelf.workspace.v1");
  assert.notEqual(writes[0]["tabShelf.workspace.v1"], workspace);

  const changes = [];
  const unsubscribe = gateway.onWorkspaceChanged((value) => changes.push(value));
  changeListener({
    "tabShelf.workspace.v1": { newValue: writes[0]["tabShelf.workspace.v1"] },
  }, "sync");
  assert.equal(changes.length, 0);
  changeListener({
    "tabShelf.workspace.v1": { newValue: writes[0]["tabShelf.workspace.v1"] },
  }, "local");
  assert.equal(changes.length, 1);
  assert.equal(Object.isFrozen(changes[0]), true);
  unsubscribe();
  assert.deepEqual(removed, [changeListener]);

  await gateway.resetWorkspace();
  assert.deepEqual(writes.at(-1)["tabShelf.workspace.v1"], createDefaultWorkspace());
});

test("normalizes invalid workspace reads and writes without exposing stored data", async () => {
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: {
      get: async () => ({
        "tabShelf.workspace.v1": { schema: "wrong", privateValue: "never expose" },
      }),
    },
  }));

  await assert.rejects(
    () => gateway.getWorkspace(),
    (error) => {
      assert.equal(error.code, "WORKSPACE_INVALID");
      assert.equal(error.message.includes("never expose"), false);
      return true;
    },
  );
  await assert.rejects(
    () => gateway.setWorkspace({ schema: "wrong", privateValue: "never expose" }),
    (error) => {
      assert.equal(error.code, "WORKSPACE_INVALID");
      assert.equal(error.message.includes("never expose"), false);
      return true;
    },
  );
});

test("keeps workspace subscriptions optional and validates listeners", () => {
  const gateway = createSafariGateway(fakeBrowser());
  assert.throws(() => gateway.onWorkspaceChanged(null), /listener/i);
  const unsubscribe = gateway.onWorkspaceChanged(() => undefined);
  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(unsubscribe);
});

test("opens extension pages in a new tab for a non-owned caller", async () => {
  const opened = [];
  const gateway = createSafariGateway(fakeBrowser({
    tabs: {
      getCurrent: async () => ({ id: 1, url: "https://example.test/" }),
      create: async (request) => opened.push(request),
    },
  }));

  await gateway.openShelf();
  await gateway.openSettings();

  assert.deepEqual(opened, [
    { url: "safari-web-extension://independent/shelf.html" },
    { url: "safari-web-extension://independent/settings.html" },
  ]);
});

test("navigates the current owned extension tab instead of creating another tab", async () => {
  const calls = [];
  const gateway = createSafariGateway(fakeBrowser({
    tabs: {
      getCurrent: async () => ({
        id: 17,
        url: "safari-web-extension://independent/shelf.html",
      }),
      update: async (id, request) => calls.push(["update", id, request]),
      create: async (request) => calls.push(["create", request]),
    },
  }));

  await gateway.openSettings();

  assert.deepEqual(calls, [[
    "update",
    17,
    { url: "safari-web-extension://independent/settings.html" },
  ]]);
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
