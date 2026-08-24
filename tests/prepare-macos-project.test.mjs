import assert from "node:assert/strict";
import fs from "node:fs";
import {
  cpSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
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

const IDS = Object.freeze({
  appTarget: "AA0000000000000000000001",
  appList: "AA0000000000000000000002",
  appDebug: "AA0000000000000000000003",
  appRelease: "AA0000000000000000000004",
  extensionTarget: "BB0000000000000000000001",
  extensionList: "BB0000000000000000000002",
  extensionDebug: "BB0000000000000000000003",
  extensionRelease: "BB0000000000000000000004",
  extraTarget: "CC0000000000000000000001",
  extraList: "CC0000000000000000000002",
});

function settings({ type, identifier, network, extra = "", comment = "" }) {
  return `
        CURRENT_PROJECT_VERSION = 1;
        ENABLE_APP_SANDBOX = YES;
        ${network === undefined ? "" : `ENABLE_OUTGOING_NETWORK_CONNECTIONS = ${network};`}
        INFOPLIST_KEY_NSHumanReadableCopyright = "";
        MARKETING_VERSION = 1.0;
        ${identifier === undefined ? "" : `PRODUCT_BUNDLE_IDENTIFIER = ${identifier};`}
        ${extra}
        ${comment}
        PRODUCT_NAME = "${type}";
  `;
}

function configuration(id, name, buildSettings) {
  return `
    ${id} /* ${name} */ = {
      isa = XCBuildConfiguration;
      buildSettings = {${buildSettings}
      };
      name = ${name};
    };
  `;
}

function configurationList(id, name, references) {
  return `
    ${id} /* ${name} */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        ${references.map(({ id: reference, name: configName }) => `${reference} /* ${configName} */,`).join("\n        ")}
      );
      defaultConfigurationIsVisible = 0;
      defaultConfigurationName = Release;
    };
  `;
}

function nativeTarget(id, name, list, productType) {
  return `
    ${id} /* ${name} */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = ${list} /* Build configuration list for ${name} */;
      name = "${name}";
      productName = "${name}";
      productType = "${productType}";
    };
  `;
}

function generatedProject(overrides = {}) {
  const appDebug = {
    type: PRODUCT,
    identifier: '"com.jovaii.Tab-Shelf"',
    network: "YES",
    ...(overrides.appDebug ?? {}),
  };
  const appRelease = {
    type: PRODUCT,
    identifier: '"com.jovaii.Tab-Shelf"',
    network: "YES",
    ...(overrides.appRelease ?? {}),
  };
  const extensionDebug = {
    type: `${PRODUCT} Extension`,
    identifier: "com.jovaii.tabshelf.Extension",
    ...(overrides.extensionDebug ?? {}),
  };
  const extensionRelease = {
    type: `${PRODUCT} Extension`,
    identifier: "com.jovaii.tabshelf.Extension",
    ...(overrides.extensionRelease ?? {}),
  };
  const appReferences = overrides.appReferences ?? [
    { id: IDS.appDebug, name: "Debug" },
    { id: IDS.appRelease, name: "Release" },
  ];
  const extensionReferences = overrides.extensionReferences ?? [
    { id: IDS.extensionDebug, name: "Debug" },
    { id: IDS.extensionRelease, name: "Release" },
  ];
  const extraTarget = overrides.extraTarget
    ? nativeTarget(
      IDS.extraTarget,
      "Second App Target",
      IDS.extraList,
      "com.apple.product-type.application",
    )
    : "";

  return `
// !$*UTF8*$!
{
  objects = {
${nativeTarget(IDS.appTarget, PRODUCT, IDS.appList, "com.apple.product-type.application")}
${nativeTarget(IDS.extensionTarget, `${PRODUCT} Extension`, IDS.extensionList, "com.apple.product-type.app-extension")}
${extraTarget}
${configurationList(IDS.appList, "App configurations", appReferences)}
${configurationList(IDS.extensionList, "Extension configurations", extensionReferences)}
${configuration(IDS.appDebug, "Debug", settings(appDebug))}
${configuration(IDS.appRelease, "Release", settings(appRelease))}
${configuration(IDS.extensionDebug, "Debug", settings(extensionDebug))}
${configuration(IDS.extensionRelease, "Release", settings(extensionRelease))}
${overrides.extraObjects ?? ""}
  };
}
  `;
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function makeFixture(t, { projectSource = generatedProject(), duplicateProject = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tab-shelf-prepare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const generatedRoot = join(root, "native/generated");
  const projectContainer = join(generatedRoot, PRODUCT);
  const project = join(projectContainer, `${PRODUCT}.xcodeproj`);
  const appTarget = join(projectContainer, PRODUCT);
  const extensionTarget = join(projectContainer, `${PRODUCT} Extension`);
  const hostSource = join(root, "native/host");

  cpSync(join(SOURCE_ROOT, "native/host"), hostSource, { recursive: true });
  cpSync(
    join(SOURCE_ROOT, "native/release"),
    join(root, "native/release"),
    { recursive: true },
  );
  write(join(project, "project.pbxproj"), projectSource);
  write(
    join(appTarget, "ViewController.swift"),
    'let extensionBundleIdentifier = "com.jovaii.tabshelf.Extension"\n',
  );
  write(join(appTarget, "AppDelegate.swift"), "generated App delegate");
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
    [join(fixture.appTarget, "AppDelegate.swift"), readFileSync(join(fixture.appTarget, "AppDelegate.swift"))],
    [join(fixture.extensionTarget, "SafariWebExtensionHandler.swift"), readFileSync(join(fixture.extensionTarget, "SafariWebExtensionHandler.swift"))],
  ]);
}

function assertSnapshot(snapshot) {
  for (const [path, contents] of snapshot) {
    assert.deepEqual(readFileSync(path), contents, `${path} changed before validation completed`);
  }
}

function transactionArtifacts(directory) {
  const artifacts = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith(".tab-shelf-stage-") || entry.name.startsWith(".tab-shelf-backup-")) {
      artifacts.push(path);
    }
    if (entry.isDirectory()) artifacts.push(...transactionArtifacts(path));
  }
  return artifacts;
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
  assert.equal(
    readFileSync(join(fixture.appTarget, "AppDelegate.swift"), "utf8"),
    readFileSync(
      join(fixture.root, "native/release/xcode-26.6/Tab Shelf/Tab Shelf/AppDelegate.swift"),
      "utf8",
    ),
  );
  assert.equal(
    readFileSync(join(fixture.extensionTarget, "SafariWebExtensionHandler.swift"), "utf8"),
    readFileSync(
      join(
        fixture.root,
        "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift",
      ),
      "utf8",
    ),
  );

  assert.ok(Object.isFrozen(result));
  assert.deepEqual(result, {
    project: realpathSync(fixture.project),
    appTarget: realpathSync(fixture.appTarget),
    extensionTarget: realpathSync(fixture.extensionTarget),
  });
});

