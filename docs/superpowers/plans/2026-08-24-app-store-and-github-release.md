# App Store and GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one privacy-first Tab Shelf codebase as free Apache-2.0 source on GitHub and as the same core product through the Mac App Store for a one-time USD 9.99 purchase.

**Architecture:** Keep `extension/` as the only product core and generate the macOS Safari container through Apple's packager. Add one immutable release configuration, tracked native-host templates, and a deterministic generated-project preparation step shared by local and App Store builds. Keep all public content in Git, but gate GitHub metadata changes, Apple signing, upload, pricing, and submission behind verified external-state checks.

**Tech Stack:** Safari Web Extension Manifest V3, dependency-free ECMAScript modules and Node.js 24 tests, Swift/AppKit/SafariServices/WebKit, Bash, Xcode 26.6, GitHub Markdown and issue forms.

## Global Constraints

- Build only for Safari on the current Mac; do not add Chrome, Chromium, Firefox, iOS, or visionOS paths.
- Use only original Tab Shelf source and artwork under the James Li / Jovaii identity.
- Keep the complete source public under Apache License 2.0; do not attach a consumer App binary to GitHub releases.
- Price the Mac App Store App at USD 9.99 as a one-time upfront purchase and keep the same core feature set as the public source.
- Add no advertising, subscription, trial, in-app purchase, donation, external checkout, account, cloud sync, telemetry, analytics, crash-reporting SDK, or license server.
- Keep bundle identifiers exactly `com.jovaii.tabshelf` and `com.jovaii.tabshelf.extension`.
- Keep extension permissions limited to `tabs` and `storage`; make no first-party network request.
- Keep Apple credentials, certificates, provisioning profiles, API keys, private keys, and banking/tax data outside Git and distributable artifacts.
- Use no third-party runtime package, font, image, icon pack, or remote asset.
- Keep all public repository and App Store content English-only.
- Do not mutate GitHub or App Store Connect until the final local acceptance gate passes and an exact external-action record is approved.

## Planned File Structure

- `scripts/release-config.mjs` — immutable product, version, identifier, channel, and pricing values.
- `native/host/` — tracked source for the generated host App's Swift controller and local WebView resources.
- `scripts/prepare-macos-project.mjs` — safe, deterministic preparation of one generated Xcode project.
- `scripts/check-app-store-readiness.mjs` — source and generated-project release contract checks.
- `scripts/archive-app-store.sh` — local signed `.xcarchive` creation; no upload or account mutation.
- `PRIVACY.md`, `SUPPORT.md`, `CONTRIBUTING.md` — stable public policy and support pages.
- `.github/ISSUE_TEMPLATE/` — privacy-safe bug and feature intake.
- `docs/app-store/` — exact listing copy, review notes, and submission checklist.
- `docs/assets/` — original product screenshots and social-preview artwork only.
- `tests/` — focused release, native-host, App Store, documentation, and metadata contracts.

---

### Task 1: Establish One Release Configuration

**Estimate:** 1–2 hours

**Files:**
- Create: `scripts/release-config.mjs`
- Create: `tests/release-config.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `package.json` version and `extension/manifest.json` version.
- Produces: `RELEASE` immutable object and `validateReleaseVersions({ packageVersion, extensionVersion })` for native preparation and readiness checks.

- [ ] **Step 1: Write the failing release-configuration test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RELEASE, validateReleaseVersions } from "../scripts/release-config.mjs";

test("defines one App Store and GitHub release identity", () => {
  assert.deepEqual(RELEASE, {
    productName: "Tab Shelf",
    version: "1.0.0",
    build: "1",
    appBundleIdentifier: "com.jovaii.tabshelf",
    extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
    appStorePriceUSD: 9.99,
    appStoreURL: "",
  });
  assert.equal(Object.isFrozen(RELEASE), true);
});

test("requires package and extension versions to match the release", () => {
  const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
  const extensionManifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  assert.doesNotThrow(() => validateReleaseVersions({
    packageVersion: packageManifest.version,
    extensionVersion: extensionManifest.version,
  }));
  assert.throws(
    () => validateReleaseVersions({ packageVersion: "1.0.1", extensionVersion: "1.0.0" }),
    /Release version mismatch/u,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `node --test tests/release-config.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/release-config.mjs`.

- [ ] **Step 3: Implement the immutable configuration and validator**

```js
export const RELEASE = Object.freeze({
  productName: "Tab Shelf",
  version: "1.0.0",
  build: "1",
  appBundleIdentifier: "com.jovaii.tabshelf",
  extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
  appStorePriceUSD: 9.99,
  appStoreURL: "",
});

