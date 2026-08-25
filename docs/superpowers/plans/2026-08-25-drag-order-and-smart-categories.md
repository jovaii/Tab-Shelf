# Drag Ordering and Smart Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic local categories, persistent user-created categories, and pointer/keyboard ordering for Tab Shelf domain cards without changing Safari's native tabs.

**Architecture:** Keep `buildShelfModel()` as the one-domain-one-card source model. A new workspace domain validates local storage, classifies unassigned domains, merges visible cards into saved order, and exposes pure typed actions; the view and Pointer Events controller consume that shared action layer. Safari storage, theme preferences, and workspace layout remain separate contracts.

**Tech Stack:** Safari Web Extension Manifest V3, dependency-free JavaScript ES modules, safe DOM construction, CSS Grid, Pointer Events, `browser.storage.local`, Node `node:test`, Swift/AppKit/WebKit local visual verification, Xcode 26.6.

## Global Constraints

- Release scope is macOS Safari only; do not add a Chrome runtime path.
- Keep permissions exactly `tabs` and `storage`.
- Do not add accounts, cloud services, AI, telemetry, advertising, remote assets, runtime dependencies, or application-owned network requests.
- Dragging changes only Tab Shelf visual organization; it never changes Safari's native tab order, windows, or Tab Groups.
- Keep `tabShelf.preferences.v1` unchanged and store workspace state separately as `tabShelf.workspace.v1`.
- Keep public repository content English-only and use synthetic or disposable browsing data in tests and visuals.
- Permit at most 24 custom groups; normalize names to 1–40 visible characters and compare them case-insensitively.
- Bound retained domain records to 2,048 and reject unknown keys, unsafe prototypes, duplicates, and oversized serialized workspaces.
- Maintain zero runtime dependencies and safe text-only DOM construction.
- Synchronize every changed shipping extension path and SHA-256 with `scripts/app-store-release-profile.mjs`, the approved path lists, and the recomputed profile seal before running the full test suite.
- Use test-driven development for every behavior change and commit each independently testable task.
- Every human approval document must retain its Markdown source, Web Mind Map, and Web One Slide views.

## File Responsibility Map

### New files

- `extension/core/classifier.mjs`: fixed system taxonomy and deterministic local domain/title classification.
- `extension/core/workspace.mjs`: schema, validation, defaults, visible-card merge, and organized view model.
- `extension/core/workspace-actions.mjs`: immutable typed workspace mutations.
- `extension/ui/sortable-controller.mjs`: pointer threshold, geometry, placeholder, auto-scroll, cancellation, and keyboard action-menu intents.
- `tests/classifier.test.mjs`: classifier rules and privacy boundaries.
- `tests/workspace.test.mjs`: schema validation and visible/stored merge behavior.
- `tests/workspace-actions.test.mjs`: all pure workspace mutations and failure immutability.
- `tests/sortable-controller.test.mjs`: geometry, pointer state, cancellation, and keyboard intent contracts.

### Modified files

- `extension/platform/safari-gateway.mjs`: validated workspace read/write/reset and optional storage-change subscription.
- `extension/ui/shelf-view.mjs`: category sections, card/category handles, action menus, empty custom targets, and typed callbacks.
- `extension/shelf.mjs`: parallel load, organized rendering, latest-value writes, refresh deferral, rollback, and focus restoration.
- `extension/shelf.html`: workspace root and New category action.
- `extension/shelf.css`: category layout, handles, menus, drag states, placeholder, drop targets, responsive behavior, and reduced motion.
- `extension/settings.html`, `extension/settings.mjs`: Reset workspace layout as a separate operation from Reset appearance.
- `scripts/preview-runtime.js`: independent keyed local storage and storage change events.
- `scripts/render-preview.swift`: category, move, persistence, reset, and no-overflow WebKit assertions.
- Existing focused tests and public/release documentation listed in Task 9.

---

### Task 1: Deterministic Local Classifier

**Files:**
- Create: `extension/core/classifier.mjs`
- Create: `tests/classifier.test.mjs`
- Modify: `scripts/app-store-release-profile.mjs`
- Modify: `scripts/check-app-store-readiness.mjs`

**Interfaces:**
- Consumes: a normalized domain group shaped as `{ key: string, tabs: Array<{ title: string }> }`.
- Produces: `SYSTEM_CATEGORIES`, `SYSTEM_CATEGORY_IDS`, and `classifyDomainGroup(group): string` returning one admitted `system:*` ID.

- [ ] **Step 1: Write the failing classifier tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_CATEGORIES,
  classifyDomainGroup,
} from "../extension/core/classifier.mjs";

