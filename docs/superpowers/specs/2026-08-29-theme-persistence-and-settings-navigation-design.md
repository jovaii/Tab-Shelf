# Theme Persistence and Settings Navigation Design

## Goal

Make Storm Horizon the reliable Tab Shelf appearance on first launch and after reset, preserve every selected theme across new Safari tabs and restarts, and open Theme Studio without creating a second extension tab or triggering a persistent viewport-size label.

## Confirmed Symptoms

- Theme Studio can render Storm Horizon, but Safari reports that it could not save the theme.
- A newly opened Tab Shelf falls back to Quiet Neutral because no saved preference document can be read.
- The settings action always creates another extension tab. On the affected Mac this path is associated with a persistent `1512 X 871` viewport label.

## Selected Approach

Use a two-layer preference store. Safari `browser.storage.local` remains the primary store. A same-origin `localStorage` document is mirrored and used as a fallback when Safari storage rejects a read or write, or returns no preference document. Both stores receive the same validated, detached schema document.

Navigate between `shelf.html` and `settings.html` in the current owned extension tab. Create a new tab only when the caller is not already running in a Tab Shelf extension page. This removes the known extra-tab trigger while preserving toolbar or native-app entry points.

Set `storm-horizon` as both `DEFAULT_PREFERENCES` and the Reset Appearance target.

## Alternatives Rejected

- Retrying only `browser.storage.local`: does not provide persistence when Safari consistently rejects the operation.
- Native host messaging: adds unnecessary Swift persistence and release complexity for a small validated preference document.
- Hiding a `1512 X 871` DOM node: repository and installed-extension scans found no such node or viewport-size rendering code; the label is Safari-owned rather than Tab Shelf content.

## Data and Error Rules

- Never return unvalidated preference data from either store.
- Prefer a valid Safari storage document over the fallback document.
- If Safari storage is empty, use a valid fallback document; otherwise use Storm Horizon.
- If Safari storage contains invalid data, use a valid fallback document; otherwise report `PREFERENCE_INVALID`.
- A save succeeds when at least one store persists the validated document.
- If Safari storage succeeds, fallback mirroring is best effort and must not turn a successful save into an error.
- If Safari storage fails, fallback persistence must succeed or the gateway reports `PREFERENCE_WRITE_FAILED` without exposing private data.

## Acceptance Criteria

1. A clean installation opens with Storm Horizon.
2. Reset Appearance selects and persists Storm Horizon.
3. Selecting any preset remains selected in a newly opened Tab Shelf page.
4. Theme saving succeeds when Safari storage rejects but same-origin storage works.
5. Settings and shelf navigation reuses the current owned extension tab.
6. All automated checks pass, the signed app installs once, and Safari reports exactly one Tab Shelf extension registration.