export function validateReleaseVersions({ packageVersion, extensionVersion }) {
  if (packageVersion !== RELEASE.version || extensionVersion !== RELEASE.version) {
    throw new Error(
      `Release version mismatch: release=${RELEASE.version} package=${packageVersion} extension=${extensionVersion}`,
    );
  }
}
```

Add `"check:release": "node scripts/check-app-store-readiness.mjs --source-only"` and `"archive:app-store": "bash scripts/archive-app-store.sh"` to `package.json` only when their scripts are introduced in Tasks 4 and 5; do not add broken commands in this task.

- [ ] **Step 4: Run the focused and full checks**

Run: `node --test tests/release-config.test.mjs && npm run check`

Expected: the focused file passes and the existing full suite/audit remains green.

- [ ] **Step 5: Commit the bounded change**

```bash
git add scripts/release-config.mjs tests/release-config.test.mjs
git commit -m "build: centralize release identity"
```

---

### Task 2: Add a Tracked, Accessible Native Host

**Estimate:** 3–5 hours

**Files:**
- Create: `native/host/ViewController.swift`
- Create: `native/host/Base.lproj/Main.html`
- Create: `native/host/Style.css`
- Create: `native/host/Script.js`
- Create: `tests/native-host-contract.test.mjs`

**Interfaces:**
- Consumes: message names `open-preferences`, `open-privacy`, `open-support`, and `open-source` from local JavaScript.
- Produces: `showExtensionState(enabled, usesSettingsName)` JavaScript function and tracked files copied by `prepareMacOSProject({ root, generatedRoot })` in Task 3.

- [ ] **Step 1: Write the failing native-host contract tests**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("native host is local, branded, and accessible", () => {
  const html = source("native/host/Base.lproj/Main.html");
  assert.match(html, /<h1>Tab Shelf<\/h1>/u);
  assert.match(html, /Your Safari tabs stay on this Mac\./u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /Open Safari Settings/u);
  assert.doesNotMatch(html, /https?:\/\//u);
  assert.match(html, /default-src 'self'/u);
});

test("native bridge exposes only approved actions", () => {
  const script = source("native/host/Script.js");
  for (const action of ["open-preferences", "open-privacy", "open-support", "open-source"]) {
    assert.match(script, new RegExp(action));
  }
  assert.match(script, /showExtensionState/u);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/iu);
});

test("Swift controller handles extension state without forced casts", () => {
  const swift = source("native/host/ViewController.swift");
  assert.match(swift, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(swift, /SFSafariExtensionManager\.getStateOfSafariExtension/u);
  assert.match(swift, /SFSafariApplication\.showPreferencesForExtension/u);
  assert.match(swift, /guard let action = message\.body as\? String/u);
  assert.doesNotMatch(swift, /as! String/u);
});
```

- [ ] **Step 2: Run the test and verify the intended failure**

Run: `node --test tests/native-host-contract.test.mjs`

Expected: FAIL with `ENOENT` for `native/host/Base.lproj/Main.html`.

- [ ] **Step 3: Create the complete local host HTML and bridge**

Use a local document with this structure and no remote resource:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="../Style.css">
  <script src="../Script.js" defer></script>
  <title>Tab Shelf</title>
</head>
<body>
  <main>
    <img class="app-icon" src="../Icon.png" width="96" height="96" alt="">
    <p class="eyebrow">BY JOVAII</p>
    <h1>Tab Shelf</h1>
    <p class="lede">A calm, visual shelf for the Safari tabs open on this Mac.</p>
    <section class="status" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <strong id="status-title">Checking Safari extension…</strong>
      <span id="status-detail">Tab Shelf will show its current Safari status here.</span>
    </section>
    <ol>
      <li>Open Safari Settings.</li>
      <li>Choose Extensions and enable Tab Shelf.</li>
      <li>Open a new Safari tab.</li>
    </ol>
    <button id="open-preferences" type="button">Open Safari Settings</button>
    <p class="privacy">Your Safari tabs stay on this Mac.</p>
    <nav aria-label="Tab Shelf information">
      <button data-action="open-privacy" type="button">Privacy</button>
      <button data-action="open-support" type="button">Support</button>
      <button data-action="open-source" type="button">Source</button>
    </nav>
    <p class="version">Version 1.0.0</p>
  </main>
