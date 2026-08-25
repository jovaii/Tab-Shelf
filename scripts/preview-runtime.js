(() => {
  "use strict";

  const pageUrl = new URL(globalThis.location.href);
  const fixture = globalThis.__TAB_SHELF_FIXTURE__;
  if (pageUrl.searchParams.get("preview") !== "1" || globalThis.browser !== undefined) {
    delete globalThis.__TAB_SHELF_FIXTURE__;
    return;
  }
  if (!fixture || !Array.isArray(fixture.tabs)) return;

  const clone = (value) => value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
  let tabs = clone(fixture.tabs);
  const storageKey = "tabShelf.preview.storage.v1";

  function eventChannel() {
    const listeners = new Set();
    return {
      addListener(listener) {
        if (typeof listener === "function") listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      },
      emit(...values) {
        for (const listener of listeners) listener(...values);
      },
    };
  }

  const onCreated = eventChannel();
  const onUpdated = eventChannel();
  const onRemoved = eventChannel();
  const onInstalled = eventChannel();
  const onStartup = eventChannel();
  const onStorageChanged = eventChannel();

  function readStorage() {
    const raw = globalThis.localStorage.getItem(storageKey);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function selectedStorage(values, key) {
    if (typeof key === "string") {
      return Object.prototype.hasOwnProperty.call(values, key)
        ? { [key]: clone(values[key]) }
        : {};
    }
    if (Array.isArray(key)) {
      return Object.fromEntries(key
        .filter((entry) => typeof entry === "string" && Object.prototype.hasOwnProperty.call(values, entry))
        .map((entry) => [entry, clone(values[entry])]));
    }
    if (key === null || key === undefined) return clone(values);
    if (typeof key === "object") {
      return Object.fromEntries(Object.entries(key).map(([entry, fallback]) => [
        entry,
        Object.prototype.hasOwnProperty.call(values, entry) ? clone(values[entry]) : clone(fallback),
      ]));
    }
    return {};
  }

  function ownedUrl(path) {
    if (path === "") return `${globalThis.location.origin}/`;
    const url = new URL(path, `${globalThis.location.origin}/`);
    url.searchParams.set("preview", "1");
    return url.href;
  }

  globalThis.browser = Object.freeze({
    tabs: Object.freeze({
      query: async () => clone(tabs),
      getCurrent: async () => ({ id: 9000, windowId: 1, url: globalThis.location.href }),
      get: async (tabId) => clone(tabs.find((tab) => tab.id === tabId) ?? { id: tabId, windowId: 1 }),
      update: async (tabId, patch) => {
        tabs = tabs.map((tab) => ({ ...tab, active: tab.id === tabId ? patch.active === true : false }));
        const tab = tabs.find((candidate) => candidate.id === tabId);
        onUpdated.emit(tabId, clone(patch), clone(tab));
        return clone(tab);
      },
      remove: async (identifiers) => {
        const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
        tabs = tabs.filter((tab) => !ids.includes(tab.id));
        for (const id of ids) onRemoved.emit(id, { windowId: 1, isWindowClosing: false });
      },
      create: async ({ url }) => {
        if (typeof url === "string" && url.startsWith(globalThis.location.origin)) {
          globalThis.location.assign(url);
        }
        const tab = { id: 9001, windowId: 1, active: true, title: "Tab Shelf", url };
        onCreated.emit(clone(tab));
        return tab;
      },
      onCreated,
      onUpdated,
      onRemoved,
    }),
    windows: Object.freeze({
      update: async () => undefined,
    }),
    storage: Object.freeze({
      local: Object.freeze({
        get: async (key) => selectedStorage(readStorage(), key),
        set: async (value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("Preview storage value must be an object");
          }
          const stored = readStorage();
          const changes = {};
          for (const [key, entry] of Object.entries(value)) {
            const oldValue = Object.prototype.hasOwnProperty.call(stored, key)
              ? clone(stored[key])
              : undefined;
            const newValue = clone(entry);
            stored[key] = newValue;
            changes[key] = { oldValue, newValue: clone(newValue) };
          }
          globalThis.localStorage.setItem(storageKey, JSON.stringify(stored));
          if (Object.keys(changes).length > 0) onStorageChanged.emit(changes, "local");
        },
      }),
      onChanged: onStorageChanged,
    }),
    runtime: Object.freeze({
      getURL: ownedUrl,
      onInstalled,
      onStartup,
    }),
    action: Object.freeze({
      setBadgeText: async () => undefined,
      setBadgeBackgroundColor: async () => undefined,
    }),
  });

  globalThis.document.documentElement.dataset.renderReady = "pending";
  delete globalThis.__TAB_SHELF_FIXTURE__;
})();
