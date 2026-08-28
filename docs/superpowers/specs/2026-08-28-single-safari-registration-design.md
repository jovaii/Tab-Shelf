# Single Safari Registration Design

## Problem

Safari can display multiple Tab Shelf entries when Xcode build products or timestamped application backups remain registered with Launch Services and PlugInKit. Checking only the active PlugInKit match hides disabled duplicates, so previous installation checks could report one extension while Safari displayed two or three.

## Decision

Tab Shelf will enforce a single-registration invariant across both packaging and installation:

- Xcode build products must use `REGISTER_WITH_LAUNCH_SERVICES=NO` and must be explicitly unregistered before they are copied.
- Local packages must use the single valid Apple Development identity available on the Mac, with an optional environment override for the development team. Ad-hoc signing is not an acceptable persistent local installation.
- Installer recovery copies must live under `build/install-recovery/backups/` or `build/install-recovery/failures/`, never beside the installed application in `/Applications`.
- Every moved recovery copy and every build-directory copy must be unregistered from Launch Services and PlugInKit.
- The final installer gate must inspect all PlugInKit states and accept exactly one `com.jovaii.tabshelf.extension` path: `/Applications/Tab Shelf.app/Contents/PlugIns/Tab Shelf Extension.appex`.
- Any unknown duplicate path stops the installation with the exact path in the error message. The installer does not delete unknown applications.

## Packaging Flow

The package command generates the native Xcode project in an isolated temporary directory, prepares it, and builds Release with automatic signing. It resolves a development team from `TAB_SHELF_DEVELOPMENT_TEAM` when supplied; otherwise it requires exactly one valid Apple Development identity and derives the team from its certificate. The selected team value is runtime-only and is never written into the repository.

After the build, the command unregisters the derived-data application, copies it into `build/Tab Shelf.app`, verifies the host and extension identifiers, and verifies the complete signature without replacing it with an ad-hoc signature.

## Installation Flow

The installer validates the source application before changing `/Applications`. It closes the existing host application, unregisters the previous installed extension, and moves the previous application to the project recovery directory. It copies the new application into the exact install path, verifies it, registers only the final extension, and runs the single-registration gate.

Rollback restores the previous application to `/Applications`, re-registers its extension, and keeps a failed candidate outside `/Applications`. Recovery applications remain available without being visible to Safari.

## Error Handling

- Missing or ambiguous Apple Development identities stop packaging before Xcode runs.
- Unsafe paths, symbolic links, unexpected bundle identifiers, and invalid signatures stop installation before replacement.
- A copy or validation failure triggers rollback.
- A duplicate registration after installation is a hard failure that lists every unexpected path.
- Unknown duplicate applications are never removed automatically.

## Tests

Contract tests must first fail against the current scripts, then cover:

- automatic Apple Development signing without committed personal team values;
- no ad-hoc re-signing of the packaged application;
- no build-product Launch Services registration;
- recovery locations outside `/Applications`;
- explicit unregistration of source, previous, backup, and failed copies;
- final all-state PlugInKit count and exact-path validation;
- rollback re-registration of the restored application.

The full repository test, audit, release-readiness, package-contract, and shell syntax checks must pass before the change is committed and pushed.