</body>
</html>
```

Implement `Script.js` with one bridge and one state renderer:

```js
function post(action) {
  window.webkit.messageHandlers.controller.postMessage(action);
}

function showExtensionState(enabled, usesSettingsName) {
  const title = document.querySelector("#status-title");
  const detail = document.querySelector("#status-detail");
  document.body.dataset.extensionState = enabled === true ? "on" : enabled === false ? "off" : "unknown";
  title.textContent = enabled === true ? "Tab Shelf is enabled" : enabled === false ? "Tab Shelf needs to be enabled" : "Safari status is unavailable";
  detail.textContent = enabled === true
    ? "Open a new Safari tab to use your shelf."
    : `Enable Tab Shelf in Safari ${usesSettingsName ? "Settings" : "Preferences"} → Extensions.`;
}

document.querySelector("#open-preferences").addEventListener("click", () => post("open-preferences"));
for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => post(button.dataset.action));
}

window.showExtensionState = showExtensionState;
```

Create `Style.css` with system fonts, semantic light/dark colors, a maximum content width of `680px`, a visible `:focus-visible` outline, at least `44px` button height, no animation when `prefers-reduced-motion: reduce`, and responsive spacing below `560px`.

- [ ] **Step 4: Implement safe Swift state and link handling**

`ViewController.swift` must keep the generated IBOutlet name and use the following action routing:

```swift
import Cocoa
import SafariServices
import WebKit

private let extensionBundleIdentifier = "com.jovaii.tabshelf.extension"

final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    @IBOutlet private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        guard let page = Bundle.main.url(forResource: "Main", withExtension: "html") else { return }
        webView.loadFileURL(page, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            DispatchQueue.main.async {
                let enabled = error == nil ? state?.isEnabled : nil
                let value = enabled.map(String.init) ?? "null"
                let modern = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 13
                webView.evaluateJavaScript("showExtensionState(\(value), \(modern))")
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let action = message.body as? String else { return }
        switch action {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier)
        case "open-privacy": open("https://github.com/jovaii/Tab-Shelf/blob/main/PRIVACY.md")
        case "open-support": open("https://github.com/jovaii/Tab-Shelf/blob/main/SUPPORT.md")
        case "open-source": open("https://github.com/jovaii/Tab-Shelf")
        default: return
        }
    }

    private func open(_ value: String) {
        guard let url = URL(string: value), url.scheme == "https" else { return }
        NSWorkspace.shared.open(url)
    }
}
```

- [ ] **Step 5: Run focused tests and inspect local HTML behavior**

Run: `node --test tests/native-host-contract.test.mjs`

Expected: all native-host contract tests pass; keyboard focus remains visible and the page has no horizontal overflow at 560px.

- [ ] **Step 6: Commit the bounded change**

```bash
git add native/host tests/native-host-contract.test.mjs
git commit -m "feat: add native Tab Shelf onboarding"
```

---

### Task 3: Prepare Generated Xcode Projects Deterministically

**Estimate:** 2–4 hours

**Files:**
- Create: `scripts/prepare-macos-project.mjs`
- Create: `tests/prepare-macos-project.test.mjs`
- Modify: `scripts/package-macos.sh`
- Modify: `tests/macos-package-contract.test.mjs`

**Interfaces:**
- Consumes: `RELEASE`, one real generated `.xcodeproj`, and `native/host/`.
- Produces: `prepareMacOSProject({ root, generatedRoot })` that returns frozen paths `{ project, appTarget, extensionTarget }` after exact-count validation.

- [ ] **Step 1: Write failing transformation tests with a temporary generated-project fixture**

The fixture must contain two generated App settings, two extension settings, two host outgoing-network settings, and one generated extension identifier in Swift. Assert that preparation:

```js
assert.equal(count(preparedProject, "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf;"), 2);
assert.equal(count(preparedProject, "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf.extension;"), 2);
assert.equal(count(preparedProject, "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;"), 2);
assert.equal(count(preparedProject, "MARKETING_VERSION = 1.0.0;"), 4);
assert.equal(count(preparedProject, "CURRENT_PROJECT_VERSION = 1;"), 4);
assert.equal(count(preparedProject, "Copyright 2026 James Li / Jovaii"), 4);
assert.equal(readFileSync(copiedController, "utf8"), readFileSync("native/host/ViewController.swift", "utf8"));
```

Also assert that missing, duplicate, symbolic-link, or already-unexpected generated inputs fail without partial writes.

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `node --test tests/prepare-macos-project.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/prepare-macos-project.mjs`.

- [ ] **Step 3: Implement exact-count validation before writes**

Export these interfaces:

```js
export function replaceExact(source, before, after, expectedCount, label) {
  const actual = source.split(before).length - 1;
  if (actual !== expectedCount) throw new Error(`${label}: expected ${expectedCount}, found ${actual}`);
  return source.split(before).join(after);
}

