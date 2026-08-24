import assert from "node:assert/strict";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  prepareMacOSProject,
  replaceExact,
} from "../scripts/prepare-macos-project.mjs";

const SOURCE_ROOT = process.cwd();
const PRODUCT = "Tab Shelf";
const PROJECT_SETTINGS = `${PRODUCT}.xcodeproj/project.pbxproj`;
const HOST_OUTPUTS = [
  "ViewController.swift",
  "Resources/Base.lproj/Main.html",
  "Resources/Style.css",
  "Resources/Script.js",
];

function repeatedSettings(overrides = {}) {
  const values = {
    appIdentifier: 'PRODUCT_BUNDLE_IDENTIFIER = "com.jovaii.Tab-Shelf";',
    extensionIdentifier: "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf.Extension;",
    network: "ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;",
    ...overrides,
  };

  const extension = `
    CURRENT_PROJECT_VERSION = 1;
    ENABLE_APP_SANDBOX = YES;
    INFOPLIST_KEY_NSHumanReadableCopyright = "";
    MARKETING_VERSION = 1.0;
    ${values.extensionIdentifier}
  `;
  const app = `
    CURRENT_PROJECT_VERSION = 1;
    ENABLE_APP_SANDBOX = YES;
    ${values.network}
    INFOPLIST_KEY_NSHumanReadableCopyright = "";
    MARKETING_VERSION = 1.0;
    ${values.appIdentifier}
  `;

  return `
    isa = PBXNativeTarget;
    isa = PBXNativeTarget;
    productType = "com.apple.product-type.application";
    productType = "com.apple.product-type.app-extension";
    ${extension}${extension}${app}${app}
  `;
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function makeFixture(t, { projectSource = repeatedSettings(), duplicateProject = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tab-shelf-prepare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const generatedRoot = join(root, "native/generated");
  const projectContainer = join(generatedRoot, PRODUCT);
  const project = join(projectContainer, `${PRODUCT}.xcodeproj`);
  const appTarget = join(projectContainer, PRODUCT);
  const extensionTarget = join(projectContainer, `${PRODUCT} Extension`);
  const hostSource = join(root, "native/host");

  cpSync(join(SOURCE_ROOT, "native/host"), hostSource, { recursive: true });
  write(join(project, "project.pbxproj"), projectSource);
  write(
    join(appTarget, "ViewController.swift"),
    'let extensionBundleIdentifier = "com.jovaii.tabshelf.Extension"\n',
  );
  write(join(appTarget, "Resources/Icon.png"), "generated icon");
  write(join(appTarget, "Resources/Base.lproj/Main.html"), "generated html");
  write(join(appTarget, "Resources/Style.css"), "generated css");
  write(join(appTarget, "Resources/Script.js"), "generated script");
  write(join(extensionTarget, "SafariWebExtensionHandler.swift"), "generated extension");

  if (duplicateProject) {
    write(join(generatedRoot, "Duplicate.xcodeproj/project.pbxproj"), projectSource);
  }

  return { root, generatedRoot, project, appTarget, extensionTarget, hostSource };
}

function count(source, value) {
  return source.split(value).length - 1;
}

function snapshotOutputs(fixture) {
  return new Map([
    [join(fixture.project, "project.pbxproj"), readFileSync(join(fixture.project, "project.pbxproj"))],
    ...HOST_OUTPUTS.map((relativePath) => {
      const output = join(fixture.appTarget, relativePath);
      return [output, readFileSync(output)];
    }),
    [join(fixture.appTarget, "Resources/Icon.png"), readFileSync(join(fixture.appTarget, "Resources/Icon.png"))],
  ]);
}

function assertSnapshot(snapshot) {
  for (const [path, contents] of snapshot) {
    assert.deepEqual(readFileSync(path), contents, `${path} changed before validation completed`);
  }
}

test("replaceExact rejects a count mismatch with a specific error", () => {
  assert.throws(
    () => replaceExact("one one", "one", "two", 1, "sample value"),
    /sample value: expected 1, found 2/u,
  );
});

test("prepares one generated Xcode project from tracked release values and host templates", (t) => {
  const fixture = makeFixture(t);

  const result = prepareMacOSProject({
    root: fixture.root,
    generatedRoot: fixture.generatedRoot,
  });
  const preparedProject = readFileSync(join(fixture.project, "project.pbxproj"), "utf8");

  assert.equal(count(preparedProject, "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf;"), 2);
  assert.equal(
    count(preparedProject, "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf.extension;"),
    2,
  );
  assert.equal(count(preparedProject, "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;"), 2);
  assert.equal(count(preparedProject, "ENABLE_APP_SANDBOX = YES;"), 4);
  assert.equal(count(preparedProject, "MARKETING_VERSION = 1.0.0;"), 4);
  assert.equal(count(preparedProject, "CURRENT_PROJECT_VERSION = 1;"), 4);
  assert.equal(count(preparedProject, "Copyright 2026 James Li / Jovaii"), 4);

  assert.equal(
    readFileSync(join(fixture.appTarget, "ViewController.swift"), "utf8"),
    readFileSync(join(fixture.hostSource, "ViewController.swift"), "utf8"),
  );
  for (const relativePath of ["Base.lproj/Main.html", "Style.css", "Script.js"]) {
    assert.equal(
      readFileSync(join(fixture.appTarget, "Resources", relativePath), "utf8"),
      readFileSync(join(fixture.hostSource, relativePath), "utf8"),
    );
  }
  assert.equal(readFileSync(join(fixture.appTarget, "Resources/Icon.png"), "utf8"), "generated icon");

  assert.ok(Object.isFrozen(result));
  assert.deepEqual(result, {
    project: realpathSync(fixture.project),
    appTarget: realpathSync(fixture.appTarget),
    extensionTarget: realpathSync(fixture.extensionTarget),
  });
});

test("fails on a missing generated setting without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: repeatedSettings({ network: "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;" }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /outgoing network build settings: expected 2, found 0/u,
  );
  assertSnapshot(before);
});

