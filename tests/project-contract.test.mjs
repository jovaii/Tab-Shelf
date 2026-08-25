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
    "## Features",
    "## Privacy by design",
    "### Temporary Safari installation",
    "### Theme Studio",
    "### Local WebKit preview",
    "## Mac App Store",
    "### Uninstall",
    "## License",
  ]) {
    assert.match(readme, new RegExp(`^${heading}$`, "m"));
  }
  assert.match(readme, /com\.jovaii\.tabshelf/);
  assert.match(readme, /tab-shelf-preferences-v1\.json/);
  assert.match(readme, /THIRD_PARTY_NOTICES\.md/);
  assert.match(readme, /Five authored themes:[^\n]*Storm Horizon/u);
});

test("presents the public product decision without an invented store listing", () => {
  const readme = readFileSync("README.md", "utf8");
  const headings = [
    "Why Tab Shelf",
    "See it in action",
    "Choose your install path",
    "Build from source",
    "Mac App Store",
    "Support",
    "Contributing",
  ];

  for (const heading of headings) {
    assert.match(readme, new RegExp(`^## ${heading}$`, "m"));
  }
  assert.match(readme, /^### Build from source — Free$/m);
  assert.match(readme, /^### Mac App Store — USD 9\.99 one time$/m);
  assert.match(readme, /same core features/u);
  assert.match(readme, /No ads, subscriptions, accounts, analytics, or telemetry/u);
  assert.match(readme, /Mac App Store release in preparation/u);
  assert.doesNotMatch(readme, /apps\.apple\.com/u);

  const orderedHeadings = [
    "# Tab Shelf",
    "## Why Tab Shelf",
    "## See it in action",
    "## Choose your install path",
    "## Features",
    "## Privacy by design",
    "## Build from source",
    "## Mac App Store",
    "## Support",
    "## Contributing",
    "## License",
  ];
  let previous = -1;
  for (const heading of orderedHeadings) {
    const position = readme.indexOf(`${heading}\n`);
    assert.ok(position > previous, `${heading} must appear in the approved order`);
    previous = position;
  }
});

test("publishes complete privacy, support, and contribution policies", () => {
  const policies = new Map([
    ["PRIVACY.md", [
      /open-tab titles, URLs, favicons, preferences, and optional user-selected backgrounds/u,
      /processed locally/u,
      /does not collect, transmit, sell, or share/u,
      /makes no first-party network requests/u,
      /browsing history/u,
    ]],
    ["SUPPORT.md", [
      /Enable Tab Shelf/u,
      /duplicate extension/u,
      /Permissions/u,
      /new-tab page/u,
      /Reset appearance/u,
      /Uninstall/u,
      /private URLs, browsing history, credentials, or personal screenshots/u,
    ]],
    ["CONTRIBUTING.md", [
      /English/u,
      /original work/u,
      /Apache-2\.0/u,
      /third-party runtime assets or dependencies/u,
      /focused tests/u,
      /npm run check/u,
      /secrets or personal browsing data/u,
    ]],
  ]);

  for (const [path, claims] of policies) {
    assert.equal(existsSync(path), true, `${path} must exist`);
    const content = readFileSync(path, "utf8");
    assert.doesNotMatch(content, /[\p{Script=Han}]/u);
    for (const claim of claims) assert.match(content, claim);
  }
});

test("provides privacy-safe structured GitHub issue forms", () => {
  const bugPath = ".github/ISSUE_TEMPLATE/bug.yml";
  const featurePath = ".github/ISSUE_TEMPLATE/feature.yml";
  const configPath = ".github/ISSUE_TEMPLATE/config.yml";
  for (const path of [bugPath, featurePath, configPath]) {
    assert.equal(existsSync(path), true, `${path} must exist`);
  }

  const bug = readFileSync(bugPath, "utf8");
  for (const label of [
    "macOS version",
    "Safari version",
    "Tab Shelf version",
    "Install channel",
    "Steps to reproduce",
    "Expected behavior",
    "Observed behavior",
  ]) {
    assert.match(bug, new RegExp(`label: ${label}`, "u"));
  }
  assert.match(bug, /Do not paste private URLs or browsing history/u);
  assert.match(bug, /options:\s*\n\s*- Build from source\s*\n\s*- Mac App Store/u);

  const feature = readFileSync(featurePath, "utf8");
  assert.match(feature, /name: Feature request/u);
  assert.match(feature, /problem/u);
  assert.match(feature, /proposed solution/u);
  assert.match(feature, /Do not include private URLs, browsing history, credentials, or personal screenshots/u);

  const config = readFileSync(configPath, "utf8");
  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.match(config, /https:\/\/github\.com\/jovaii\/Tab-Shelf\/blob\/main\/SUPPORT\.md/u);
  assert.match(config, /https:\/\/github\.com\/jovaii\/Tab-Shelf\/blob\/main\/PRIVACY\.md/u);

  for (const content of [bug, feature, config]) {
    assert.doesNotMatch(content, /[\p{Script=Han}]/u);
    assert.doesNotMatch(content, /apps\.apple\.com/u);
  }
});

test("records the 1.0.0 release and current acceptance boundary", () => {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const acceptance = readFileSync("docs/testing/release-acceptance.md", "utf8");
  const progress = readFileSync("PROGRESS.md", "utf8");

  assert.match(changelog, /^## \[1\.0\.0\] - 2026-08-24$/m);
  assert.match(acceptance, /^# Tab Shelf 1\.0\.0 Release Acceptance$/m);
  assert.match(acceptance, /275\/275 automated tests passed/);
  assert.match(acceptance, /Full Xcode is required/);
  assert.match(acceptance, /Xcode 26\.6/);
  assert.match(acceptance, /com\.jovaii\.tabshelf\.extension/);
  assert.match(acceptance, /ad-hoc/);
  assert.match(acceptance, /\/Applications\/Tab Shelf\.app/);
  assert.match(acceptance, /Temporary Safari profile acceptance remains manual/);
  assert.match(acceptance, /exactly one registered Tab Shelf extension/u);
  assert.match(progress, /`QA-IN-PROGRESS`/u);
  assert.match(progress, /GitHub remote mutation is deferred/u);
  assert.match(progress, /Apple Distribution archive/u);
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