export function prepareMacOSProject({ root = process.cwd(), generatedRoot }) {
  // Resolve every path inside root, reject symlinks, identify exactly one xcodeproj,
  // compute every transformed file in memory, then write only after all checks pass.
  // Copy ViewController.swift, Base.lproj/Main.html, Style.css, and Script.js from native/host.
  // Return Object.freeze({ project, appTarget, extensionTarget }).
}
```

Use `RELEASE` for both identifiers, `MARKETING_VERSION`, and `CURRENT_PROJECT_VERSION`. Change both host occurrences of `ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;` to `NO;`. Set the host and extension copyright build settings to `Copyright 2026 James Li / Jovaii`.

- [ ] **Step 4: Replace inline `sed` mutations in the package script**

After Apple's packager moves the generated project into `native/generated`, invoke:

```bash
node scripts/prepare-macos-project.mjs "$GENERATED_PROJECT"
```

Remove the identifier-specific `sed` blocks and their generated-value assertions. Keep the existing preflight, one-project/one-App/one-extension validation, ad-hoc local signing, legal-file copy, signature checks, and recoverable output behavior.

- [ ] **Step 5: Run focused tests and a source-only shell syntax check**

Run: `node --test tests/prepare-macos-project.test.mjs tests/macos-package-contract.test.mjs && bash -n scripts/package-macos.sh`

Expected: all focused tests pass and `bash -n` exits 0.

- [ ] **Step 6: Commit the bounded change**

```bash
git add scripts/prepare-macos-project.mjs scripts/package-macos.sh tests/prepare-macos-project.test.mjs tests/macos-package-contract.test.mjs
git commit -m "build: prepare generated Safari project safely"
```

---

### Task 4: Add App Store Readiness Checks

**Estimate:** 2–3 hours

**Files:**
- Create: `scripts/check-app-store-readiness.mjs`
- Create: `tests/app-store-readiness.test.mjs`
- Modify: `package.json`
- Modify: `scripts/audit-repository.mjs`
- Modify: `tests/audit-repository.test.mjs`

**Interfaces:**
- Consumes: `RELEASE`, package/extension manifests, tracked native templates, generated project when present, and Git tracked-file inventory.
- Produces: `checkSourceReadiness({ root })`, `checkGeneratedReadiness({ root, generatedRoot })`, and CLI modes `--source-only` or `--generated native/generated`.

- [ ] **Step 1: Write failing source and generated readiness tests**

Assert that the source check returns:

```js
assert.deepEqual(checkSourceReadiness({ root: process.cwd() }), {
  product: "Tab Shelf",
  version: "1.0.0",
  build: "1",
  dependencies: 0,
  permissions: ["storage", "tabs"],
  appStoreURLPublished: false,
});
```

Temporary fixtures must prove that the check rejects:

- version or identifier drift;
- extra manifest permissions or host permissions;
- dependency fields or vendored dependency trees;
- remote host HTML resources;
- outgoing network entitlement set to `YES`;
- missing App Sandbox, legal files, or host templates;
- tracked `.p12`, `.cer`, `.mobileprovision`, `.provisionprofile`, `.xcarchive`, `.ipa`, or App Store credential files;
- prohibited legacy names in current product files.

- [ ] **Step 2: Run focused tests and verify the intended failure**

Run: `node --test tests/app-store-readiness.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-app-store-readiness.mjs`.

- [ ] **Step 3: Implement bounded source and generated checks**

The CLI must print only one success line:

```text
PASS app_store_ready product=Tab Shelf version=1.0.0 build=1 network_entitlement=off secrets=0
```

On failure, print a specific non-secret error and exit 1. Extend the repository audit with a fixed denylist of signing/export file extensions and exact secret filename patterns; do not print secret contents.

- [ ] **Step 4: Expose stable package commands**

Add:

```json
"check:release": "node scripts/check-app-store-readiness.mjs --source-only",
"check:app-store": "node scripts/check-app-store-readiness.mjs --generated native/generated"
```

Change `check` to:

```json
"check": "npm test && npm run audit && npm run check:release"
```

- [ ] **Step 5: Run focused and full checks**

Run: `node --test tests/app-store-readiness.test.mjs tests/audit-repository.test.mjs && npm run check`

Expected: all tests and both audits pass; no network or dependency is added.

- [ ] **Step 6: Commit the bounded change**

```bash
git add scripts/check-app-store-readiness.mjs scripts/audit-repository.mjs tests/app-store-readiness.test.mjs tests/audit-repository.test.mjs package.json
git commit -m "test: enforce App Store release boundaries"
```

---

### Task 5: Create a Safe Local App Store Archive Path

**Estimate:** 2–3 hours

**Files:**
- Create: `scripts/archive-app-store.sh`
- Create: `tests/app-store-archive-contract.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a prepared `native/generated` project, `APPLE_TEAM_ID` supplied locally, and a source/readiness pass.
- Produces: `build/app-store/Tab Shelf.xcarchive`; it does not upload, export credentials, or change App Store Connect.

