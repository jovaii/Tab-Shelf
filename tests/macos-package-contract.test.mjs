import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

test("official package flow requires full Xcode and Apple's Safari packager", () => {
  const script = source("scripts/package-macos.sh");

  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /\/Applications\/Xcode\.app\/Contents\/Developer/u);
  assert.match(script, /Full Xcode is required/u);
  assert.match(script, /xcrun safari-web-extension-packager/u);
  assert.match(script, /--project-location "?native\/generated"?/u);
  assert.match(script, /--app-name "Tab Shelf"/u);
  assert.match(script, /--bundle-identifier com\.jovaii\.tabshelf/u);
  for (const flag of ["--macos-only", "--swift", "--copy-resources", "--no-open", "--no-prompt"]) {
    assert.match(script, new RegExp(flag));
  }
  assert.doesNotMatch(script, /safari-extension-converter|npm|npx|globalThis\.chrome/iu);
  assert.doesNotMatch(script, /rm\s+-[a-z]*r|git\s+clean/iu);
});

test("package validates one project, one app, exact identifiers, signing, and legal files", () => {
  const script = source("scripts/package-macos.sh");

  assert.match(script, /xcodebuild/u);
  assert.match(script, /native\/generated/u);
  assert.match(script, /build\/xcode-derived/u);
  assert.match(script, /build\/Tab Shelf\.app/u);
  assert.match(script, /dist\/Tab-Shelf-1\.0\.0\.zip/u);
  assert.match(script, /CFBundleIdentifier/u);
  assert.match(script, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(script, /codesign --force --sign -/u);
  assert.match(script, /codesign --verify --strict/u);
  assert.match(script, /ditto -c -k --sequesterRsrc --keepParent/u);
  for (const legalFile of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    assert.match(script, new RegExp(legalFile.replace(".", "\\.")));
  }
});

test("installer uses one exact target and a recoverable sibling backup", () => {
  const script = source("scripts/install-macos.sh");

  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /SOURCE_APP=.*build\/Tab Shelf\.app/u);
  assert.match(script, /INSTALL_TARGET="\/Applications\/Tab Shelf\.app"/u);
  assert.match(script, /\[ -L "\$INSTALL_TARGET" \]/u);
  assert.match(script, /Tab Shelf\.app\.backup-/u);
  assert.match(script, /Tab Shelf\.app\.failed-/u);
  assert.match(script, /trap rollback EXIT/u);
  assert.match(script, /mv "\$BACKUP_TARGET" "\$INSTALL_TARGET"/u);
  assert.match(script, /com\.jovaii\.tabshelf/u);
  assert.match(script, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(script, /codesign --verify --strict/u);
  assert.match(script, /open "\$INSTALL_TARGET"/u);
  assert.doesNotMatch(script, /rm\s+-[a-z]*r|git\s+clean/iu);
});

test("third-party notice accurately records a dependency-free package", () => {
  const notice = source("THIRD_PARTY_NOTICES.md");

  assert.match(notice, /^# Third-Party Notices/mu);
  assert.match(notice, /no third-party runtime packages, fonts, images, or icon packs/iu);
  assert.doesNotMatch(notice, /https?:\/\//iu);
});
