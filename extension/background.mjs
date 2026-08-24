const BADGE_COLOR = "#2f6f68";

function isOrdinaryWebUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function countVisibleWebTabs(tabs) {
  if (!Array.isArray(tabs)) throw new TypeError("A tab list is required");
  return tabs.reduce((count, tab) => count + (isOrdinaryWebUrl(tab?.url) ? 1 : 0), 0);
}

export async function refreshBadge(browserApi) {
  if (!browserApi?.tabs?.query
    || !browserApi?.action?.setBadgeText
    || !browserApi?.action?.setBadgeBackgroundColor) {
    throw new TypeError("Safari badge APIs are unavailable");
  }
  const tabs = await browserApi.tabs.query({});
  const count = countVisibleWebTabs(tabs);
  await browserApi.action.setBadgeText({ text: count === 0 ? "" : String(count) });
  await browserApi.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  return count;
}

export function installBadgeLifecycle(browserApi) {
  const refreshSafely = () => {
    void refreshBadge(browserApi).catch(() => undefined);
  };
  browserApi.tabs.onCreated?.addListener(refreshSafely);
  browserApi.tabs.onUpdated?.addListener(refreshSafely);
  browserApi.tabs.onRemoved?.addListener(refreshSafely);
  browserApi.runtime.onInstalled?.addListener(refreshSafely);
  browserApi.runtime.onStartup?.addListener(refreshSafely);
  refreshSafely();
}

if (globalThis.browser) installBadgeLifecycle(globalThis.browser);