- [ ] **Step 1: Write a failing archive-script contract test**

```js
test("archive path signs for the enrolled team but never uploads", () => {
  const script = source("scripts/archive-app-store.sh");
  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /APPLE_TEAM_ID/u);
  assert.match(script, /npm run check:app-store/u);
  assert.match(script, /xcodebuild/u);
  assert.match(script, /-configuration Release/u);
  assert.match(script, /-destination generic\/platform=macOS/u);
  assert.match(script, /-archivePath/u);
  assert.match(script, /CODE_SIGN_STYLE=Automatic/u);
  assert.match(script, /DEVELOPMENT_TEAM="\$APPLE_TEAM_ID"/u);
  assert.doesNotMatch(script, /notarytool|altool|upload|exportArchive|rm\s+-[a-z]*r/iu);
});
```

- [ ] **Step 2: Run the test and verify the intended failure**

Run: `node --test tests/app-store-archive-contract.test.mjs`

Expected: FAIL with `ENOENT` for `scripts/archive-app-store.sh`.

- [ ] **Step 3: Implement the archive preflight and command**

The script must:

1. Require full Xcode and a single generated `.xcodeproj`.
2. Require `APPLE_TEAM_ID` to match `^[A-Z0-9]{10}$` without printing it.
3. Refuse an existing archive rather than deleting or replacing it.
4. Run `npm run check:app-store` before Xcode.
5. Run `xcodebuild -project "$XCODE_PROJECT" -scheme "Tab Shelf" -configuration Release -destination 'generic/platform=macOS' -archivePath "$ARCHIVE_PATH" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic archive`.
6. Verify the archive Info.plist and embedded App/extension identifiers.
7. Print the archive path and instruct the operator to open Xcode Organizer for validation and upload.

- [ ] **Step 4: Add the command and archive ignore rule**

Add `"archive:app-store": "bash scripts/archive-app-store.sh"` to `package.json`. Add `*.xcarchive/` and `build/app-store/` to `.gitignore`.

- [ ] **Step 5: Run tests and shell syntax checks without signing**

Run: `node --test tests/app-store-archive-contract.test.mjs && bash -n scripts/archive-app-store.sh && npm run check`

Expected: all commands pass without contacting Apple or creating an archive.

- [ ] **Step 6: Commit the bounded change**

```bash
git add scripts/archive-app-store.sh tests/app-store-archive-contract.test.mjs package.json .gitignore
git commit -m "build: add App Store archive workflow"
```

---

### Task 6: Publish English Privacy, Support, and GitHub Product Content

**Estimate:** 3–5 hours

