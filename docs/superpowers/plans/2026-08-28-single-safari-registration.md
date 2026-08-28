# Single Safari Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every local Tab Shelf update produce one persistent Apple Development-signed application and exactly one Safari extension registration.

**Architecture:** Packaging resolves a runtime-only Personal Team, disables build-product registration, and preserves the Xcode signature. Installation moves recovery copies outside `/Applications`, unregisters every controlled non-final path, registers only the final application, and treats any all-state PlugInKit duplicate as a rollback-triggering error.

**Tech Stack:** Bash, Xcode 26.6, `xcodebuild`, macOS `security`, `codesign`, Launch Services `lsregister`, PlugInKit, Node.js test runner.

## Global Constraints

- Never commit a personal Apple Team ID or Apple Account email.
- Keep the public repository and documentation English-only.
- Keep `/Applications/Tab Shelf.app` as the only application location visible to Safari.
- Do not delete unknown applications when a duplicate path is discovered.
- Preserve recoverable rollback behavior outside `/Applications`.
- Require fresh full verification before commit or GitHub synchronization.

---

### Task 1: Persistent Apple Development Packaging

**Files:**
- Modify: `tests/macos-package-contract.test.mjs`
- Modify: `scripts/package-macos.sh`

**Interfaces:**
- Consumes: optional `TAB_SHELF_DEVELOPMENT_TEAM` with a ten-character uppercase alphanumeric Team ID.
- Produces: `build/Tab Shelf.app`, signed by the single valid Apple Development identity and never registered from derived data.

- [ ] **Step 1: Write failing package contract tests**

Replace the ad-hoc expectations with assertions that require runtime team resolution and automatic signing:

```js
test("package uses one Apple Development team without committing personal identity", () => {
  const script = source("scripts/package-macos.sh");

  assert.match(script, /TAB_SHELF_DEVELOPMENT_TEAM/u);
  assert.match(script, /security find-identity -v -p codesigning/u);
  assert.match(script, /security find-certificate -c 'Apple Development'/u);
  assert.match(script, /openssl x509 -noout -subject -nameopt RFC2253/u);
  assert.match(script, /-allowProvisioningUpdates/u);
  assert.match(script, /DEVELOPMENT_TEAM="\$DEVELOPMENT_TEAM"/u);
  assert.match(script, /CODE_SIGN_STYLE=Automatic/u);
  assert.doesNotMatch(script, /CODE_SIGN_IDENTITY=-/u);
  assert.doesNotMatch(script, /codesign --force --sign -/u);
  assert.doesNotMatch(script, /DEVELOPMENT_TEAM="[A-Z0-9]{10}"/u);
  assert.doesNotMatch(script, /Apple Development:[^"\n]*@/iu);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/macos-package-contract.test.mjs`

Expected: FAIL because the current script contains `CODE_SIGN_IDENTITY=-` and ad-hoc re-signing, and does not resolve a development team.

- [ ] **Step 3: Implement runtime team resolution**

Add these functions to `scripts/package-macos.sh`:

```bash
resolve_development_team() {
  local identity_count certificate_subject detected_team
  if [ -n "${TAB_SHELF_DEVELOPMENT_TEAM:-}" ]; then
    detected_team="$TAB_SHELF_DEVELOPMENT_TEAM"
  else
    identity_count="$(/usr/bin/security find-identity -v -p codesigning \
      | awk '/"Apple Development:/ { count += 1 } END { print count + 0 }')"
    [ "$identity_count" -eq 1 ] \
      || fail "Expected exactly one valid Apple Development identity; found $identity_count. Set TAB_SHELF_DEVELOPMENT_TEAM after resolving the identities in Xcode."
    certificate_subject="$(/usr/bin/security find-certificate -c 'Apple Development' -p \
      | /usr/bin/openssl x509 -noout -subject -nameopt RFC2253)"
    detected_team="$(printf '%s\n' "$certificate_subject" \
      | sed -n 's/^subject=.*OU=\([^,]*\).*$/\1/p')"
  fi
  [[ "$detected_team" =~ ^[A-Z0-9]{10}$ ]] \
    || fail "The Apple Development Team ID is missing or invalid."
  printf '%s\n' "$detected_team"
}
```

