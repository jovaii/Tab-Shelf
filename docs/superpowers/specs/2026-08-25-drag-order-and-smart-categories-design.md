# Drag Ordering and Smart Categories Design

**Product:** Tab Shelf for Safari
**Date:** 2026-08-25
**Status:** Approved interaction design; written specification awaiting final user review
**Release scope:** macOS Safari only

## Summary

Tab Shelf will organize its existing domain cards into compact category sections. The first layout is created automatically with deterministic local rules. Users can then create custom categories, move domain cards between categories, reorder cards, reorder categories, rename custom categories, collapse categories, and reset the workspace layout.

Dragging changes only the visual organization inside Tab Shelf. It never reorders Safari's native tab strip, moves a Safari tab between windows, changes a Safari Tab Group, or sends browsing information to a service.

## Goals

- Let a pointer user drag a domain card to any position within a category.
- Let a pointer user drag a domain card into another category.
- Persist each domain's user-selected category and card position on this Mac.
- Classify unassigned domains locally into useful default categories.
- Let users create, rename, order, collapse, and delete custom categories.
- Let users reorder the category sections themselves.
- Preserve equivalent keyboard access without requiring a drag gesture.
- Keep permissions limited to `tabs` and `storage`.
- Keep the product dependency-free, account-free, local-only, and Safari-only.
- Update every public document, acceptance record, product visual, App Store draft, and GitHub surface from the same verified release commit.

## Non-goals

- Reordering Safari's native tabs or windows.
- Creating or editing Safari's native Tab Groups.
- Reading page content, browsing history outside currently open tabs, or remote classification.
- AI, cloud, account, sync, telemetry, advertising, or a recommendation service.
- Allowing one domain card to appear in multiple categories.
- Including workspace organization in the existing theme export format.
- Shipping an unrestricted rule editor in this release.

## Current Product Boundary

One Tab Shelf card represents one normalized domain and can contain tabs from multiple Safari windows. The current model sorts these cards alphabetically on every refresh. The existing appearance preferences use `tabShelf.preferences.v1`; they must remain focused on appearance and keep their current import/export contract.

The new feature therefore adds a separate workspace domain and storage key instead of extending the theme preference schema.

## Recommended Layout

The page retains the existing greeting, inventory bar, footer, theme, and equal-card visual system. Between the inventory bar and footer, it renders a vertical sequence of category sections.

Each category section contains:

- a compact header with category name and visible-domain count;
- a category drag handle;
- a collapse control;
- a category action menu when actions are available;
- the existing responsive equal-card grid;
- a clear empty drop target for custom categories with no visible cards.

Empty system categories are hidden. Empty custom categories remain visible so a user can drag cards into them. Collapsed categories keep their header visible and accept card drops on the header.

The inventory bar gains a **New category** action. Theme Studio gains a **Reset workspace layout** action, separated from **Reset appearance** so neither reset has an unexpected effect on the other domain.

## Default System Categories

The initial ordered taxonomy is:

1. **AI & Research**
2. **Work & Productivity**
3. **Communication**
4. **Learning**
5. **Shopping**
6. **News & Media**
7. **Finance**
8. **Travel**
9. **Utilities**
10. **Other**

`Other` remains last in the default order. Users may reorder all populated system and custom sections.

## Local Classification Rules

Classification uses only the normalized domain and the titles already exposed for currently open tabs. It does not inspect page markup, URL query values, page text, cookies, or remote data.

The classifier follows a deterministic priority:

1. A validated permanent user assignment wins.
2. An exact or suffix domain rule is evaluated.
3. Bounded, case-insensitive domain and title tokens contribute to category scores.
4. The highest score wins; a fixed category priority resolves a tie.
5. A domain with no admitted match goes to **Other**.

Rules are authored in source, English-only, reviewable, dependency-free, and covered by fixtures. They must not attempt sensitive inference about the user. They classify the visible tool or site, not the person visiting it.

Reclassification is allowed when a domain has no user override and its available metadata changes. A manual move always creates or replaces a permanent assignment and prevents later automatic movement.

## User Customization Rules

