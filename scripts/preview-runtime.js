(() => {
  "use strict";

  const pageUrl = new URL(globalThis.location.href);
  const fixture = globalThis.__TAB_SHELF_FIXTURE__;
  if (pageUrl.searchParams.get("preview") !== "1" || globalThis.browser !== undefined) {
    delete globalThis.__TAB_SHELF_FIXTURE__;
    return;
  }
  if (!fixture || !Array.isArray(fixture.tabs)) return;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  let tabs = clone(fixture.tabs);
  const storageKey = "tabShelf.preview.preferences";

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
        get: async (key) => {
          const raw = globalThis.localStorage.getItem(storageKey);
          if (!raw) return {};
          try {
            return { [key]: JSON.parse(raw) };
          } catch {
            return {};
          }
        },
        set: async (value) => {
          const [entry] = Object.values(value);
          globalThis.localStorage.setItem(storageKey, JSON.stringify(entry));
        },
      }),
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
