import {
  buildShelfModel,
  planCloseExtraShelves,
} from "./core/tab-model.mjs";
import { applyWorkspaceAction } from "./core/workspace-actions.mjs";
import {
  buildWorkspaceView,
  createDefaultWorkspace,
} from "./core/workspace.mjs";
import { createSafariGateway } from "./platform/safari-gateway.mjs";
import {
  formatShelfDate,
  greetingForHour,
  renderShelf,
} from "./ui/shelf-view.mjs";
import { createSortableController } from "./ui/sortable-controller.mjs";
import { applyTheme } from "./ui/theme-runtime.mjs";

const elements = Object.freeze({
  greeting: document.querySelector("#greeting"),
  date: document.querySelector("#current-date"),
  settings: document.querySelector("#settings-button"),
  newCategory: document.querySelector("#new-category"),
  closeExtraShelves: document.querySelector("#close-extra-shelves"),
  domainCount: document.querySelector("#domain-count"),
  duplicateCount: document.querySelector("#duplicate-count"),
  openCount: document.querySelector("#open-count"),
  status: document.querySelector("#status"),
  root: document.querySelector("#workspace-root"),
  categoryDialog: document.querySelector("#category-dialog"),
  categoryForm: document.querySelector("#category-form"),
  categoryTitle: document.querySelector("#category-dialog-title"),
  categoryName: document.querySelector("#category-name"),
  categorySubmit: document.querySelector("#category-submit"),
  categoryCancel: document.querySelector("#category-cancel"),
  categoryError: document.querySelector("#category-error"),
});

let gateway;
let latestTabs = [];
let latestCurrentTab = null;
let latestBaseModel = null;
let latestWorkspace = createDefaultWorkspace();
let sortableController;
let unsubscribeWorkspace = () => undefined;
let editorState = null;
let refreshTimer = null;
let dragActive = false;
let pendingRefresh = false;
let workspaceWritePending = 0;
let workspaceQueue = Promise.resolve();

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

function actionAnnouncement(action) {
  switch (action.type) {
    case "create-category": return "Category created";
    case "rename-category": return "Category renamed";
    case "delete-category": return "Category deleted; its domains returned to automatic categories";
    case "toggle-category": return "Category visibility updated";
    case "move-category": return "Category order saved";
    case "move-card": return "Domain position saved";
    default: return "Workspace layout saved";
  }
}

function restoreWorkspaceFocus(action) {
  const groupId = action.toGroupId ?? action.groupId ?? action.id;
  const domain = action.domain;
  window.requestAnimationFrame(() => {
    const handles = [...elements.root.querySelectorAll("[data-sort-kind]")];
    const target = domain
      ? handles.find((handle) => handle.dataset.domain === domain)
      : handles.find((handle) => handle.dataset.groupId === groupId);
    target?.focus();
  });
}

function renderCurrentShelf() {
  if (!latestBaseModel) return;
  const organized = buildWorkspaceView(latestBaseModel, latestWorkspace);
  updateHeader(organized);
  renderShelf(document, elements.root, organized, {
    onActivate: (tabId) => perform(() => gateway.activateTab(tabId)),
    onClose: (tabId) => perform(() => gateway.closeTabs([tabId]), { refreshAfter: true }),
    onCloseGroup: (tabIds) => perform(() => gateway.closeTabs(tabIds), { refreshAfter: true }),
    onWorkspaceAction: handleWorkspaceAction,
    onCreateCategory: openCreateCategory,
    onEditCategory: openEditCategory,
  });
}

function flushPendingRefresh() {
  if (dragActive || workspaceWritePending > 0 || !pendingRefresh) return;
  pendingRefresh = false;
  refresh();
}

async function saveWorkspaceAction(action) {
  const before = latestWorkspace;
  try {
    const next = applyWorkspaceAction(latestWorkspace, action);
    latestWorkspace = next;
    renderCurrentShelf();
    await gateway.setWorkspace(next);
    setStatus(actionAnnouncement(action));
    restoreWorkspaceFocus(action);
    return true;
  } catch {
    latestWorkspace = before;
    renderCurrentShelf();
    setStatus("Workspace layout could not be saved.");
    restoreWorkspaceFocus(action);
    return false;
  }
}

function commitWorkspaceAction(action) {
  workspaceWritePending += 1;
  const operation = workspaceQueue
    .then(() => saveWorkspaceAction(action))
    .finally(() => {
      workspaceWritePending -= 1;
      flushPendingRefresh();
    });
  workspaceQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function handleWorkspaceAction(action) {
  if (
    action.type === "delete-category"
    && !window.confirm("Delete this category? Its domains will return to automatic categories.")
  ) return false;
  return commitWorkspaceAction(action);
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
  if (dragActive || workspaceWritePending > 0) {
    pendingRefresh = true;
    return;
  }
  setStatus();
  try {
    const [tabs, currentTab, preferences, workspaceRead] = await Promise.all([
      gateway.listTabs(),
      gateway.getCurrentTab(),
      gateway.getPreferences(),
      gateway.getWorkspace().then(
        (workspace) => ({ workspace, failed: false }),
        () => ({ workspace: createDefaultWorkspace(), failed: true }),
      ),
    ]);
    applyTheme(document.documentElement, preferences);
    latestTabs = tabs;
    latestCurrentTab = currentTab;
    latestWorkspace = workspaceRead.workspace;
    latestBaseModel = buildShelfModel(tabs, {
      currentShelfTabId: currentTab.id,
      extensionOrigin: gateway.extensionOrigin(),
    });
    renderCurrentShelf();
    if (workspaceRead.failed) setStatus("Saved workspace layout could not be loaded.");
    document.documentElement.dataset.renderReady = "true";
  } catch {
    latestBaseModel = null;
    elements.openCount.textContent = "0";
    elements.domainCount.textContent = "0 domains";
    elements.duplicateCount.textContent = "Unavailable";
    elements.closeExtraShelves.hidden = true;
    elements.root.replaceChildren();
    setStatus("Safari tab access is unavailable. Enable Tab Shelf for this Safari profile and reload the page.");
    document.documentElement.dataset.renderReady = "error";
  }
}

function scheduleRefresh() {
  if (dragActive || workspaceWritePending > 0) {
    pendingRefresh = true;
    return;
  }
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 80);
}

