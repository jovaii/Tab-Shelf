# Tab Shelf Collaboration Rules

## Before running work

Before commands, file modifications, builds, or installation, provide the user in Chinese with:

1. A clear task breakdown and description.
2. An estimate for every step and the total duration.
3. For work exceeding two hours, the main time costs and specific ways to improve speed and efficiency.

Update the breakdown and estimate before continuing if the task scope changes materially.

## Product boundary

- Build only for Safari on the current Mac.
- Use only source, artwork, documentation, identifiers, and release history authored for Tab Shelf.
- Use no third-party runtime packages, fonts, images, or icon packs.
- Use only `tabShelf.preferences.v1`, `com.jovaii.tabshelf`, and `com.jovaii.tabshelf.extension`.
- Reject undocumented preference schemas instead of importing them.
- Do not mutate a GitHub remote until the final publication gate.
- Use full Xcode for the official native container; temporary Safari installation is acceptable during core development.