- A custom category name contains 1–40 visible characters after whitespace normalization.
- Names are compared case-insensitively and must be unique among custom categories.
- At most 24 custom categories may exist.
- A custom category is appended immediately before **Other** on creation.
- A custom category can be renamed, reordered, collapsed, expanded, or deleted.
- System categories can be reordered, collapsed, or expanded, but cannot be renamed or deleted.
- Deleting a custom category removes its domain assignments. Its cards immediately return to their automatic system categories.
- Moving a domain card into any system or custom category creates a permanent assignment to that category.
- A new domain with no stored order is appended to the end of its resolved category.
- A domain that closes completely remains in stored ordering and assignment data so its position returns later.
- **Reset workspace layout** removes custom categories, assignments, manual category order, card order, and collapse state, then rebuilds the current view from automatic rules.

## Pointer Drag Interaction

The feature uses a local Pointer Events controller rather than native HTML drag-and-drop or a third-party package.

Each domain card header contains a dedicated move-handle button. Category headers contain a separate category move handle. Ordinary card controls, tab titles, and close actions never start a drag.

The pointer state machine is:

1. A primary pointer presses a move handle.
2. The controller records the source and captures the pointer.
3. Movement must exceed a six-pixel threshold before dragging begins.
4. The source becomes visually lifted and a dimension-matched placeholder preserves layout.
5. Candidate category and insertion position are calculated from current element rectangles.
6. Movement is updated at most once per animation frame.
7. Near a viewport edge, bounded document auto-scroll keeps the destination reachable.
8. Pointer release commits one pure reorder operation and saves the resulting workspace.
9. `Escape`, pointer cancellation, loss of the source card, or an invalid target restores the pre-drag layout.

A same-category drop changes only card order. A cross-category drop also records a permanent domain assignment. A drop on a collapsed category appends the card to that category without expanding it.

Dragging a category changes only category order. Category dragging cannot start from its collapse button or action menu.

## Keyboard and Assistive Interaction

Move handles are focusable buttons with specific accessible names such as `Move linkedin.com` and `Move Work & Productivity`.

Activating a card move handle with the keyboard opens a local action menu with:

- **Move before**
- **Move after**
- **Move to category**

The destination submenu lists every system and custom category plus **New category…**. Category move handles offer **Move up** and **Move down**. These actions invoke the same pure reorder operations used by pointer dragging.

The page announces committed moves through the existing status region. Focus returns to the moved card or category after rendering. A move is never communicated by color alone.

When `prefers-reduced-motion: reduce` is active, lift, placeholder, section movement, and auto-scroll animations are disabled or reduced to immediate state changes.

## Workspace Storage Contract

The feature adds:

```js
export const WORKSPACE_KEY = "tabShelf.workspace.v1";
```

The stored value has this conceptual shape:

```json
{
  "schema": "tabShelf.workspace.v1",
  "revision": 1,
  "groupOrder": ["system:ai-research", "custom:example", "system:other"],
  "collapsedGroupIds": ["system:news-media"],
  "customGroups": [
    { "id": "custom:example", "name": "Recruiting" }
  ],
  "assignments": [
    { "domain": "linkedin.com", "groupId": "custom:example" }
  ],
  "cardOrders": [
    { "groupId": "custom:example", "domains": ["linkedin.com"] }
  ]
}
```

Arrays are used instead of domain-keyed objects so untrusted domain strings never become object properties. Validation must:

- reject unknown keys, unsafe prototypes, duplicate IDs, duplicate domains, and conflicting assignments;
- admit only known system IDs and validated custom IDs;
- normalize and bound names and domains;
- limit stored domain records to 2,048;
- limit each order array and the aggregate serialized size;
- return detached, deeply frozen data;
- avoid leaking invalid stored values into an error message.

The workspace is not included in `tab-shelf-preferences-v1.json`. A later release may add a separately named workspace export only after a new specification.

## Component Boundaries

### `extension/core/workspace.mjs`

Owns the workspace schema, defaults, validation, cloning, group definitions, deterministic merge of visible domains with stored order, and reset behavior. It has no DOM or Safari dependency.