**Files:**
- Create: `PRIVACY.md`
- Create: `SUPPORT.md`
- Create: `CONTRIBUTING.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `README.md`
- Modify: `tests/project-contract.test.mjs`

**Interfaces:**
- Consumes: approved commercial language and verified privacy boundaries.
- Produces: stable GitHub URLs used by the native host and App Store metadata.

- [ ] **Step 1: Expand the failing documentation contracts**

Require the README headings `Why Tab Shelf`, `See it in action`, `Choose your install path`, `Privacy by design`, `Build from source`, `Mac App Store`, `Support`, and `Contributing`. Assert exact public claims:

```js
assert.match(readme, /Build from source — Free/u);
assert.match(readme, /Mac App Store — USD 9\.99 one time/u);
assert.match(readme, /same core features/u);
assert.match(readme, /No ads, subscriptions, accounts, analytics, or telemetry/u);
assert.doesNotMatch(readme, /apps\.apple\.com/u);
```

Until `RELEASE.appStoreURL` is populated after publication, the README must say `Mac App Store release in preparation` and must not show a store badge or invented URL.

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `node --test tests/project-contract.test.mjs`

Expected: FAIL because the new headings and policy files are absent.

- [ ] **Step 3: Write the stable policy pages**

`PRIVACY.md` must state that Tab Shelf processes open-tab titles, URLs, favicons, preferences, and optional user-selected backgrounds locally; collects, transmits, sells, or shares none of them; makes no first-party network request; and explains Safari's browsing-history warning.

`SUPPORT.md` must provide enablement, duplicate-extension, permission, new-tab, theme reset, and uninstall steps. It must instruct reporters not to submit private URLs, browsing history, credentials, or personal screenshots.

`CONTRIBUTING.md` must require English contributions, original work compatible with Apache-2.0, no third-party runtime asset/dependency, focused tests, `npm run check`, and no secrets or personal browsing data.

- [ ] **Step 4: Restructure the README around the product decision**

Keep technical detail but move the first screen to this order:

```markdown
# Tab Shelf

> A calm, private visual shelf for the Safari tabs open on your Mac.

[Hero image: real Tab Shelf shelf interface]

## Why Tab Shelf
## See it in action
## Choose your install path
### Build from source — Free
### Mac App Store — USD 9.99 one time
## Features
## Privacy by design
## Build from source
## Mac App Store
## Support
## Contributing
## License
```

Keep App Store language honest: same core features, one-time price, Apple-reviewed installation/signing/updates, and `release in preparation` until a public listing exists.

- [ ] **Step 5: Add privacy-safe issue forms**

The bug form requires macOS version, Safari version, Tab Shelf version, install channel, reproducible steps, expected behavior, and observed behavior. Add a visible warning not to paste private URLs or browsing history. Disable blank issues and link support/privacy pages in `config.yml`.

- [ ] **Step 6: Run focused and full checks**

Run: `node --test tests/project-contract.test.mjs && npm run check`

Expected: documentation contracts and the full suite pass with no App Store URL published.

- [ ] **Step 7: Commit the bounded change**

```bash
git add README.md PRIVACY.md SUPPORT.md CONTRIBUTING.md .github tests/project-contract.test.mjs
git commit -m "docs: prepare public Tab Shelf launch"
```

---

### Task 7: Prepare App Store Listing and Review Material

**Estimate:** 2–4 hours

**Files:**
- Create: `docs/app-store/listing.md`
- Create: `docs/app-store/privacy-answers.md`
- Create: `docs/app-store/review-notes.md`
- Create: `docs/app-store/submission-checklist.md`
- Create: `tests/app-store-metadata.test.mjs`

**Interfaces:**
- Consumes: approved price, privacy policy URL, support URL, version/build, product behavior, and final screenshots from Task 8.
- Produces: exact English copy to enter into App Store Connect; it contains no credentials or account-owned bank/tax values.

- [ ] **Step 1: Write failing metadata contract tests**

```js
test("store material is exact, private, and one-time paid", () => {
  const listing = source("docs/app-store/listing.md");
  const privacy = source("docs/app-store/privacy-answers.md");
  const review = source("docs/app-store/review-notes.md");
  assert.match(listing, /Price: USD 9\.99/u);
  assert.match(listing, /Category: Productivity/u);
  assert.match(listing, /Safari/u);
  assert.match(privacy, /Data collected: None/u);
  assert.match(review, /Safari Settings → Extensions/u);
  assert.match(review, /new tab/u);
  assert.doesNotMatch(`${listing}\n${privacy}\n${review}`, /subscription|advertising|account required/iu);
});
```

- [ ] **Step 2: Run the focused test and verify the intended failure**

Run: `node --test tests/app-store-metadata.test.mjs`

Expected: FAIL with `ENOENT` for `docs/app-store/listing.md`.

- [ ] **Step 3: Write exact listing content**

Use:

- Name: `Tab Shelf`
- Subtitle: `A calm shelf for Safari tabs`
- Category: `Productivity`
- Price: `USD 9.99 one-time purchase`
- Keywords: `Safari,tabs,organizer,duplicates,new tab,privacy,productivity`
- Support URL: `https://github.com/jovaii/Tab-Shelf/blob/main/SUPPORT.md`
- Privacy URL: `https://github.com/jovaii/Tab-Shelf/blob/main/PRIVACY.md`
- Product/source URL: `https://github.com/jovaii/Tab-Shelf`