test("fails on duplicate generated projects without partial writes", (t) => {
  const fixture = makeFixture(t, { duplicateProject: true });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /generated Xcode projects: expected 1, found 2/u,
  );
  assertSnapshot(before);
});

test("fails on a symbolic-link input without partial writes", (t) => {
  const fixture = makeFixture(t);
  const controller = join(fixture.appTarget, "ViewController.swift");
  const linkTarget = join(fixture.root, "unexpected-controller.swift");
  write(linkTarget, "unexpected controller");
  unlinkSync(controller);
  symlinkSync(linkTarget, controller);
  const beforeProject = readFileSync(join(fixture.project, "project.pbxproj"));

  assert.equal(lstatSync(controller).isSymbolicLink(), true);
  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /symbolic link/u,
  );
  assert.deepEqual(readFileSync(join(fixture.project, "project.pbxproj")), beforeProject);
  assert.equal(readFileSync(linkTarget, "utf8"), "unexpected controller");
});

test("fails on already-unexpected generated identifiers without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: repeatedSettings({
      appIdentifier: "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf;",
      extensionIdentifier: "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf.extension;",
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /generated App bundle identifiers: expected 2, found 0/u,
  );
  assertSnapshot(before);
});

test("fails on a conflicting build setting without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: `${repeatedSettings()}\nENABLE_APP_SANDBOX = NO;\n`,
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /App Sandbox setting keys: expected 4, found 5/u,
  );
  assertSnapshot(before);
});

test("fails on a duplicate native App target without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: `${repeatedSettings()}\nproductType = "com.apple.product-type.application";\n`,
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /native App targets: expected 1, found 2/u,
  );
  assertSnapshot(before);
});

test("fails on a symbolic link nested inside the Xcode project without partial writes", (t) => {
  const fixture = makeFixture(t);
  const linkTarget = join(fixture.root, "unexpected-workspace-data");
  const link = join(fixture.project, "project.xcworkspace/linked-data");
  write(linkTarget, "unexpected workspace data");
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(linkTarget, link);
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /symbolic link/u,
  );
  assertSnapshot(before);
  assert.equal(readFileSync(linkTarget, "utf8"), "unexpected workspace data");
});

test("rejects a generated root outside the repository root", (t) => {
  const fixture = makeFixture(t);
  const otherRoot = mkdtempSync(join(tmpdir(), "tab-shelf-outside-"));
  t.after(() => rmSync(otherRoot, { recursive: true, force: true }));

  assert.throws(
    () => prepareMacOSProject({ root: otherRoot, generatedRoot: fixture.generatedRoot }),
    /generated root must be inside repository root/u,
  );
});