### `extension/core/classifier.mjs`

Owns admitted domain rules, keyword scoring, deterministic tie-breaking, and the fixed system taxonomy. It receives normalized domain records and returns a system group ID.

### `extension/core/workspace-actions.mjs`

Owns pure operations for card reorder, cross-category move, category reorder, create, rename, collapse, expand, delete, and reset. Every successful operation returns a new validated workspace without mutating input.

### `extension/ui/sortable-controller.mjs`

Owns pointer capture, threshold detection, geometry, placeholder state, auto-scroll, cancellation, and keyboard move-menu coordination. It emits typed intents and never writes storage directly.

### `extension/ui/shelf-view.mjs`

Renders category sections, existing cards, handles, menus, placeholders, and empty custom-category targets. It continues to use safe DOM construction and never injects HTML strings.

### `extension/platform/safari-gateway.mjs`

Adds validated `getWorkspace()` and `setWorkspace()` methods over existing local extension storage. No permission is added. Optional storage change events keep multiple open shelf pages consistent.

### `extension/shelf.mjs`

Loads tabs, appearance preferences, and workspace in parallel; builds the domain model; resolves automatic and manual categories; renders; executes typed workspace actions; persists; and restores state on failure.

## Data Flow

1. Query current Safari tabs and current shelf tab.
2. Read appearance preferences and workspace storage.
3. Build the existing one-card-per-domain tab model.
4. Apply permanent assignments or local automatic classification.
5. Merge visible cards into saved category and card order.
6. Render category sections and cards.
7. Convert a pointer or keyboard move into a typed pure action.
8. Re-read the latest workspace before committing the action.
9. Validate and save the new workspace.
10. Render the committed result and announce it.

Tab create, update, and remove events continue to trigger a bounded refresh. If a refresh arrives during an active drag, it is deferred until commit or cancellation. Storage changes from another shelf page trigger a refresh after the current local action completes.

## Error Handling and Consistency

- If workspace storage is absent, use the default automatic layout.
- If stored workspace data is invalid, use the safe default layout and show `Saved workspace layout could not be loaded.` Appearance and tab actions remain available.
- If a save fails, restore the pre-action workspace and DOM order, retain focus, and show `Workspace layout could not be saved.`
- If the dragged domain disappears, cancel without saving.
- If a destination category disappears, cancel without saving.
- If another shelf page writes first, re-read the latest value and apply the local typed action to that value before saving.
- If category creation or rename is invalid, preserve the editor value and present a bounded local validation message.
- No error includes a full URL, title, browsing data, imported payload, or raw stored value.

## Responsive and Visual Behavior

- Category sections are vertical at all supported widths.
- Their card grid reuses the existing responsive equal-card columns.
- A placeholder has the exact current card dimensions and does not cause masonry behavior.
- The active drop target uses border, surface, and label changes, not color alone.
- At narrow widths, card movement is primarily vertical and the move menu remains fully usable.
- Existing domain-specific card accents remain decorative and independent from category state.
- Product visuals must use representative synthetic tabs and domains only.

## Privacy and Security

- No first-party network request is added.
- No host permission is added.
- No page body, form value, cookie, history database, or remote classification input is used.
- Domain assignments, custom category names, collapse state, and ordering stay in Safari local extension storage on this Mac.
- Custom names are inserted with safe text APIs only.
- The repository keeps zero runtime dependencies and no vendored drag library.
- Repository and release audits continue to reject credentials, prohibited legacy terms, unexpected resources, and unauthorized networking.

## Documentation and GitHub Synchronization Matrix

The implementation is not complete until all applicable surfaces describe the same verified behavior in English:

