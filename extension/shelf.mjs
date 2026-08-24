import {
  buildShelfModel,
  planCloseExtraShelves,
} from "./core/tab-model.mjs";
import { createSafariGateway } from "./platform/safari-gateway.mjs";
import {
  formatShelfDate,
  greetingForHour,
  renderShelf,
} from "./ui/shelf-view.mjs";
import { applyTheme } from "./ui/theme-runtime.mjs";

const elements = Object.freeze({
  greeting: document.querySelector("#greeting"),
  date: document.querySelector("#current-date"),
  settings: document.querySelector("#settings-button"),
  closeExtraShelves: document.querySelector("#close-extra-shelves"),
  domainCount: document.querySelector("#domain-count"),
  duplicateCount: document.querySelector("#duplicate-count"),
  openCount: document.querySelector("#open-count"),
  status: document.querySelector("#status"),
  grid: document.querySelector("#card-grid"),
});

let gateway;
let latestTabs = [];
let latestCurrentTab = null;

function setStatus(message = "") {
  elements.status.textContent = message;
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function updateHeader(model) {
  elements.openCount.textContent = String(model.visibleTabCount);
  elements.domainCount.textContent = countLabel(model.groups.length, "domain");
  elements.duplicateCount.textContent = model.duplicatePageCount === 0
    ? "No duplicates"
    : countLabel(model.duplicatePageCount, "duplicate page");
  elements.closeExtraShelves.hidden = model.shelfTabCount < 2;
}

async function perform(operation, { refreshAfter = false } = {}) {
  setStatus();
  try {
    await operation();
    if (refreshAfter) await refresh();
  } catch (error) {
    setStatus(error?.message || "The action could not be completed.");
  }
}

async function refresh() {
  setStatus();
  try {
    const [tabs, currentTab, preferences] = await Promise.all([
      gateway.listTabs(),
      gateway.getCurrentTab(),
      gateway.getPreferences(),
    ]);
    applyTheme(document.documentElement, preferences);
    latestTabs = tabs;
    latestCurrentTab = currentTab;
    const model = buildShelfModel(tabs, {
      currentShelfTabId: currentTab.id,
      extensionOrigin: gateway.extensionOrigin(),
    });
    updateHeader(model);
    renderShelf(document, elements.grid, model, {
      onActivate: (tabId) => perform(() => gateway.activateTab(tabId)),
      onClose: (tabId) => perform(() => gateway.closeTabs([tabId]), { refreshAfter: true }),
      onCloseGroup: (tabIds) => perform(() => gateway.closeTabs(tabIds), { refreshAfter: true }),
    });
    document.documentElement.dataset.renderReady = "true";
  } catch {
    elements.openCount.textContent = "0";
    elements.domainCount.textContent = "0 domains";
    elements.duplicateCount.textContent = "Unavailable";
    elements.closeExtraShelves.hidden = true;
    elements.grid.replaceChildren();
    setStatus("Safari tab access is unavailable. Enable Tab Shelf for this Safari profile and reload the page.");
    document.documentElement.dataset.renderReady = "error";
  }
}

function updateClock() {
  const now = new Date();
  elements.greeting.textContent = greetingForHour(now.getHours());
  elements.date.textContent = formatShelfDate(now);
}

function attachTabRefreshEvents(browserApi) {
  const refreshSoon = () => window.setTimeout(refresh, 80);
  browserApi.tabs.onCreated?.addListener(refreshSoon);
  browserApi.tabs.onUpdated?.addListener(refreshSoon);
  browserApi.tabs.onRemoved?.addListener(refreshSoon);
}

async function start() {
  updateClock();
  try {
    gateway = createSafariGateway(globalThis.browser);
  } catch {
    setStatus("Open this page through Safari after adding Tab Shelf as an extension.");
    return;
  }

  elements.settings.addEventListener("click", () => perform(() => gateway.openSettings()));
  elements.closeExtraShelves.addEventListener("click", () => perform(async () => {
    const tabIds = planCloseExtraShelves(latestTabs, {
      currentShelfTabId: latestCurrentTab.id,
      extensionOrigin: gateway.extensionOrigin(),
    });
    if (tabIds.length > 0) await gateway.closeTabs(tabIds);
  }, { refreshAfter: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  attachTabRefreshEvents(globalThis.browser);
  await refresh();
}

start();
