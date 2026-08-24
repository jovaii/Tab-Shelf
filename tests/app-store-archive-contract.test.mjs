import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(path, "utf8");
}

test("archive path signs for the enrolled team but never uploads", () => {
  const script = source("scripts/archive-app-store.sh");

  assert.match(script, /set -euo pipefail/u);
  assert.match(script, /APPLE_TEAM_ID/u);
  assert.match(script, /\^\[A-Z0-9\]\{10\}\$/u);
  assert.match(script, /npm run check:app-store/u);
  assert.match(script, /xcodebuild/u);
  assert.match(script, /-configuration Release/u);
  assert.match(script, /-destination generic\/platform=macOS/u);
  assert.match(script, /-archivePath/u);
  assert.match(script, /CODE_SIGN_STYLE=Automatic/u);
  assert.match(script, /DEVELOPMENT_TEAM="\$APPLE_TEAM_ID"/u);
  assert.match(script, /Xcode 26\.6/u);
  assert.match(script, /Build version 17F113/u);
  assert.doesNotMatch(script, /notarytool|altool|upload|exportArchive|rm\s+-[a-z]*r/iu);
  assert.doesNotMatch(script, /^\s*open\s/mu);
});

test("archive contract verifies the sealed archive identity without replacing an archive", () => {
  const script = source("scripts/archive-app-store.sh");

  assert.match(script, /Tab Shelf\.xcarchive/u);
  assert.match(script, /already exists/u);
  assert.match(script, /Info\.plist/u);
  assert.match(script, /CFBundleIdentifier/u);
  assert.match(script, /CFBundleShortVersionString/u);
  assert.match(script, /CFBundleVersion/u);
  assert.match(script, /com\.jovaii\.tabshelf\.extension/u);
  assert.match(script, /must not be a hard link/u);
  assert.match(script, /must not be a symbolic link/u);
});

test("package command exposes a local archive path and ignores local archives", () => {
  const manifest = JSON.parse(source("package.json"));
  const ignore = source(".gitignore");

  assert.equal(manifest.scripts["archive:app-store"], "bash scripts/archive-app-store.sh");
  assert.match(ignore, /^\*\.xcarchive\/$/mu);
  assert.match(ignore, /^build\/app-store\/$/mu);
});
