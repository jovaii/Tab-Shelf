const WEB_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/iu;

function validTabId(value) {
  return Number.isInteger(value) && value >= 0;
}

function parseWebUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    return WEB_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normalizedExtensionOrigin(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("extensionOrigin must be a non-empty string");
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function isExtensionUrl(value, extensionOrigin) {
  return typeof value === "string"
    && value.startsWith(normalizedExtensionOrigin(extensionOrigin));
}

function isShelfUrl(value, extensionOrigin) {
  if (!isExtensionUrl(value, extensionOrigin)) return false;
  const base = normalizedExtensionOrigin(extensionOrigin);
  const path = value.slice(base.length).split(/[?#]/u, 1)[0];
  return path === "shelf.html";
}

function safeFavicon(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (SAFE_DATA_IMAGE.test(value)) return value;
  const parsed = parseWebUrl(value);
  return parsed ? parsed.href : null;
}

function displayTitle(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized || fallback;
}

export function isVisibleWebTab(tab, { extensionOrigin }) {
  if (!tab || !validTabId(tab.id)) return false;
  if (isExtensionUrl(tab.url, extensionOrigin)) return false;
  return parseWebUrl(tab.url) !== null;
}

export function canonicalPageUrl(value) {
  const url = parseWebUrl(value);
  if (!url) return null;
  url.hash = "";
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/u, "");
  }
  return url.href;
}

export function groupKeyForUrl(value) {
  const url = parseWebUrl(value);
  if (!url) return null;
  return url.hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
}

export function buildShelfModel(tabs, { currentShelfTabId, extensionOrigin }) {
  if (!Array.isArray(tabs)) throw new TypeError("tabs must be an array");
  const origin = normalizedExtensionOrigin(extensionOrigin);
  const shelfTabCount = tabs.filter((tab) => tab && isShelfUrl(tab.url, origin)).length;
  const visibleTabs = tabs.filter((tab) => isVisibleWebTab(tab, { extensionOrigin: origin }));
  const canonicalCounts = new Map();

  for (const tab of visibleTabs) {
    const canonicalUrl = canonicalPageUrl(tab.url);
    canonicalCounts.set(canonicalUrl, (canonicalCounts.get(canonicalUrl) ?? 0) + 1);
  }

  const grouped = new Map();
  for (const tab of visibleTabs) {
    const key = groupKeyForUrl(tab.url);
    const canonicalUrl = canonicalPageUrl(tab.url);
    const normalizedTab = Object.freeze({
      id: tab.id,
      windowId: validTabId(tab.windowId) ? tab.windowId : null,
      active: tab.active === true,
      title: displayTitle(tab.title, key),
      url: tab.url,
      favIconUrl: safeFavicon(tab.favIconUrl),
      canonicalUrl,
      isDuplicate: (canonicalCounts.get(canonicalUrl) ?? 0) > 1,
      isCurrentShelf: tab.id === currentShelfTabId,
    });
    const group = grouped.get(key) ?? [];
    group.push(normalizedTab);
    grouped.set(key, group);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .map(([key, groupTabs]) => Object.freeze({
      key,
      label: key,
      tabs: Object.freeze(groupTabs),
    }));

  const duplicatePageCount = [...canonicalCounts.values()]
    .filter((count) => count > 1)
    .length;

  return Object.freeze({
    visibleTabCount: visibleTabs.length,
    duplicatePageCount,
    shelfTabCount,
    groups: Object.freeze(groups),
  });
}

export function planCloseGroup(group) {
  if (!group || !Array.isArray(group.tabs)) {
    throw new TypeError("group must contain a tabs array");
  }
  const seen = new Set();
  const tabIds = [];
  for (const tab of group.tabs) {
    if (tab && validTabId(tab.id) && !seen.has(tab.id)) {
      seen.add(tab.id);
      tabIds.push(tab.id);
    }
  }
  return Object.freeze(tabIds);
}

export function planCloseExtraShelves(tabs, { currentShelfTabId, extensionOrigin }) {
  if (!Array.isArray(tabs)) throw new TypeError("tabs must be an array");
  if (!validTabId(currentShelfTabId)) throw new TypeError("currentShelfTabId must be valid");
  const origin = normalizedExtensionOrigin(extensionOrigin);
  return Object.freeze(tabs
    .filter((tab) => tab
      && validTabId(tab.id)
      && tab.id !== currentShelfTabId
      && isShelfUrl(tab.url, origin))
    .map((tab) => tab.id));
}