| Surface | Required update |
| --- | --- |
| `README.md` | Feature summary, automatic categories, drag instructions, custom categories, reset behavior, privacy boundary, and screenshot |
| `CHANGELOG.md` | User-visible feature and storage-schema addition |
| `PRIVACY.md` | Local processing and storage of category names, domain assignments, order, and collapse state |
| `SUPPORT.md` | Drag troubleshooting, keyboard alternative, reset layout, invalid workspace recovery, and Safari enablement |
| `CONTRIBUTING.md` | New focused test commands and module boundaries if contributor guidance changes |
| `docs/testing/local-safari-acceptance.md` | Real pointer drag, cross-category move, relaunch persistence, keyboard menu, reset, and multi-shelf consistency |
| `docs/testing/release-acceptance.md` | Automated and real Safari evidence for the new workspace feature |
| `docs/app-store/*` | Description, keywords where appropriate, review notes, privacy answers, and screenshot plan without claiming an unsubmitted listing |
| `docs/assets/*` | Updated privacy-safe hero/category visual and social preview when materially changed |
| GitHub repository | One verified source commit, English README, current visuals, topics/description/social preview, and no binary consumer release |

GitHub mutation occurs only after the source, generated project, installed App, Safari workflow, documentation, screenshots, and final commit all pass. The public repository must not describe the feature as available before the matching source is pushed.

## Test Strategy

### Unit and domain tests

- Classifier exact-domain, suffix, keyword, tie, unknown, and privacy-boundary fixtures.
- Workspace schema happy path, unknown keys, unsafe prototype, duplicates, bounds, and detached output.
- Stable automatic order and stored manual order merge.
- Same-category reorder and cross-category assignment.
- Permanent override after metadata changes.
- Category create, rename, reorder, collapse, delete, and reset.
- Deleting a custom category returns cards to automatic categories.
- New and dormant domains preserve defined ordering behavior.
- Every failed action leaves its input unchanged.

### UI contract tests

- Semantic section headings, counts, move handles, menus, and empty custom targets.
- Drag starts only from a handle and only after the threshold.
- Placeholder location, target calculation, cancellation, deferred refresh, and storage failure restoration.
- Keyboard move actions use the same typed workspace operations.
- Focus restoration, live announcement, reduced motion, and no HTML injection.

### Visual and responsive tests

- Local WebKit rendering at 1440 × 900 and 900 × 900.
- Multiple populated categories, one-card categories, empty custom category, collapsed category, active drag, and keyboard menu.
- Existing five themes, contrast modes, custom backgrounds, and multilingual titles.

### Real Safari acceptance

Use disposable tabs only and verify:

- automatic categories;
- same-category drag reorder;
- cross-category drag and permanent override;
- custom category creation, rename, collapse, order, and deletion fallback;
- new-tab and relaunch persistence;
- keyboard move controls;
- concurrent open shelf pages;
- tab close/activate actions after movement;
- workspace reset;
- appearance settings remain unchanged;
- exactly one extension registration, strict signatures, and no new permission.

### Release verification

- Full dependency-free test suite.
- Repository independence/privacy audit.
- Source and generated App Store readiness.
- macOS package, embedded legal files, signatures, installation, and single registration.
- Updated product visuals and independent review.
- English-only documentation and GitHub signed-out verification after push.

## Delivery Sequence and Estimate

1. Workspace schema, classifier, and pure actions: 60–90 minutes.
2. Category rendering and keyboard actions: 45–70 minutes.
3. Pointer drag controller and responsive styling: 60–90 minutes.
4. Gateway integration, persistence, refresh coordination, and reset: 40–60 minutes.
5. Automated tests, visual QA, Safari build/install, documentation, and GitHub synchronization: 60–90 minutes.

Expected implementation time is approximately 4–6 hours. The main cost is the pointer state machine, cross-category persistence, refresh consistency, accessibility, and real Safari verification. A single typed action layer and one shared sortable controller prevent duplicate card/group implementations and keep the work within this estimate.

## Acceptance Decision

The feature is accepted only when:

- automatic local classification behaves deterministically;
- pointer and keyboard users can achieve the same card and category organization;
- manual assignments and ordering survive new tabs and relaunch;
- invalid or failed storage never breaks tab visibility or existing tab actions;
- no Safari native tab order changes;
- no permission, dependency, network, privacy, identity, or licensing boundary expands;
- all linked English documents and visuals match the shipped behavior;
- the installed Safari build and GitHub source resolve to the same verified release commit.