const group = (key, ...titles) => ({ key, tabs: titles.map((title) => ({ title })) });

test("publishes the fixed ordered system taxonomy", () => {
  assert.deepEqual(SYSTEM_CATEGORIES.map(({ id, name }) => [id, name]), [
    ["system:ai-research", "AI & Research"],
    ["system:work-productivity", "Work & Productivity"],
    ["system:communication", "Communication"],
    ["system:learning", "Learning"],
    ["system:shopping", "Shopping"],
    ["system:news-media", "News & Media"],
    ["system:finance", "Finance"],
    ["system:travel", "Travel"],
    ["system:utilities", "Utilities"],
    ["system:other", "Other"],
  ]);
});

test("classifies exact and suffix domains before title keywords", () => {
  assert.equal(classifyDomainGroup(group("chatgpt.com", "Unrelated")), "system:ai-research");
  assert.equal(classifyDomainGroup(group("mail.google.com", "Inbox")), "system:communication");
  assert.equal(classifyDomainGroup(group("docs.google.com", "Quarterly plan")), "system:work-productivity");
});

test("uses bounded title tokens with deterministic ties and an Other fallback", () => {
  assert.equal(classifyDomainGroup(group("example.test", "Flight booking")), "system:travel");
  assert.equal(classifyDomainGroup(group("example.test", "Research news")), "system:ai-research");
  assert.equal(classifyDomainGroup(group("example.test", "Private account 123")), "system:other");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/classifier.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `extension/core/classifier.mjs`.

- [ ] **Step 3: Implement the fixed local rules**

Implement `classifier.mjs` with frozen category records, exact/suffix domain maps, bounded lowercase token extraction from only `group.key` and current tab titles, fixed scoring, fixed tie order, and `system:other` fallback. Do not read URL paths, query values, page markup, history, cookies, or remote data.

```js
export const SYSTEM_CATEGORIES = deepFreeze([
  { id: "system:ai-research", name: "AI & Research" },
  { id: "system:work-productivity", name: "Work & Productivity" },
  { id: "system:communication", name: "Communication" },
  { id: "system:learning", name: "Learning" },
  { id: "system:shopping", name: "Shopping" },
  { id: "system:news-media", name: "News & Media" },
  { id: "system:finance", name: "Finance" },
  { id: "system:travel", name: "Travel" },
  { id: "system:utilities", name: "Utilities" },
  { id: "system:other", name: "Other" },
]);

export const SYSTEM_CATEGORY_IDS = Object.freeze(SYSTEM_CATEGORIES.map(({ id }) => id));

export function classifyDomainGroup(group) {
  requireDomainGroup(group);
  const domainMatch = exactOrSuffixRule(group.key);
  if (domainMatch) return domainMatch;
  const scores = scoreAdmittedTokens(group);
  return bestCategory(scores) ?? "system:other";
}
```

- [ ] **Step 4: Run the classifier tests and full tests**

Run: `node --test tests/classifier.test.mjs && npm test`

Expected: classifier tests PASS; existing 275 tests still PASS.

- [ ] **Step 5: Commit**

```sh
git add extension/core/classifier.mjs tests/classifier.test.mjs
git commit -m "feat: add local domain classifier"
```

---

### Task 2: Workspace Schema and Organized View Model

**Files:**
- Create: `extension/core/workspace.mjs`
- Create: `tests/workspace.test.mjs`

**Interfaces:**
- Consumes: `SYSTEM_CATEGORIES`, `classifyDomainGroup()`, the existing shelf model, and untrusted stored JSON values.
- Produces: `WORKSPACE_KEY`, `createDefaultWorkspace()`, `validateWorkspace(value)`, and `buildWorkspaceView(model, workspace)`.
- `buildWorkspaceView()` returns `{ ...model, categories }`, where each category is `{ id, name, kind, collapsed, cards }` and each card is an original `model.groups` record.

- [ ] **Step 1: Write failing schema and merge tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_KEY,
  buildWorkspaceView,
  createDefaultWorkspace,
  validateWorkspace,
} from "../extension/core/workspace.mjs";

const model = {
  visibleTabCount: 2,
  duplicatePageCount: 0,
  shelfTabCount: 1,
  groups: [
    { key: "chatgpt.com", label: "chatgpt.com", tabs: [{ title: "ChatGPT" }] },
    { key: "example.test", label: "example.test", tabs: [{ title: "Example" }] },
  ],
};

test("creates a frozen empty workspace under the separate schema", () => {
  const workspace = createDefaultWorkspace();
  assert.equal(WORKSPACE_KEY, "tabShelf.workspace.v1");
  assert.equal(workspace.schema, WORKSPACE_KEY);
  assert.equal(Object.isFrozen(workspace), true);
  assert.deepEqual(workspace.customGroups, []);
});

test("rejects unknown keys, unsafe prototypes, duplicate domains, and bounds", () => {
  const valid = structuredClone(createDefaultWorkspace());
  assert.throws(() => validateWorkspace({ ...valid, surprise: true }), /Unknown/);
  assert.throws(() => validateWorkspace(Object.assign(Object.create({ unsafe: true }), valid)), /plain object/);
  valid.assignments = [
    { domain: "example.test", groupId: "system:other" },
    { domain: "example.test", groupId: "system:travel" },
  ];
  assert.throws(() => validateWorkspace(valid), /duplicate/i);
});

test("merges visible automatic cards with stored manual category and order", () => {
  const workspace = structuredClone(createDefaultWorkspace());
  workspace.customGroups.push({ id: "custom:recruiting", name: "Recruiting" });
  workspace.assignments.push({ domain: "example.test", groupId: "custom:recruiting" });
  workspace.cardOrders.push({
    groupId: "custom:recruiting",
    domains: ["dormant.test", "example.test"],
  });
  const view = buildWorkspaceView(model, workspace);
  assert.deepEqual(view.categories.flatMap(({ cards }) => cards.map(({ key }) => key)), [
    "chatgpt.com",
    "example.test",
  ]);
  assert.equal(view.categories.find(({ id }) => id === "custom:recruiting").cards[0].key, "example.test");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/workspace.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement bounded validation and merge**

Use arrays instead of domain-keyed objects. Normalize domains to lowercase host labels, normalize visible whitespace in names, require known system/custom group IDs, cap custom groups at 24, cap retained domains at 2,048, cap serialized JSON below 512 KiB, return detached deeply frozen data, keep empty custom groups, hide empty system groups, and append unrecorded cards.

```js
export const WORKSPACE_KEY = "tabShelf.workspace.v1";

export function createDefaultWorkspace() {
  return validateWorkspace({
    schema: WORKSPACE_KEY,
    revision: 1,
    groupOrder: [],
    collapsedGroupIds: [],
    customGroups: [],
    assignments: [],
    cardOrders: [],
  });
}

export function buildWorkspaceView(model, value) {
  requireShelfModel(model);
  const workspace = validateWorkspace(value);
  const resolved = resolveVisibleAssignments(model.groups, workspace);
  return deepFreeze({
    ...model,
    categories: mergeCategoryOrder(resolved, workspace),
  });
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/classifier.test.mjs tests/workspace.test.mjs && npm test`

Expected: all focused tests PASS and no existing regression.

- [ ] **Step 5: Commit**

```sh
git add extension/core/workspace.mjs tests/workspace.test.mjs
git commit -m "feat: add persistent workspace model"
```

---

### Task 3: Immutable Workspace Actions

**Files:**
- Create: `extension/core/workspace-actions.mjs`
- Create: `tests/workspace-actions.test.mjs`
- Modify: `extension/core/workspace.mjs`
- Modify: `scripts/app-store-release-profile.mjs`
- Modify: `scripts/check-app-store-readiness.mjs`

**Interfaces:**
- Consumes: a validated workspace and one typed action.
- Produces: `applyWorkspaceAction(workspace, action): Workspace`.
- Action types: `move-card`, `move-category`, `create-category`, `rename-category`, `toggle-category`, `delete-category`, and `reset-workspace`.
- `move-card` may carry the current category's bounded `visibleDomains` order so a relative move remains exact even before those domains have stored order records; this transient array is never persisted as a new schema field.

- [ ] **Step 1: Write failing pure-action tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace } from "../extension/core/workspace.mjs";
import { applyWorkspaceAction } from "../extension/core/workspace-actions.mjs";

test("moves a card and records a permanent category assignment", () => {
  const before = createDefaultWorkspace();
  const after = applyWorkspaceAction(before, {
    type: "move-card",
    domain: "linkedin.com",
    toGroupId: "system:communication",
    beforeDomain: null,
  });
  assert.deepEqual(after.assignments, [
    { domain: "linkedin.com", groupId: "system:communication" },
  ]);
  assert.deepEqual(after.cardOrders, [
    { groupId: "system:communication", domains: ["linkedin.com"] },
  ]);
  assert.deepEqual(before, createDefaultWorkspace());
});

test("creates, renames, toggles, reorders, and deletes a custom category", () => {
  let workspace = applyWorkspaceAction(createDefaultWorkspace(), {
    type: "create-category",
    id: "custom:recruiting",
    name: " Recruiting ",
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "rename-category",
    groupId: "custom:recruiting",
    name: "Hiring",
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "toggle-category",
    groupId: "custom:recruiting",
  });
  workspace = applyWorkspaceAction(workspace, {
    type: "delete-category",
    groupId: "custom:recruiting",
  });
  assert.deepEqual(workspace.customGroups, []);
  assert.deepEqual(workspace.assignments, []);
  assert.deepEqual(workspace.collapsedGroupIds, []);
});

test("rejects invalid actions without mutating input", () => {
  const before = createDefaultWorkspace();
  assert.throws(() => applyWorkspaceAction(before, { type: "move-card", domain: "" }), /domain/i);
  assert.deepEqual(before, createDefaultWorkspace());
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/workspace-actions.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the one typed mutation boundary**

```js
export function applyWorkspaceAction(value, action) {
  const workspace = structuredClone(validateWorkspace(value));
  requirePlainAction(action);
  switch (action.type) {
    case "move-card": moveCard(workspace, action); break;
    case "move-category": moveCategory(workspace, action); break;
    case "create-category": createCategory(workspace, action); break;
    case "rename-category": renameCategory(workspace, action); break;
    case "toggle-category": toggleCategory(workspace, action); break;
    case "delete-category": deleteCategory(workspace, action); break;
    case "reset-workspace": return createDefaultWorkspace();
    default: throw new TypeError("Unsupported workspace action");
  }
  return validateWorkspace(workspace);
}
```

Ensure a cross-category card move removes the domain from every old order, inserts it once at the requested location, and creates/replaces its permanent assignment. Category creation inserts before `system:other`; deletion removes assignments/order/collapse state; reset returns only defaults.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/workspace-actions.test.mjs tests/workspace.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add extension/core/workspace-actions.mjs tests/workspace-actions.test.mjs
git commit -m "feat: add immutable workspace actions"
```

---

### Task 4: Safari Workspace Persistence and Preview Storage

**Files:**
- Modify: `extension/platform/safari-gateway.mjs`
- Modify: `scripts/preview-runtime.js`
- Modify: `tests/safari-gateway.test.mjs`
- Modify: `tests/preview-contract.test.mjs`
- Modify: `scripts/app-store-release-profile.mjs`
- Modify: `scripts/check-app-store-readiness.mjs`

**Interfaces:**
- Consumes: `WORKSPACE_KEY`, `createDefaultWorkspace()`, and `validateWorkspace()`.
- Produces gateway methods `getWorkspace()`, `setWorkspace(value)`, `resetWorkspace()`, and `onWorkspaceChanged(listener): unsubscribe`.

- [ ] **Step 1: Extend gateway and preview tests first**

```js
test("loads, validates, stores, resets, and observes the separate workspace", async () => {
  const writes = [];
  let changeListener;
  const gateway = createSafariGateway(fakeBrowser({
    storageLocal: {
      get: async () => ({}),
      set: async (value) => writes.push(value),
    },
    storageOnChanged: {
      addListener: (listener) => { changeListener = listener; },
      removeListener: () => undefined,
    },
  }));
  assert.equal((await gateway.getWorkspace()).schema, "tabShelf.workspace.v1");
  await gateway.setWorkspace(await gateway.getWorkspace());
  assert.equal(writes[0]["tabShelf.workspace.v1"].schema, "tabShelf.workspace.v1");
  const changes = [];
  gateway.onWorkspaceChanged((workspace) => changes.push(workspace));
  changeListener({ "tabShelf.workspace.v1": { newValue: writes[0]["tabShelf.workspace.v1"] } }, "local");
  assert.equal(changes.length, 1);
  await gateway.resetWorkspace();
  assert.deepEqual(writes.at(-1)["tabShelf.workspace.v1"].customGroups, []);
});
```

Update `fakeBrowser()` to accept optional `storageOnChanged`, and update preview tests to prove preference and workspace keys do not overwrite each other and a `storage.onChanged` event is emitted.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/safari-gateway.test.mjs tests/preview-contract.test.mjs`

Expected: FAIL because workspace methods and keyed preview storage do not exist.

- [ ] **Step 3: Implement validated storage methods**

```js
async function getWorkspace() {
  const stored = await platformCall(
    "WORKSPACE_READ_FAILED",
    "Tab Shelf workspace could not be read",
    () => browserApi.storage.local.get(WORKSPACE_KEY),
  );
  if (!stored || typeof stored !== "object" || !(WORKSPACE_KEY in stored)) {
    return createDefaultWorkspace();
  }
  try {
    return validateWorkspace(stored[WORKSPACE_KEY]);
  } catch {
    throw new TabShelfPlatformError("WORKSPACE_INVALID", "Stored workspace is invalid");
  }
}

async function setWorkspace(value) {
  const workspace = JSON.parse(JSON.stringify(validateWorkspace(value)));
  await platformCall(
    "WORKSPACE_WRITE_FAILED",
    "Tab Shelf workspace could not be saved",
    () => browserApi.storage.local.set({ [WORKSPACE_KEY]: workspace }),
  );
}
```

Preview storage must store a JSON object keyed by the requested storage key and emit `{ [key]: { oldValue, newValue } }` through a local event channel.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/safari-gateway.test.mjs tests/preview-contract.test.mjs && npm test`

Expected: PASS; permissions remain unchanged.

- [ ] **Step 5: Commit**

```sh
git add extension/platform/safari-gateway.mjs scripts/preview-runtime.js tests/safari-gateway.test.mjs tests/preview-contract.test.mjs
git commit -m "feat: persist Safari workspace layout"
```

---

### Task 5: Category Sections, Handles, and Editing Controls

**Files:**
- Modify: `extension/ui/shelf-view.mjs`
- Modify: `extension/shelf.html`
- Modify: `tests/shelf-view.test.mjs`
- Modify: `tests/shelf-contract.test.mjs`

**Interfaces:**
- Consumes: the organized model from `buildWorkspaceView()`.
- Produces category section DOM, card/category handles, typed menu actions, empty custom-category targets, and a `New category` request.
- Extends callbacks with `onWorkspaceAction(action)` and `onCreateCategory()`.

- [ ] **Step 1: Write failing semantic view tests**

```js
test("renders categorized cards with accessible move controls and empty custom targets", () => {
  const root = new FakeNode("div");
  const actions = [];
  renderShelf(fakeDocument, root, {
    ...sampleModel,
    categories: [
      { id: "system:ai-research", name: "AI & Research", kind: "system", collapsed: false, cards: [sampleModel.groups[0]] },
      { id: "custom:focus", name: "Focus", kind: "custom", collapsed: false, cards: [] },
    ],
  }, {
    onActivate() {}, onClose() {}, onCloseGroup() {},
    onWorkspaceAction: (action) => actions.push(action),
  });
  const nodes = walk(root);
  assert.equal(nodes.filter((node) => node.className === "category-section").length, 2);
  assert.equal(nodes.some((node) => node.attributes.get("aria-label") === "Move alpha.test"), true);
  assert.equal(nodes.some((node) => node.attributes.get("aria-label") === "Move AI & Research"), true);
  assert.equal(nodes.some((node) => node.className === "category-empty-target"), true);
});
```

Update the HTML contract to require `id="workspace-root"`, `id="new-category"`, and preserve the status live region.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/shelf-view.test.mjs tests/shelf-contract.test.mjs`

Expected: FAIL because categorized rendering and workspace controls are absent.

- [ ] **Step 3: Implement one category renderer around the existing card renderer**

```js
export function buildShelfTree(model) {
  requireOrganizedModel(model);
  return Object.freeze({
    role: "workspace",
    children: Object.freeze(model.categories.map((category) => Object.freeze({
      role: "category-section",
      id: category.id,
      name: category.name,
      kind: category.kind,
      collapsed: category.collapsed,
      cards: Object.freeze(category.cards.map(cardTree)),
    }))),
  });
}
```

Use safe DOM APIs for headings and custom names. Each category gets a handle, collapse button, count, and menu; each card header gets a dedicated handle with `data-sort-kind="card"`, `data-domain`, and `data-group-id`. Keyboard menu items emit the same `move-card` / `move-category` typed actions used by dragging. Do not make tab titles or close buttons draggable.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/shelf-view.test.mjs tests/shelf-contract.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add extension/ui/shelf-view.mjs extension/shelf.html tests/shelf-view.test.mjs tests/shelf-contract.test.mjs
git commit -m "feat: render smart category sections"
```

---

### Task 6: Pointer and Keyboard Sortable Controller

**Files:**
- Create: `extension/ui/sortable-controller.mjs`
- Create: `tests/sortable-controller.test.mjs`
- Modify: `extension/ui/dom.mjs`
- Modify: `tests/shelf-view.test.mjs`

**Interfaces:**
- Consumes: a workspace root, typed handle datasets, live category/card rectangles, and `onAction(action)`.
- Produces: `createSortableController({ root, window, onAction, onDragStateChange })`, `insertionTarget(rectangles, point)`, and `destroy()`.

- [ ] **Step 1: Write failing geometry and interaction tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAG_THRESHOLD_PX,
  insertionTarget,
} from "../extension/ui/sortable-controller.mjs";

test("uses the approved six-pixel threshold", () => {
  assert.equal(DRAG_THRESHOLD_PX, 6);
});

test("finds a stable before-domain from card midpoints", () => {
  const target = insertionTarget([
    { domain: "a.test", groupId: "system:other", rect: { top: 0, left: 0, width: 200, height: 100 } },
    { domain: "b.test", groupId: "system:other", rect: { top: 0, left: 220, width: 200, height: 100 } },
  ], { x: 230, y: 10 });
  assert.deepEqual(target, {
    groupId: "system:other",
    beforeDomain: "b.test",
  });
});

test("returns null for an invalid or unreachable target", () => {
  assert.equal(insertionTarget([], { x: 0, y: 0 }), null);
});
```

Add controller tests with minimal fake elements to prove movement below six pixels does not start a drag, `Escape` cancels without action, pointer release emits one `move-card`, and keyboard menu intents call the same action boundary.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/sortable-controller.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the local Pointer Events state machine**

```js
export const DRAG_THRESHOLD_PX = 6;

export function createSortableController({ root, window, onAction, onDragStateChange }) {
  requireControllerInputs({ root, window, onAction, onDragStateChange });
  let state = null;
  const listeners = bindPointerAndKeyboardListeners({
    root,
    window,
    readState: () => state,
    writeState: (next) => { state = next; },
    onAction,
    onDragStateChange,
  });
  return Object.freeze({
    get active() { return state?.dragging === true; },
    cancel: () => cancelDrag(state, onDragStateChange),
    destroy: () => listeners.forEach(({ target, type, listener }) => target.removeEventListener(type, listener)),
  });
}
```

Use pointer capture, one placeholder matching the source rectangle, requestAnimationFrame-bounded movement, element rectangles, edge auto-scroll, and exact restoration on pointer cancel, `Escape`, invalid target, or disappearing source. Extend `dom.mjs` only with the admitted events actually required: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and `click`/`keydown` already present.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/sortable-controller.test.mjs tests/shelf-view.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add extension/ui/sortable-controller.mjs extension/ui/dom.mjs tests/sortable-controller.test.mjs tests/shelf-view.test.mjs
git commit -m "feat: add accessible card sorting"
```

---

### Task 7: Workspace Orchestration, Editing, and Reset

**Files:**
- Modify: `extension/shelf.mjs`
- Modify: `extension/settings.html`
- Modify: `extension/settings.mjs`
- Modify: `tests/shelf-contract.test.mjs`
- Modify: `tests/settings-contract.test.mjs`

**Interfaces:**
- Consumes: gateway workspace methods, `buildWorkspaceView()`, `applyWorkspaceAction()`, `createSortableController()`, and view typed actions.
- Produces: latest-value action commits, rollback on save failure, deferred refresh during drag, storage-change refresh, category editing dialog, and separate workspace reset.

- [ ] **Step 1: Write failing orchestration contracts**

Add source contracts that require all four parallel reads, the shared typed action boundary, workspace error messages, deferred refresh state, storage subscription, New category handler, and separate settings reset.

```js
test("shelf loads, renders, mutates, and recovers the separate workspace", () => {
  const javascript = source("extension/shelf.mjs");
  assert.match(javascript, /gateway\.getWorkspace\(\)/u);
  assert.match(javascript, /buildWorkspaceView\(/u);
  assert.match(javascript, /applyWorkspaceAction\(/u);
  assert.match(javascript, /gateway\.setWorkspace\(/u);
  assert.match(javascript, /Workspace layout could not be saved\./u);
  assert.match(javascript, /dragActive/u);
  assert.match(javascript, /pendingRefresh/u);
  assert.match(javascript, /onWorkspaceChanged/u);
});
```

Settings contracts must require `id="reset-workspace"`, `gateway.resetWorkspace()`, `Workspace layout reset`, and verify Reset appearance continues to call only the theme path.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/shelf-contract.test.mjs tests/settings-contract.test.mjs`

Expected: FAIL because orchestration/reset contracts are absent.

- [ ] **Step 3: Implement latest-value commits and rollback**

```js
async function commitWorkspaceAction(action) {
  const before = latestWorkspace;
  try {
    const current = await gateway.getWorkspace();
    const next = applyWorkspaceAction(current, action);
    latestWorkspace = next;
    renderCurrentShelf();
    await gateway.setWorkspace(next);
    setStatus(workspaceAnnouncement(action));
  } catch {
    latestWorkspace = before;
    renderCurrentShelf();
    setStatus("Workspace layout could not be saved.");
  } finally {
    restoreWorkspaceFocus(action);
  }
}
```

`refresh()` must load tabs, current tab, preferences, and workspace in parallel. Invalid workspace shows `Saved workspace layout could not be loaded.` while still rendering tabs with defaults. Tab and storage events schedule one bounded refresh; active drag defers it until commit/cancel. Category create/rename uses a bounded local dialog value and never inserts markup. Settings reset calls `gateway.resetWorkspace()` only and leaves current theme untouched.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/shelf-contract.test.mjs tests/settings-contract.test.mjs tests/safari-gateway.test.mjs && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add extension/shelf.mjs extension/settings.html extension/settings.mjs tests/shelf-contract.test.mjs tests/settings-contract.test.mjs
git commit -m "feat: coordinate persistent workspace changes"
```

---

### Task 8: Responsive Visual System and WebKit Acceptance

**Files:**
- Modify: `extension/shelf.css`
- Modify: `scripts/render-preview.swift`
- Modify: `tests/preview-contract.test.mjs`
- Modify: `tests/shelf-contract.test.mjs`
- Modify: `tests/fixtures/tabs.json` only if synthetic titles need broader category coverage.

**Interfaces:**
- Consumes: semantic category/drag class names and the preview Safari API.
- Produces: stable category lanes, equal card grids, drag placeholder/drop states, compact layout, reduced motion, and deterministic desktop/compact WebKit evidence.

- [ ] **Step 1: Write failing CSS and renderer contracts**

```js
test("category and drag styles preserve equal grids and accessible state", () => {
  const css = source("extension/shelf.css");
  assert.match(css, /\.category-list\s*\{[^}]*display:\s*grid/isu);
  assert.match(css, /\.category-section__grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,/isu);
  assert.match(css, /\.site-card\[data-dragging="true"\]/u);
  assert.match(css, /\.sort-placeholder/u);
  assert.match(css, /\.category-section\[data-drop-target="true"\]/u);
  assert.match(css, /prefers-reduced-motion/u);
  assert.doesNotMatch(css, /masonry|column-count/iu);
});
```

Update renderer contracts to require `.category-section`, card/category handles, same-category move, cross-category move, saved workspace after reload, settings reset, six-card total, eight-tab total, zero horizontal overflow, and both existing viewports.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/shelf-contract.test.mjs tests/preview-contract.test.mjs`

Expected: FAIL because category/drag styles and renderer assertions are absent.

- [ ] **Step 3: Implement style states and update WebKit flow**

The category list is a vertical grid. Each section header uses one compact row; its child card grid reuses the existing `repeat(auto-fit, minmax(min(100%, 19rem), 1fr))`. The placeholder preserves exact card dimensions. Active drop targets combine border/surface/label changes. At narrow widths, controls wrap without horizontal overflow. Drag transitions and auto-scroll are removed under reduced motion.

In `render-preview.swift`, query category and handle counts, invoke the same typed keyboard menu actions where pointer synthesis is unreliable, verify localStorage-backed workspace after reload, reset in Theme Studio, and confirm the theme remains Storm Horizon after workspace reset.

- [ ] **Step 4: Run WebKit and inspect four source screenshots**

Run:

```sh
npm run preview
npm run render:preview
```

Expected: PASS for desktop and compact category metrics, move persistence, settings reset, theme preservation, close-tab behavior, and no horizontal overflow. Inspect `build/screenshots/shelf-desktop.png` and `build/screenshots/shelf-compact.png` with `view_image`.

- [ ] **Step 5: Run full verification and commit**

Run: `npm run check`

Expected: all tests, audit, and source readiness PASS.

```sh
git add extension/shelf.css scripts/render-preview.swift tests/preview-contract.test.mjs tests/shelf-contract.test.mjs tests/fixtures/tabs.json
git commit -m "style: add responsive category workspace"
```

---

### Task 9: Documentation, Safari Installation, and GitHub Synchronization

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `PRIVACY.md`, `SUPPORT.md`, `CONTRIBUTING.md`
- Modify: `docs/testing/local-safari-acceptance.md`, `docs/testing/release-acceptance.md`
- Modify: `docs/app-store/listing.md`, `docs/app-store/privacy-answers.md`, `docs/app-store/review-notes.md`, `docs/app-store/submission-checklist.md`
- Modify: `docs/approvals/2026-08-25-drag-order-and-smart-categories.html`
- Modify or regenerate: `docs/assets/tab-shelf-hero.png`, `docs/assets/social-preview.png`, and any category-specific product screenshot selected for README.
- Generated locally, not committed: `native/generated`, `build/`, and packaged App output.

**Interfaces:**
- Consumes: the verified source feature and acceptance evidence.
- Produces: one matching source commit, generated Safari project, installed local App, English public documentation, current GitHub description/topics/visuals, and no binary consumer release.

- [ ] **Step 1: Update public and legal-facing documentation from verified behavior**

Document automatic categories, permanent manual assignments, drag handles, keyboard alternatives, custom category limits, reset behavior, local storage fields, troubleshooting, no Safari native reorder, and no permission/network change. Change the approval page status from `Design review · Not shipped` only after real Safari acceptance; preserve the original decision content and add a verified outcome line.

- [ ] **Step 2: Update acceptance documents before running them**

Add exact disposable-tab steps for automatic classification, same-category drag, cross-category move, custom create/rename/collapse/delete, relaunch persistence, keyboard moves, concurrent shelf pages, tab activate/close after movement, reset, unchanged appearance, exactly one registration, and strict signatures.

- [ ] **Step 3: Run complete source verification**

Run:

```sh
npm run check
npm run render:approval -- 'http://127.0.0.1:4173/docs/approvals/2026-08-25-drag-order-and-smart-categories.html?approval=1' build/approval-review
```

Expected: all automated tests PASS; approval Mind Map/One Slide PASS at desktop and compact sizes; audit reports dependency 0, prohibited 0, secrets 0.

- [ ] **Step 4: Build, install, and verify the local Safari App**

Run:

```sh
npm run package:macos
npm run check:app-store
npm run install:macos
codesign --verify --deep --strict --verbose=2 '/Applications/Tab Shelf.app'
pluginkit -m -A -D -v -i com.jovaii.tabshelf.extension
```

Expected: package and generated checks PASS, strict codesign PASS, and exactly one enabled Tab Shelf extension registration.

- [ ] **Step 5: Complete real Safari acceptance with disposable tabs**

Open the installed App once, enable the single extension in Safari, execute every step in `docs/testing/local-safari-acceptance.md`, record only privacy-safe results, and do not use personal tab screenshots. Rebuild/reinstall and repeat affected steps for any failure.

- [ ] **Step 6: Generate privacy-safe product visuals and complete documentation verification**

Use the deterministic preview only. Render desktop and compact screenshots, inspect each with `view_image`, update README/social assets, then run `npm run check` again. All GitHub-visible copy remains English-only.

- [ ] **Step 7: Commit the verified release candidate**

```sh
git add README.md CHANGELOG.md PRIVACY.md SUPPORT.md CONTRIBUTING.md docs extension tests scripts package.json
git diff --cached --check
git commit -m "feat: ship smart category ordering"
```

- [ ] **Step 8: Prove source, install, docs, and commit alignment**

Run:

```sh
git status --short
git log -1 --oneline
npm run check
codesign --verify --deep --strict --verbose=2 '/Applications/Tab Shelf.app'
pluginkit -m -A -D -v -i com.jovaii.tabshelf.extension
```

Expected: clean working tree, final commit identified, full checks PASS, strict signature PASS, one registration, and the installed App matches the just-built source.

- [ ] **Step 9: Synchronize the verified commit and GitHub surfaces**

Run only after Steps 1–8 pass:

```sh
git push origin feature/independent-v1:main
gh repo edit jovaii/Tab-Shelf --description "A private, local visual workspace for organizing Safari tabs on your Mac." --add-topic safari --add-topic macos --add-topic safari-extension --add-topic tab-management --add-topic privacy
gh api repos/jovaii/Tab-Shelf --jq '{name,visibility,default_branch,description,topics}'
git ls-remote origin refs/heads/main
```

Expected: remote `main` resolves to the verified final commit; repository metadata is current; signed-out README and visuals describe only the shipped behavior. Do not create a binary GitHub Release until Developer ID signing/notarization or App Store distribution is ready.

---

## Final Acceptance Checklist

- [ ] Automatic classification is deterministic and local-only.
- [ ] Manual category and order choices survive new tabs and Safari relaunch.
- [ ] Pointer and keyboard users can perform equivalent organization.
- [ ] Dragging never changes Safari's native tab order, windows, or Tab Groups.
- [ ] Invalid storage and failed writes leave tab visibility/actions working and restore the previous layout.
- [ ] No new permission, dependency, network, identity, privacy, or licensing boundary is introduced.
- [ ] Theme import/export remains `tabShelf.preferences.v1`; workspace remains `tabShelf.workspace.v1`.
- [ ] Desktop/compact WebKit, installed Safari, signatures, and exactly one registration all pass.
- [ ] README, privacy, support, App Store drafts, testing records, Mind Map, One Slide, screenshots, and GitHub metadata match the final source commit.
- [ ] Public GitHub contains English-only verified claims and no binary consumer release.