test("fails on a missing generated setting without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({
      appDebug: { network: "NO" },
      appRelease: { network: "NO" },
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf Debug ENABLE_OUTGOING_NETWORK_CONNECTIONS/u,
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
    projectSource: generatedProject({
      appDebug: { identifier: "com.jovaii.tabshelf" },
      appRelease: { identifier: "com.jovaii.tabshelf" },
      extensionDebug: { identifier: "com.jovaii.tabshelf.extension" },
      extensionRelease: { identifier: "com.jovaii.tabshelf.extension" },
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf Debug PRODUCT_BUNDLE_IDENTIFIER/u,
  );
  assertSnapshot(before);
});

test("fails on a conflicting build setting without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({ appDebug: { extra: "ENABLE_APP_SANDBOX = NO;" } }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf Debug ENABLE_APP_SANDBOX: expected 1, found 2/u,
  );
  assertSnapshot(before);
});

test("fails on a duplicate native App target without partial writes", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({ extraTarget: true }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /native (?:App )?targets/u,
  );
  assertSnapshot(before);
});

test("rejects settings assigned to the wrong native targets", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({
      appDebug: { identifier: "com.jovaii.tabshelf.Extension", network: undefined },
      appRelease: { identifier: "com.jovaii.tabshelf.Extension", network: undefined },
      extensionDebug: { identifier: '"com.jovaii.Tab-Shelf"', network: "YES" },
      extensionRelease: { identifier: '"com.jovaii.Tab-Shelf"', network: "YES" },
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf Debug (?:ENABLE_OUTGOING_NETWORK_CONNECTIONS|PRODUCT_BUNDLE_IDENTIFIER)/u,
  );
  assertSnapshot(before);
});

test("rejects a configuration list missing Debug even when its object still exists", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({
      appReferences: [{ id: IDS.appRelease, name: "Release" }],
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf configurations: expected Debug and Release exactly once/u,
  );
  assertSnapshot(before);
});

