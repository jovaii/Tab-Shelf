# Theme Persistence and Settings Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Tab Shelf themes reliably, make Storm Horizon the default, and reuse the current extension tab for Theme Studio navigation.

**Architecture:** Keep Safari extension storage as the primary source and add an injected Web Storage-compatible fallback in the Safari gateway. Route owned extension pages through `tabs.update` when the current tab belongs to Tab Shelf, falling back to `tabs.create` for non-owned callers.

**Tech Stack:** Safari Web Extension APIs, ES modules, Web Storage API, Node.js built-in test runner, Xcode/macOS packaging scripts.

## Global Constraints

- Safari-only; add no Chrome runtime or documentation.
- Public repository text remains English-only.
- Store only validated `tabShelf.preferences.v1` documents.
- The finished install must expose exactly one Tab Shelf extension registration.

---

### Task 1: Lock the Storm Horizon default in tests

**Files:**
- Modify: `tests/preferences.test.mjs`
- Modify: `tests/settings-contract.test.mjs`
- Modify: `extension/core/preferences.mjs`
- Modify: `extension/settings.mjs`

**Interfaces:**
- Consumes: `THEME_PRESETS`, `preferencesFromPreset(id)`
- Produces: `DEFAULT_PREFERENCES` equal to the `storm-horizon` preset and reset behavior that calls `selectPreset("storm-horizon")`

- [ ] Add assertions that the default preset and reset target are `storm-horizon`.
- [ ] Run `node --test tests/preferences.test.mjs tests/settings-contract.test.mjs` and confirm failure against Quiet Neutral.
- [ ] Point `DEFAULT_PREFERENCES` and Reset Appearance at Storm Horizon.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Add resilient preference persistence

**Files:**
- Modify: `tests/safari-gateway.test.mjs`
- Modify: `extension/platform/safari-gateway.mjs`

**Interfaces:**
- Consumes: `createSafariGateway(browserApi, fallbackStorage?)`
- Produces: `getPreferences()` and `setPreferences(value)` using primary Safari storage plus a Web Storage-compatible fallback

- [ ] Add tests for Safari write rejection with successful fallback, fallback reads after empty/failed Safari reads, invalid stored data, and failure of both stores.
- [ ] Run `node --test tests/safari-gateway.test.mjs` and confirm the new fallback cases fail.
- [ ] Implement safe fallback read/write helpers that serialize through the existing preference import/export functions.
- [ ] Re-run the focused gateway tests and confirm all cases pass.

### Task 3: Reuse the current extension tab

**Files:**
- Modify: `tests/safari-gateway.test.mjs`
- Modify: `extension/platform/safari-gateway.mjs`

**Interfaces:**
- Consumes: `browserApi.tabs.getCurrent()`, `browserApi.tabs.update(id, patch)`, `browserApi.tabs.create(request)`
- Produces: `openShelf()` and `openSettings()` that navigate an owned current page or create a tab for an external caller

- [ ] Add tests proving owned pages use `tabs.update` and non-owned callers use `tabs.create`.
- [ ] Run the focused test and confirm the current implementation fails by creating new tabs.
- [ ] Replace `openOwnedPage` with current-tab-aware navigation and normalized errors.
- [ ] Re-run the gateway tests and confirm both navigation paths pass.

### Task 4: Verify, package, install, and publish

**Files:**
- Modify only generated build output through existing scripts.
- Update: `docs/RELEASE_PROGRESS.md` only if its current status becomes inaccurate.

**Interfaces:**
- Consumes: repository checks and `scripts/package-macos.sh`, `scripts/install-macos.sh`
- Produces: one installed signed `/Applications/Tab Shelf.app` and matching GitHub source

- [ ] Run `npm run check:full` if available, otherwise `npm run check`, and confirm zero failures.
- [ ] Package and install the app with existing controlled scripts.
- [ ] Verify the installed manifest, signature, and exactly one `pluginkit` registration.
- [ ] Commit the reviewed source changes and push the current branch to the public GitHub repository.