Write a concise description covering domain cards, duplicate cleanup, tab actions, five themes, custom backgrounds, local preferences, and no collection or account.

- [ ] **Step 4: Write verifiable privacy and review answers**

Record `Data collected: None` as conditional on the final binary passing the no-network/dependency audit. Explain that browsing-history permission is used only to read and manage tabs already open in Safari. Review steps must begin with enabling the extension, opening disposable tabs, opening a new tab, testing grouping/close actions, and opening Theme Studio.

- [ ] **Step 5: Write the account-owned submission checklist**

The checklist requires, without storing values: active Apple Developer membership, Paid Apps Agreement accepted, banking and tax status complete, App record and identifiers verified, USD 9.99 tier selected, archive validated, screenshots uploaded, privacy answers confirmed against the candidate, review notes entered, and manual Submit for Review approval.

- [ ] **Step 6: Run focused and full checks**

Run: `node --test tests/app-store-metadata.test.mjs && npm run check`

Expected: metadata and full checks pass; no credentials or App Store URL are introduced.

- [ ] **Step 7: Commit the bounded change**

```bash
git add docs/app-store tests/app-store-metadata.test.mjs
git commit -m "docs: prepare App Store submission copy"
```

---

### Task 8: Build Assets, Verify Locally, and Reach the Two External Gates

**Estimate:** 5–7 hours plus Apple processing and review wait time

**Files:**
- Create: `docs/assets/tab-shelf-hero.png`
- Create: `docs/assets/tab-shelf-themes.png`
- Create: `docs/assets/native-host.png`
- Create: `docs/assets/social-preview.png`
- Modify: `README.md`
- Modify: `docs/testing/local-safari-acceptance.md`
- Modify: `docs/testing/release-acceptance.md`
- Modify: `CHANGELOG.md`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: Tasks 1–7, the real local Safari extension, Xcode 26.6, and disposable test tabs.
- Produces: a verified local release commit, GitHub publication decision record, and Apple submission decision record.

- [ ] **Step 1: Run the automated baseline before generating artifacts**

Run: `npm run check`

Expected: all tests, repository audit, and source release-readiness checks pass.

- [ ] **Step 2: Generate and inspect original product visuals**

Run the local loopback preview and existing WebKit renderer, then capture:

- a desktop shelf with varied domain accents and readable multilingual titles;
- Theme Studio showing the five authored presets;
- the built native host in both extension-enabled and extension-disabled states;
- a 1280×640 social preview composed only from Tab Shelf UI, icon, and typography.

Store final images in `docs/assets/`, remove private URLs/titles from fixtures, and verify no third-party image or watermark appears. Update the README image links only after the files exist.

- [ ] **Step 3: Recreate the generated project and local App safely**

Move any existing `native/generated`, `build/xcode-derived`, `build/Tab Shelf.app`, and `dist/Tab-Shelf-1.0.0.zip` to a timestamped recovery directory outside the repository rather than deleting them. Then run:

```bash
npm run package:macos
npm run check:app-store
```

Expected: one generated project, one host App, one extension, exact identifiers, App Sandbox enabled, outgoing network disabled, legal files embedded, and ad-hoc signatures verified.

- [ ] **Step 4: Install and complete Safari acceptance with disposable tabs**

Run `npm run install:macos`, enable exactly one Tab Shelf entry, and execute the local checklist. Confirm host onboarding, new-tab replacement, domain card colors, typography, duplicate detection, activate/close actions, themes, custom background image processing, export/import, keyboard focus, reduced motion, and uninstall guidance. Record screenshots and actual results without private browsing data.