function normalizedCategoryStem(name) {
  const stem = name
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  return stem || "category";
}

function nextCategoryId(name) {
  const existing = new Set(latestWorkspace.customGroups.map(({ id }) => id));
  const stem = normalizedCategoryStem(name);
  let candidate = `custom:${stem}`;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `custom:${stem.slice(0, 28)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function openCategoryDialog(state) {
  editorState = state;
  const editing = state.mode === "rename";
  elements.categoryTitle.textContent = editing ? "Rename category" : "New category";
  elements.categorySubmit.textContent = editing ? "Save name" : "Create category";
  elements.categoryName.value = state.name ?? "";
  elements.categoryError.textContent = "";
  elements.categoryDialog.showModal();
  elements.categoryName.focus();
  elements.categoryName.select();
}

function openCreateCategory(domain = null) {
  openCategoryDialog({ mode: "create", domain });
}

function openEditCategory(category) {
  openCategoryDialog({ mode: "rename", groupId: category.id, name: category.name });
}

async function submitCategory(event) {
  event.preventDefault();
  if (!editorState) return;
  const submission = Object.freeze({ ...editorState });
  const name = elements.categoryName.value.replace(/\s+/gu, " ").trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 40) {
    elements.categoryError.textContent = "Enter a name from 1 to 40 characters.";
    elements.categoryName.focus();
    return;
  }
  elements.categorySubmit.disabled = true;
  elements.categoryCancel.disabled = true;
  let saved = false;
  if (submission.mode === "rename") {
    saved = await commitWorkspaceAction({
      type: "rename-category",
      groupId: submission.groupId,
      name,
    });
  } else {
    const id = nextCategoryId(name);
    saved = await commitWorkspaceAction({ type: "create-category", id, name });
    if (saved && submission.domain) {
      saved = await commitWorkspaceAction({
        type: "move-card",
        domain: submission.domain,
        toGroupId: id,
        beforeDomain: null,
        visibleDomains: [],
      });
    }
  }
  elements.categorySubmit.disabled = false;
  elements.categoryCancel.disabled = false;
  if (saved) {
    editorState = null;
    elements.categoryDialog.close();
  } else {
    elements.categoryError.textContent = "Choose a different name or try saving again.";
  }
}

function updateClock() {
  const now = new Date();
  elements.greeting.textContent = greetingForHour(now.getHours());
  elements.date.textContent = formatShelfDate(now);
}

function attachTabRefreshEvents(browserApi) {
  browserApi.tabs.onCreated?.addListener(scheduleRefresh);
  browserApi.tabs.onUpdated?.addListener(scheduleRefresh);
  browserApi.tabs.onRemoved?.addListener(scheduleRefresh);
}

async function start() {
  updateClock();
  try {
    gateway = createSafariGateway(globalThis.browser);
  } catch {
    setStatus("Open this page through Safari after adding Tab Shelf as an extension.");
    return;
  }

  sortableController = createSortableController({
    root: elements.root,
    window,
    onAction: handleWorkspaceAction,
    onDragStateChange: (active) => {
      dragActive = active;
      document.documentElement.dataset.dragActive = active ? "true" : "false";
      if (!active) window.setTimeout(flushPendingRefresh, 0);
    },
  });
  unsubscribeWorkspace = gateway.onWorkspaceChanged((workspace) => {
    latestWorkspace = workspace;
    if (dragActive) pendingRefresh = true;
    else renderCurrentShelf();
  });

  elements.settings.addEventListener("click", () => perform(() => gateway.openSettings()));
  elements.newCategory.addEventListener("click", () => openCreateCategory());
  elements.categoryForm.addEventListener("submit", submitCategory);
  elements.categoryCancel.addEventListener("click", () => {
    editorState = null;
    elements.categoryDialog.close();
  });
  elements.categoryDialog.addEventListener("cancel", () => {
    editorState = null;
  });
  elements.closeExtraShelves.addEventListener("click", () => perform(async () => {
    const tabIds = planCloseExtraShelves(latestTabs, {
      currentShelfTabId: latestCurrentTab.id,
      extensionOrigin: gateway.extensionOrigin(),
    });
    if (tabIds.length > 0) await gateway.closeTabs(tabIds);
  }, { refreshAfter: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleRefresh();
  });
  window.addEventListener("pagehide", () => {
    unsubscribeWorkspace();
    sortableController.destroy();
  }, { once: true });
  attachTabRefreshEvents(globalThis.browser);
  await refresh();
}

start();
