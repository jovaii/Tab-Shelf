# Tab Shelf Privacy Policy

Effective August 25, 2026.

Tab Shelf is a local Safari utility for organizing the tabs open on the current Mac. This policy describes the data the extension needs in order to provide that function.

## Data processed locally

Tab Shelf handles open-tab titles, URLs, favicons, appearance preferences, workspace organization, and optional user-selected backgrounds. Workspace organization includes custom category names, domain assignments, card and category order, and collapsed state. These items are processed locally on the current Mac so the shelf can organize tabs, identify duplicates, display page information, apply themes, and carry out tab actions chosen by the user.

Tab Shelf does not collect, transmit, sell, or share this data. It makes no first-party network requests and includes no advertising, analytics, telemetry, account system, or remote data service.

Websites open in Safari continue to operate under their own privacy practices. Tab Shelf does not add requests to those websites and does not fetch replacement favicons, remote fonts, images, or other runtime assets.

## Safari permission wording

Safari may warn that Tab Shelf can see browsing history on websites you visit. This is Safari's description of the extension permission used to read and manage tabs. Tab Shelf uses that permission only to display and act on tabs that are currently open, including their titles, URLs, and favicons. It does not build or transmit a browsing-history database.

## Local storage

Theme preferences and an optional user-selected background are stored in Safari's local extension storage under the validated appearance schema. Workspace organization is stored separately under `tabShelf.workspace.v1`. A selected image is resized and compressed locally before storage. Theme export creates a local `tab-shelf-preferences-v1.json` file only when the user chooses **Export theme**; workspace organization is not included in that export.

**Reset appearance** removes the active theme customization without changing workspace organization. **Reset tab layout** removes manual assignments, custom categories, saved ordering, and collapsed state without changing appearance or closing tabs. Disabling or uninstalling the extension prevents further access; Safari controls deletion of its extension storage.

## Third parties

Tab Shelf has no third-party runtime dependencies, analytics SDKs, advertising SDKs, remote fonts, stock images, or icon packs. No personal information is provided to James Li / Jovaii or another party through the product.

## Questions

For privacy questions, use the privacy-safe contact route described in [SUPPORT.md](SUPPORT.md). Do not include private URLs, browsing history, credentials, or personal screenshots in a public report.