Resolve `DEVELOPMENT_TEAM="$(resolve_development_team)"` before `xcodebuild`. Add `-allowProvisioningUpdates`, `DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"`, and `CODE_SIGN_STYLE=Automatic`; keep `REGISTER_WITH_LAUNCH_SERVICES=NO`; remove `CODE_SIGN_IDENTITY=-` and the final ad-hoc `codesign --force --sign -` command. Preserve strict nested and deep verification.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node --test tests/macos-package-contract.test.mjs`

Expected: all package contract tests PASS.

- [ ] **Step 5: Run shell syntax validation**

Run: `bash -n scripts/package-macos.sh`

Expected: exit 0 with no output.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/package-macos.sh tests/macos-package-contract.test.mjs
git commit -m "fix: preserve persistent local signing"
```

---

### Task 2: Single-Registration Transactional Installer

**Files:**
- Modify: `tests/macos-package-contract.test.mjs`
- Modify: `scripts/install-macos.sh`

**Interfaces:**
- Consumes: signed `build/Tab Shelf.app` with host identifier `com.jovaii.tabshelf` and extension identifier `com.jovaii.tabshelf.extension`.
- Produces: `/Applications/Tab Shelf.app`, recovery copies under `build/install-recovery/backups/` or `build/install-recovery/failures/`, and one all-state PlugInKit path.

- [ ] **Step 1: Write failing installer contract tests**

Replace the sibling-backup test with the following requirements:

```js
test("installer keeps recovery apps outside Applications and enforces one registration", () => {
  const script = source("scripts/install-macos.sh");

  assert.match(script, /RECOVERY_ROOT="\$PROJECT_ROOT\/build\/install-recovery"/u);
  assert.match(script, /BACKUP_ROOT="\$RECOVERY_ROOT\/backups"/u);
  assert.match(script, /FAILED_ROOT="\$RECOVERY_ROOT\/failures"/u);
  assert.doesNotMatch(script, /\/Applications\/Tab Shelf\.app\.(?:backup|failed)-/u);
  assert.match(script, /"\$PLUGINKIT" -r/u);
  assert.match(script, /"\$LSREGISTER" -u/u);
  assert.match(script, /"\$PLUGINKIT" -mDvvv -i "\$EXTENSION_IDENTIFIER"/u);
  assert.match(script, /Expected exactly one registered Safari extension/u);
  assert.match(script, /EXPECTED_EXTENSION_PATH/u);
  assert.match(script, /register_app "\$INSTALL_TARGET"/u);
  assert.match(script, /verify_single_registration/u);
  assert.match(script, /trap rollback EXIT/u);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/macos-package-contract.test.mjs`

Expected: FAIL because recovery paths currently sit beside the installed app and the installer has no all-state registration gate.

- [ ] **Step 3: Add controlled registration helpers**

Add constants for `LSREGISTER`, `PLUGINKIT`, `RECOVERY_ROOT`, `BACKUP_ROOT`, `FAILED_ROOT`, and `EXPECTED_EXTENSION_PATH`. Add helpers with these behaviors:

```bash
unregister_app() {
  local app_path="$1" extension_path
  [ -d "$app_path" ] || return 0
  [ ! -L "$app_path" ] || fail "Refusing to unregister a symbolic-link App path: $app_path."
  extension_path="$app_path/Contents/PlugIns/Tab Shelf Extension.appex"
  if [ -d "$extension_path" ] && [ ! -L "$extension_path" ]; then
    "$PLUGINKIT" -r "$extension_path" >/dev/null 2>&1 || true
  fi
  "$LSREGISTER" -u "$app_path" >/dev/null 2>&1 || true
}

register_app() {
  local app_path="$1" extension_path
  extension_path="$(single_extension "$app_path")"
  "$LSREGISTER" -f -R -trusted "$app_path"
  "$PLUGINKIT" -a "$extension_path"
  "$PLUGINKIT" -e use -i "$EXTENSION_IDENTIFIER"
}

verify_single_registration() {
  local registration_output registration_paths registration_count
  registration_output="$("$PLUGINKIT" -mDvvv -i "$EXTENSION_IDENTIFIER")"
  registration_paths="$(printf '%s\n' "$registration_output" \
    | sed -n 's/^[[:space:]]*Path = //p')"
  registration_count="$(printf '%s\n' "$registration_paths" | count_paths)"
  if [ "$registration_count" -ne 1 ]; then
    printf '%s\n' "$registration_paths" >&2
    fail "Expected exactly one registered Safari extension; found $registration_count."
  fi
  [ "$registration_paths" = "$EXPECTED_EXTENSION_PATH" ] \
    || fail "The registered Safari extension is not the installed Tab Shelf extension: $registration_paths"
}
```