- [ ] **Step 5: Run final automated and packaged-App verification**

Run:

```bash
npm run check
npm run check:app-store
/usr/bin/codesign --verify --strict --deep 'build/Tab Shelf.app'
```

Expected: every command exits 0. Update `CHANGELOG.md`, both acceptance records, and `PROGRESS.md` to `VERIFIED-LOCAL`, including the actual test count, Xcode version, commit, and known external blockers.

- [ ] **Step 6: Commit the verified local release**

```bash
git add README.md CHANGELOG.md PROGRESS.md docs/assets docs/testing
git commit -m "release: prepare Tab Shelf 1.0.0 distribution"
```

- [ ] **Step 7: Present the GitHub publication decision record and wait for exact approval**

Present:

```text
CURRENT: verified local branch, commit, public repository state, and current repository metadata
PROPOSED: push the verified commits to jovaii/Tab-Shelf main and update description, homepage, topics, and social preview
WHY: make the approved source release discoverable and current
IMPACT: public code, documentation, images, issue forms, repository metadata, and URLs
ROLLBACK: revert the release commits and restore captured prior metadata; Git history remains visible
COST: 20–40 minutes, no service fee
```

After approval, verify `gh auth status`, owner, repository visibility, default branch, current remote commit, and absence of unexpected divergence. Push normally without force. Set the description to `A calm, private visual shelf for Safari tabs on macOS`, homepage to the verified privacy/support or product URL, and topics `safari`, `safari-extension`, `macos`, `tabs`, `productivity`, `privacy`, `new-tab-page`. Upload the prepared social preview through the currently verified GitHub Settings interface. Re-open the public repository in a signed-out browser and verify English-only content, images, links, license, and no consumer binary.

- [ ] **Step 8: Present the Apple archive/submission decision record and wait for exact approval**

Present:

```text
CURRENT: verified local candidate, Apple membership/team state, App Store Connect agreements, and App record state
PROPOSED: create an Apple Distribution archive, validate/upload it through Xcode Organizer, set the one-time USD 9.99 price, and submit version 1.0.0 for App Review
WHY: provide the approved paid, signed, automatically updated distribution channel
IMPACT: Apple account, App Store listing, pricing, uploaded build, review submission, and future customers
ROLLBACK: stop before submission, remove an unsubmitted build from selection, or withdraw the version while Apple permits; uploaded build records may remain in App Store Connect
COST: 45–90 minutes of operator work plus USD 99/year membership and Apple processing/review wait time
```

After approval, set `APPLE_TEAM_ID` locally, run `npm run archive:app-store`, validate and upload in Xcode Organizer, copy only the reviewed metadata, choose USD 9.99, and submit manually. Do not change entitlements or privacy answers to bypass a validation or review error.

- [ ] **Step 9: Publish the real App Store URL only after Apple release**

Once Apple provides a public `apps.apple.com` URL, set `RELEASE.appStoreURL`, add the official badge/link to README, rerun all checks, commit, and repeat the GitHub publication decision record for that small public update. Change `PROGRESS.md` to `FEEDBACK` only after the public listing and GitHub pages work from a signed-out browser.

---

## Final Plan Self-Review Checklist

- Every approved specification section maps to at least one task: commercial model (Tasks 1, 6, 7), shared core and build paths (Tasks 1, 3–5), native host (Task 2), privacy and permissions (Tasks 3, 4, 6), GitHub discovery (Tasks 6 and 8), App Store delivery (Tasks 5, 7, 8), QA and failure handling (Tasks 4, 5, 8), documentation/support (Tasks 6–8), and non-goals (Global Constraints).
- `RELEASE`, `validateReleaseVersions`, `prepareMacOSProject`, `checkSourceReadiness`, `checkGeneratedReadiness`, and `showExtensionState` are defined before downstream use.
- Generated Xcode files remain ignored; tracked templates and scripts are the source of truth.
- Local packaging remains ad-hoc and recoverable; App Store archive creation is separate and never uploads automatically.
- GitHub and Apple mutations remain behind action-specific approvals with impact and rollback records.
- The plan contains no unresolved placeholder, invented store URL, secret value, destructive cleanup, feature fork, or third-party runtime dependency.
