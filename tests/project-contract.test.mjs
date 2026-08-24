import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("uses the independent product identity", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(manifest.name, "tab-shelf");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.devDependencies ?? {}, {});
  assert.match(
    readFileSync("NOTICE", "utf8"),
    /^Tab Shelf\nCopyright 2026 James Li \/ Jovaii\n$/,
  );
});

test("contains the complete Apache License 2.0", () => {
  const license = readFileSync("LICENSE", "utf8");

  assert.match(license, /^Apache License\n {27}Version 2\.0, January 2004\n/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(license, /Copyright \[yyyy\] \[name of copyright owner\]/);
});

test("contains no vendored dependency tree", () => {
  assert.equal(existsSync("node_modules"), false);
  assert.equal(existsSync("package-lock.json"), false);
  assert.equal(existsSync("vendor"), false);
  assert.equal(existsSync("Pods"), false);
  assert.equal(existsSync("Carthage"), false);
});

test("documents the Safari-only and privacy boundaries", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /^# Tab Shelf$/m);
  assert.match(readme, /Safari-only personal utility/);
  assert.match(readme, /No telemetry/);
  assert.match(readme, /Apache License 2\.0/);
});

test("publishes complete English setup, theme, build, and removal guidance", () => {
  const readme = readFileSync("README.md", "utf8");

  for (const heading of [
    "Features",
    "Privacy",
    "Temporary Safari installation",
    "Theme Studio",
    "Local WebKit preview",
    "Official macOS App",
    "Uninstall",
    "License",
  ]) {
    assert.match(readme, new RegExp(`^## ${heading}$`, "m"));
  }
  assert.match(readme, /com\.jovaii\.tabshelf/);
  assert.match(readme, /tab-shelf-preferences-v1\.json/);
  assert.match(readme, /THIRD_PARTY_NOTICES\.md/);
  assert.match(readme, /Five authored themes:[^\n]*Storm Horizon/u);
});

test("records the 1.0.0 release and current acceptance boundary", () => {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const acceptance = readFileSync("docs/testing/release-acceptance.md", "utf8");

  assert.match(changelog, /^## \[1\.0\.0\] - 2026-08-24$/m);
  assert.match(acceptance, /^# Tab Shelf 1\.0\.0 Release Acceptance$/m);
  assert.match(acceptance, /86\/86 automated tests passed/);
  assert.match(acceptance, /Full Xcode is required/);
  assert.match(acceptance, /Xcode 26\.6/);
  assert.match(acceptance, /com\.jovaii\.tabshelf\.extension/);
  assert.match(acceptance, /ad-hoc/);
  assert.match(acceptance, /\/Applications\/Tab Shelf\.app/);
  assert.match(acceptance, /Temporary Safari profile acceptance remains manual/);
});

test("exposes dependency-free repeatable development commands", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(manifest.engines.node, ">=24");
  assert.equal(manifest.scripts.check, "npm test && npm run audit && npm run check:release");
  assert.equal(
    manifest.scripts["check:release"],
    "node scripts/check-app-store-readiness.mjs --source-only",
  );
  assert.equal(
    manifest.scripts["check:app-store"],
    "node scripts/check-app-store-readiness.mjs --generated native/generated",
  );
  assert.match(manifest.scripts.preview, /serve-preview\.mjs/);
  assert.match(manifest.scripts["render:preview"], /render-preview\.swift/);
  assert.equal(manifest.scripts["package:macos"], "bash scripts/package-macos.sh");
  assert.equal(manifest.scripts["install:macos"], "bash scripts/install-macos.sh");
});
