# Tab Shelf Support

Tab Shelf is a Safari-only utility for the current Mac. The checks below cover the most common setup and recovery cases.

Before reporting a problem, do not post private URLs, browsing history, credentials, or personal screenshots. Use disposable example tabs and redact personal details.

## Enable Tab Shelf

For the packaged App:

1. Move the intended `Tab Shelf.app` to `/Applications` and open it once.
2. Open Safari → Settings → Extensions.
3. Enable **Tab Shelf** for the current Safari profile.
4. Open a new Safari tab.

For a temporary source installation:

1. Open Safari → Settings → Advanced and enable **Show features for web developers**.
2. Open Safari → Settings → Developer and enable **Allow unsigned extensions**.
3. Select **Add Temporary Extension…** and choose the repository's `extension` folder.
4. Enable **Tab Shelf** in Safari → Settings → Extensions, then open a new tab.

Safari may clear the unsigned-extension setting after Safari fully quits.

## Resolve a duplicate extension entry

The supported installer treats duplicate registration as a hard failure. It keeps recovery Apps outside `/Applications`, unregisters controlled build copies, and accepts only one PlugInKit path: `/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex`.

If Safari still shows duplicate entries, disable every Tab Shelf entry first and quit Safari and Tab Shelf. Confirm that `/Applications/Tab Shelf.app` is the only Tab Shelf App under `/Applications`, then run `npm run install:macos` again from the source checkout. The installer prints every unexpected registered path and does not delete an unknown App automatically.

If a temporary source copy was also added, remove or leave that copy disabled before enabling the packaged App. Do not enable two entries with the same name.

## Permissions

Safari may show a browsing-history warning because Tab Shelf needs the `tabs` permission to display and manage tabs that are currently open. Tab Shelf does not build or transmit a browsing-history database. See [PRIVACY.md](PRIVACY.md) for the complete boundary.

In Safari → Settings → Extensions → Tab Shelf, confirm that the extension is enabled for the current profile. If Safari presents website-access controls, allow the access needed for the tabs you want Tab Shelf to manage.

## Restore the new-tab page

If Safari still opens its Start Page instead of the Tab Shelf new-tab page:

1. Confirm that exactly one Tab Shelf extension entry is enabled.
2. Close the affected new tab.
3. Fully quit Safari and open it again.
4. Open a fresh new tab.

If the problem remains, disable Tab Shelf, restart Safari, enable it again, and retry with a fresh tab.

## Reset appearance

Open Tab Shelf, select the round settings control or toolbar popover, and open **Theme settings**. Choose **Reset appearance** to restore Quiet Neutral. This removes the active theme customization but does not close tabs.

Before importing a theme, confirm that the file is a Tab Shelf export named `tab-shelf-preferences-v1.json`. Imports that do not match the current validated schema are rejected.

## Restore automatic categories and ordering

Tab Shelf automatically places each domain into a local category. A manual move remains assigned to the chosen category, and card and category order persist after reopening the shelf.

If the organization no longer suits you, open Theme Studio, select the **Reset** section, and choose **Reset tab layout**. This removes custom categories, manual assignments, saved ordering, and collapsed state. It does not reset Theme Studio, close Safari tabs, or change Safari's native tab order, windows, or Tab Groups.

If one domain appears in an unexpected category after a manual move, use its move menu to select another category or use **Reset tab layout** to return all domains to automatic classification.

## Uninstall

For a temporary source installation, disable Tab Shelf in Safari → Settings → Extensions or fully quit Safari.

For the packaged App:

1. Disable Tab Shelf in Safari → Settings → Extensions.
2. Quit Safari and Tab Shelf.
3. Move `/Applications/Tab Shelf.app` to Trash.

Review any source-build recovery App under `build/install-recovery/` separately before moving it to Trash. Recovery Apps are not retained beside the installed App in `/Applications`.

## Report a problem

Use the repository's structured [bug report form](https://github.com/jovaii/Tab-Shelf/issues/new?template=bug.yml). Include the macOS, Safari, and Tab Shelf versions, the install channel, reproducible steps, expected behavior, and observed behavior.

Do not submit private URLs, browsing history, credentials, or personal screenshots. Replace private page names with neutral examples and reproduce tab actions only with disposable tabs.
