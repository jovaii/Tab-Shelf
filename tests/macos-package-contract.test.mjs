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
  assert.doesNotMatch(script, /safari-web-extension-packager --help/u);
  assert.match(script, /mktemp -d \/private\/tmp\/tab-shelf-package\.XXXXXX/u);
  assert.match(script, /safari-web-extension-packager "\$PROJECT_ROOT\/extension"/u);
  assert.match(script, /--project-location "\$PACKAGER_ROOT"/u);
  assert.match(script, /mv "\$PACKAGER_ROOT" "\$GENERATED_PROJECT"/u);
  assert.match(script, /--app-name "Tab Shelf"/u);
  assert.match(script, /--bundle-identifier com\.jovaii\.tabshelf/u);
  for (const flag of ["--macos-only", "--swift", "--copy-resources", "--no-open", "--no-prompt"]) {
    assert.match(script, new RegExp(flag));
  }
  assert.doesNotMatch(script, /safari-extension-converter|npm|npx|globalThis\.chrome/iu);
  assert.doesNotMatch(script, /rm\s+-[a-z]*r|git\s+clean/iu);
});

test("package validates one project, one app, final identifiers, signing, and legal files", () => {
  const script = source("scripts/package-macos.sh");
  const preparation = source("scripts/prepare-macos-project.mjs");

  assert.match(script, /xcodebuild/u);
  assert.match(script, /-scheme "Tab Shelf"/u);
  assert.match(script, /native\/generated/u);
  assert.match(script, /build\/xcode-derived/u);
  assert.match(script, /build\/Tab Shelf\.app/u);
  assert.match(script, /dist\/Tab-Shelf-1\.0\.0\.zip/u);
  assert.match(script, /CFBundleIdentifier/u);
  assert.match(script, /com\.jovaii\.tabshelf\.extension/u);
  assert.doesNotMatch(script, /codesign --force --sign -/u);
  assert.match(script, /codesign --verify --strict/u);
  assert.match(script, /ditto -c -k --sequesterRsrc --keepParent/u);
  for (const legalFile of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
    assert.match(preparation, new RegExp(legalFile.replace(".", "\\.")));
    assert.doesNotMatch(script, new RegExp(`ditto "${legalFile.replace(".", "\\.")}"`));
  }
  assert.doesNotMatch(script, /LEGAL_DIRECTORY/u);
});

test("package uses one Apple Development team without committing personal identity", () => {
  const script = source("scripts/package-macos.sh");

  assert.doesNotMatch(script, /CODE_SIGNING_ALLOWED=NO/u);
  assert.match(script, /CODE_SIGNING_ALLOWED=YES/u);
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

test("package removes every controlled build registration before reporting success", () => {
  const script = source("scripts/package-macos.sh");

  assert.match(script, /REGISTER_WITH_LAUNCH_SERVICES=NO/u);
  assert.match(script, /PLUGINKIT="\/usr\/bin\/pluginkit"/u);
  assert.match(script, /LSREGISTER=.*LaunchServices.*lsregister/u);
  assert.match(script, /unregister_build_app/u);
  assert.match(script, /"\$PLUGINKIT" -r "\$extension_path"/u);
  assert.match(
    script,
    /"\$LSREGISTER" -u "\$app_path"/u,
  );
  assert.match(script, /trap cleanup_build_registrations EXIT/u);
  assert.match(script, /"\$PLUGINKIT" -mDvvv -i "\$EXTENSION_IDENTIFIER"/u);
  assert.match(script, /verify_no_build_registrations/u);
  assert.ok(
    script.lastIndexOf("verify_no_build_registrations")
      < script.indexOf("printf 'Tab Shelf package created:"),
  );
});

test("package prepares the generated project before building without inline mutations", () => {
  const script = source("scripts/package-macos.sh");
  const preparation = 'node scripts/prepare-macos-project.mjs "$GENERATED_PROJECT"';

  assert.match(script, /node scripts\/prepare-macos-project\.mjs "\$GENERATED_PROJECT"/u);
  assert.ok(script.indexOf(preparation) > script.indexOf('mv "$PACKAGER_ROOT" "$GENERATED_PROJECT"'));
  assert.ok(script.indexOf(preparation) < script.indexOf("xcrun xcodebuild"));
  assert.doesNotMatch(script, /sed -i|GENERATED_(?:OUTER|EXTENSION)_SETTING/iu);
  assert.doesNotMatch(script, /com\.jovaii\.Tab-Shelf|com\.jovaii\.tabshelf\.Extension/u);
});

test("installer keeps recovery apps outside Applications and enforces one registration", () => {
  const script = source("scripts/install-macos.sh");

  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /SOURCE_APP=.*build\/Tab Shelf\.app/u);
  assert.match(script, /INSTALL_TARGET="\/Applications\/Tab Shelf\.app"/u);
  assert.match(script, /RECOVERY_ROOT="\$PROJECT_ROOT\/build\/install-recovery"/u);
  assert.match(script, /BACKUP_ROOT="\$RECOVERY_ROOT\/backups"/u);
  assert.match(script, /FAILED_ROOT="\$RECOVERY_ROOT\/failures"/u);
  assert.doesNotMatch(script, /\/Applications\/Tab Shelf\.app\.(?:backup|failed)-/u);
  assert.match(script, /\[ -L "\$INSTALL_TARGET" \]/u);
  assert.match(script, /"\$PLUGINKIT" -r/u);
  assert.match(script, /"\$LSREGISTER" -u/u);
  assert.match(script, /"\$PLUGINKIT" -mDvvv -i "\$EXTENSION_IDENTIFIER"/u);
  assert.match(script, /Expected exactly one registered Safari extension/u);
  assert.match(script, /EXPECTED_EXTENSION_PATH/u);
  assert.match(script, /trap rollback EXIT/u);
  assert.match(script, /mv "\$BACKUP_TARGET" "\$INSTALL_TARGET"/u);
  assert.match(script, /register_app "\$INSTALL_TARGET"/u);
  assert.match(script, /verify_single_registration/u);
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