test("rejects a duplicate Release configuration reference", (t) => {
  const fixture = makeFixture(t, {
    projectSource: generatedProject({
      appReferences: [
        { id: IDS.appDebug, name: "Debug" },
        { id: IDS.appRelease, name: "Release" },
        { id: IDS.appRelease, name: "Release" },
      ],
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf configurations: expected Debug and Release exactly once/u,
  );
  assertSnapshot(before);
});

test("rejects comment and unrelated-object decoys for a missing target setting", (t) => {
  const decoy = configuration(
    "CC0000000000000000000003",
    "Decoy",
    '\n        PRODUCT_BUNDLE_IDENTIFIER = "com.jovaii.Tab-Shelf";\n',
  );
  const fixture = makeFixture(t, {
    projectSource: generatedProject({
      appDebug: {
        identifier: undefined,
        comment: '/* PRODUCT_BUNDLE_IDENTIFIER = "com.jovaii.Tab-Shelf"; */',
      },
      appRelease: { identifier: undefined },
      extraObjects: decoy,
    }),
  });
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /Tab Shelf Debug PRODUCT_BUNDLE_IDENTIFIER/u,
  );
  assertSnapshot(before);
});

test("rejects a corrupt tracked HTML template without partial writes", (t) => {
  const fixture = makeFixture(t);
  const template = join(fixture.hostSource, "Base.lproj/Main.html");
  writeFileSync(template, readFileSync(template, "utf8").replace("<main>", "<aside>"));
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /tracked Main.html anchor <main>: expected 1, found 0/u,
  );
  assertSnapshot(before);
});

test("rejects an empty tracked stylesheet without partial writes", (t) => {
  const fixture = makeFixture(t);
  writeFileSync(join(fixture.hostSource, "Style.css"), "");
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /tracked Style.css must not be empty/u,
  );
  assertSnapshot(before);
});

test("rejects a corrupt tracked JavaScript template without partial writes", (t) => {
  const fixture = makeFixture(t);
  const template = join(fixture.hostSource, "Script.js");
  writeFileSync(
    template,
    readFileSync(template, "utf8").replace(
      "window.showExtensionState = showExtensionState;",
      "window.invalidBridge = showExtensionState;",
    ),
  );
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /tracked Script.js bridge export: expected 1, found 0/u,
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

test("rejects a hard-linked destination aliasing the generated icon", (t) => {
  const fixture = makeFixture(t);
  const icon = join(fixture.appTarget, "Resources/Icon.png");
  const destination = join(fixture.appTarget, "Resources/Style.css");
  unlinkSync(destination);
  linkSync(icon, destination);
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /hard link|inode collision/u,
  );
  assertSnapshot(before);
});

test("rejects a hard-linked destination aliasing an outside file", (t) => {
  const fixture = makeFixture(t);
  const outside = join(fixture.root, "outside-data");
  const destination = join(fixture.appTarget, "Resources/Script.js");
  write(outside, "outside data");
  unlinkSync(destination);
  linkSync(outside, destination);
  const before = snapshotOutputs(fixture);

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /hard link/u,
  );
  assertSnapshot(before);
  assert.equal(readFileSync(outside, "utf8"), "outside data");
});

test("rejects a destination replaced by a symlink between inspection and open", (t) => {
  const fixture = makeFixture(t);
  const destination = join(fixture.appTarget, "ViewController.swift");
  const resolvedDestination = realpathSync(destination);
  const outside = join(fixture.root, "outside-controller.swift");
  write(outside, "outside controller");
  const beforeProject = readFileSync(join(fixture.project, "project.pbxproj"));
  const originalOpen = fs.openSync;
  let replaced = false;

  t.mock.method(fs, "openSync", function openWithReplacement(path, ...args) {
    if (path === resolvedDestination && !replaced) {
      unlinkSync(destination);
      symlinkSync(outside, destination);
      replaced = true;
    }
    return originalOpen.call(fs, path, ...args);
  });

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /symbolic link|changed during validation|ELOOP/u,
  );
  assert.equal(replaced, true);
  assert.deepEqual(readFileSync(join(fixture.project, "project.pbxproj")), beforeProject);
  assert.equal(readFileSync(outside, "utf8"), "outside controller");
});

test("rolls back every output when a later staged commit fails", (t) => {
  const fixture = makeFixture(t);
  const before = snapshotOutputs(fixture);
  const failedDestination = realpathSync(join(fixture.appTarget, "Resources/Style.css"));
  const originalRename = fs.renameSync;
  let injected = false;

  t.mock.method(fs, "renameSync", function renameWithFailure(source, destination) {
    if (
      !injected &&
      destination === failedDestination &&
      source.includes(".tab-shelf-stage-")
    ) {
      injected = true;
      const error = new Error("injected later commit failure");
      error.code = "EIO";
      throw error;
    }
    return originalRename.call(fs, source, destination);
  });

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: fixture.generatedRoot }),
    /transaction failed: injected later commit failure/u,
  );
  assert.equal(injected, true);
  assertSnapshot(before);
  assert.deepEqual(transactionArtifacts(fixture.generatedRoot), []);
});

test("reports a generated root that is not a directory deterministically", (t) => {
  const fixture = makeFixture(t);
  const generatedFile = join(fixture.root, "generated-file");
  write(generatedFile, "not a directory");

  assert.throws(
    () => prepareMacOSProject({ root: fixture.root, generatedRoot: generatedFile }),
    /generated root must be a directory/u,
  );
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
