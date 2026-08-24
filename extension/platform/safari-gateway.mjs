import {
  DEFAULT_PREFERENCES,
  PREFERENCE_KEY,
  exportPreferences,
  importPreferences,
  validatePreferences,
} from "../core/preferences.mjs";

const REQUIRED_METHODS = Object.freeze([
  ["tabs", "query"],
  ["tabs", "getCurrent"],
  ["tabs", "get"],
  ["tabs", "update"],
  ["tabs", "remove"],
  ["tabs", "create"],
  ["windows", "update"],
  ["storage", "local", "get"],
  ["storage", "local", "set"],
  ["runtime", "getURL"],
  ["action", "setBadgeText"],
  ["action", "setBadgeBackgroundColor"],
]);

function methodAt(root, path) {
  let value = root;
  for (const segment of path) value = value?.[segment];
  return value;
}

function assertSafariApi(browserApi) {
  if (!browserApi || typeof browserApi !== "object") {
    throw new TypeError("Safari browser API is unavailable");
  }
  for (const path of REQUIRED_METHODS) {
    if (typeof methodAt(browserApi, path) !== "function") {
      throw new TypeError("Safari browser API is incomplete");
    }
  }
}

function validIdentifier(value) {
  return Number.isInteger(value) && value >= 0;
}

function assertIdentifier(value) {
  if (!validIdentifier(value)) throw new TypeError("Invalid tab identifier");
}

export class TabShelfPlatformError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TabShelfPlatformError";
    this.code = code;
  }
}

async function platformCall(code, message, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TabShelfPlatformError) throw error;
    throw new TabShelfPlatformError(code, message);
  }
}

function detachedPreferences(value) {
  return JSON.parse(exportPreferences(value));
}

export function createSafariGateway(browserApi) {
  assertSafariApi(browserApi);

  function extensionOrigin() {
    const value = browserApi.runtime.getURL("");
    if (typeof value !== "string" || value.length === 0) {
      throw new TabShelfPlatformError("EXTENSION_URL_FAILED", "Safari extension URL is unavailable");
    }
    return value.endsWith("/") ? value : `${value}/`;
  }

  async function listTabs() {
    const tabs = await platformCall(
      "TAB_QUERY_FAILED",
      "Safari tabs could not be read",
      () => browserApi.tabs.query({}),
    );
    if (!Array.isArray(tabs)) {
      throw new TabShelfPlatformError("TAB_QUERY_FAILED", "Safari returned an invalid tab list");
    }
    return tabs;
  }

  async function getCurrentTab() {
    const tab = await platformCall(
      "CURRENT_TAB_FAILED",
      "The current Safari tab could not be identified",
      () => browserApi.tabs.getCurrent(),
    );
    if (!tab || !validIdentifier(tab.id)) {
      throw new TabShelfPlatformError("CURRENT_TAB_FAILED", "Safari returned an invalid current tab");
    }
    return tab;
  }

  async function activateTab(tabId) {
    assertIdentifier(tabId);
    await platformCall(
      "TAB_ACTIVATE_FAILED",
      "The selected Safari tab could not be activated",
      () => browserApi.tabs.update(tabId, { active: true }),
    );
    const tab = await platformCall(
      "TAB_LOOKUP_FAILED",
      "The selected Safari tab could not be located",
      () => browserApi.tabs.get(tabId),
    );
    if (!tab || !validIdentifier(tab.windowId)) {
      throw new TabShelfPlatformError("WINDOW_LOOKUP_FAILED", "The selected Safari window is invalid");
    }
    await platformCall(
      "WINDOW_FOCUS_FAILED",
      "The selected Safari window could not be focused",
      () => browserApi.windows.update(tab.windowId, { focused: true }),
    );
  }

  async function closeTabs(tabIds) {
    if (!Array.isArray(tabIds) || tabIds.length === 0) {
      throw new TypeError("No tab identifiers were provided");
    }
    for (const tabId of tabIds) assertIdentifier(tabId);
    const uniqueTabIds = [...new Set(tabIds)];
    await platformCall(
      "TAB_CLOSE_FAILED",
      "One or more Safari tabs could not be closed",
      () => browserApi.tabs.remove(uniqueTabIds),
    );
  }

  async function getPreferences() {
    const stored = await platformCall(
      "PREFERENCE_READ_FAILED",
      "Tab Shelf preferences could not be read",
      () => browserApi.storage.local.get(PREFERENCE_KEY),
    );
    if (!stored || typeof stored !== "object" || !(PREFERENCE_KEY in stored)) {
      return importPreferences(exportPreferences(DEFAULT_PREFERENCES));
    }
    try {
      return validatePreferences(stored[PREFERENCE_KEY]);
    } catch {
      throw new TabShelfPlatformError("PREFERENCE_INVALID", "Stored preferences are invalid");
    }
  }

  async function setPreferences(value) {
    let preferences;
    try {
      preferences = detachedPreferences(validatePreferences(value));
    } catch {
      throw new TabShelfPlatformError("PREFERENCE_INVALID", "Preferences are invalid");
    }
    await platformCall(
      "PREFERENCE_WRITE_FAILED",
      "Tab Shelf preferences could not be saved",
      () => browserApi.storage.local.set({ [PREFERENCE_KEY]: preferences }),
    );
  }

  async function openOwnedPage(path) {
    const url = browserApi.runtime.getURL(path);
    if (typeof url !== "string" || !url.startsWith(extensionOrigin())) {
      throw new TabShelfPlatformError("EXTENSION_URL_FAILED", "Safari extension URL is invalid");
    }
    return platformCall(
      "TAB_CREATE_FAILED",
      "Safari could not open the requested Tab Shelf page",
      () => browserApi.tabs.create({ url }),
    );
  }

  async function setBadge(count) {
    if (!Number.isInteger(count) || count < 0 || count > 9999) {
      throw new TypeError("badge count must be an integer from 0 through 9999");
    }
    await platformCall(
      "BADGE_UPDATE_FAILED",
      "The Safari toolbar count could not be updated",
      () => browserApi.action.setBadgeText({ text: count === 0 ? "" : String(count) }),
    );
    await platformCall(
      "BADGE_UPDATE_FAILED",
      "The Safari toolbar color could not be updated",
      () => browserApi.action.setBadgeBackgroundColor({ color: "#2f6f68" }),
    );
  }

  return Object.freeze({
    extensionOrigin,
    listTabs,
    getCurrentTab,
    activateTab,
    closeTabs,
    getPreferences,
    setPreferences,
    openShelf: () => openOwnedPage("shelf.html"),
    openSettings: () => openOwnedPage("settings.html"),
    setBadge,
  });
}