- [ ] **Step 4: Move recovery paths and integrate rollback**

Create validated, non-symbolic-link recovery directories under `build/install-recovery`. Before moving the previous install, call `unregister_app "$INSTALL_TARGET"`. Move it to `BACKUP_TARGET` under `BACKUP_ROOT`. On rollback, unregister the failed installed candidate, move it to `FAILED_TARGET`, restore the backup, verify it, and call `register_app "$INSTALL_TARGET"`.

After copying and verifying the new candidate, call:

```bash
unregister_app "$SOURCE_APP"
register_app "$INSTALL_TARGET"
verify_single_registration
```

Set `INSTALL_COMPLETE=1` only after the registration gate passes.

- [ ] **Step 5: Run the targeted test and verify GREEN**

Run: `node --test tests/macos-package-contract.test.mjs`

Expected: all package and installer contract tests PASS.

- [ ] **Step 6: Run shell syntax validation**

Run: `bash -n scripts/install-macos.sh`

Expected: exit 0 with no output.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/install-macos.sh tests/macos-package-contract.test.mjs
git commit -m "fix: enforce one Safari registration"
```

---

### Task 3: Documentation, Full Verification, and GitHub Sync

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/local-safari-acceptance.md`
- Modify: `docs/testing/release-acceptance.md`
- Modify: `tests/project-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 packaging and Task 2 installation behavior.
- Produces: current English setup, recovery, and local-signing guidance.

- [ ] **Step 1: Write failing documentation assertions**

Change `tests/project-contract.test.mjs` to require the current local acceptance document to contain `Apple Development`, `Personal Team`, and `exactly one`, and to reject claims that the current persistent local build remains ad-hoc signed.

- [ ] **Step 2: Run documentation contracts and verify RED**

Run: `node --test tests/project-contract.test.mjs`

Expected: FAIL because the current acceptance documents still describe an ad-hoc local build.

- [ ] **Step 3: Update English documentation**

Update `README.md` so recovery copies are documented under `build/install-recovery/`, never as `/Applications` siblings. Update both acceptance documents to distinguish the Apple Development-signed Personal Team local build from the future App Store distribution archive. State that free Personal Team provisioning is temporary and that App Store distribution still waits for paid membership activation.

- [ ] **Step 4: Run documentation contracts and verify GREEN**

Run: `node --test tests/project-contract.test.mjs`

Expected: all project contract tests PASS.

- [ ] **Step 5: Run complete verification**

Run:

```bash
bash -n scripts/package-macos.sh
bash -n scripts/install-macos.sh
npm test
npm run audit
npm run check:release
git diff --check
```

Expected: shell syntax exits 0; all tests pass with zero failures; audit and release readiness pass; diff check is clean.

- [ ] **Step 6: Verify the live Mac invariant**

Run:

```bash
find /Applications -maxdepth 1 -name 'Tab Shelf*.app*' -print
pluginkit -mDvvv -i com.jovaii.tabshelf.extension
codesign --verify --deep --strict --verbose=2 '/Applications/Tab Shelf.app'
```

Expected: one application path, one PlugInKit path under the installed application, and a valid complete signature.

- [ ] **Step 7: Commit and synchronize**

```bash
git add README.md SUPPORT.md docs/testing/local-safari-acceptance.md docs/testing/release-acceptance.md docs/superpowers/plans/2026-08-28-single-safari-registration.md tests/project-contract.test.mjs
git commit -m "docs: record persistent local installation"
git push origin HEAD:main
```

Expected: the remote `main` branch points to the final verified commit.
