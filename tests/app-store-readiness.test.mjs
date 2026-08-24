import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  checkGeneratedReadiness,
  checkSourceReadiness,
} from "../scripts/check-app-store-readiness.mjs";

const SOURCE_ROOT = resolve(import.meta.dirname, "..");
const PRODUCT = "Tab Shelf";
const IDS = Object.freeze({
  appTarget: "AA0000000000000000000001",
  extensionTarget: "AA0000000000000000000002",
  appList: "BB0000000000000000000001",
  extensionList: "BB0000000000000000000002",
  appDebug: "CC0000000000000000000001",
  appRelease: "CC0000000000000000000002",
  extensionDebug: "CC0000000000000000000003",
  extensionRelease: "CC0000000000000000000004",
});
const APPLE_APP_FILES = Object.freeze([
  "AppDelegate.swift",
  "Assets.xcassets/AccentColor.colorset/Contents.json",
  "Assets.xcassets/AppIcon.appiconset/Contents.json",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png",
  "Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png",
  "Assets.xcassets/Contents.json",
  "Assets.xcassets/LargeIcon.imageset/Contents.json",
  "Base.lproj/Main.storyboard",
  "Info.plist",
  "Resources/Icon.png",
]);
const SAFE_HANDLER = `import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
`;

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function replace(path, before, after) {
  writeFileSync(path, readFileSync(path, "utf8").replace(before, after));
}

function initializeRepository(root) {
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  assert.equal(spawnSync("git", ["-C", root, "add", "."]).status, 0);
}

function makeSourceFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "tab-shelf-readiness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    ".gitignore",
    "package.json",
    "extension",
    "native/host",
    "LICENSE",
    "NOTICE",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    cpSync(join(SOURCE_ROOT, path), join(root, path), { recursive: true });
  }
  initializeRepository(root);
  return root;
}

function addReadinessScripts(root) {
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const file of [
    "audit-repository.mjs",
    "check-app-store-readiness.mjs",
    "prepare-macos-project.mjs",
    "release-config.mjs",
  ]) {
    cpSync(join(SOURCE_ROOT, "scripts", file), join(root, "scripts", file));
  }
}

function runFixtureCLI(root, args = ["--source-only"]) {
  return spawnSync(
    process.execPath,
    ["scripts/check-app-store-readiness.mjs", ...args],
    { cwd: root, encoding: "utf8" },
  );
}

function setting(name, value) {
  return value === undefined ? "" : `\n        ${name} = ${value};`;
}

function configuration(id, name, values) {
  const sandbox = Object.hasOwn(values, "sandbox") ? values.sandbox : "YES";
  return `
    ${id} /* ${name} */ = {
      isa = XCBuildConfiguration;
      buildSettings = {${setting("CURRENT_PROJECT_VERSION", values.build ?? "1")}${setting("ENABLE_APP_SANDBOX", sandbox)}${setting("ENABLE_OUTGOING_NETWORK_CONNECTIONS", values.network)}${setting("MARKETING_VERSION", values.version ?? "1.0.0")}${setting("PRODUCT_BUNDLE_IDENTIFIER", values.identifier)}
      };
      name = ${name};
    };`;
}

function generatedProject(overrides = {}) {
  const appDebug = {
    identifier: "com.jovaii.tabshelf",
    network: "NO",
    ...overrides.appDebug,
  };
  const appRelease = {
    identifier: "com.jovaii.tabshelf",
    network: "NO",
    ...overrides.appRelease,
  };
  const extensionDebug = {
    identifier: "com.jovaii.tabshelf.extension",
    ...overrides.extensionDebug,
  };
  const extensionRelease = {
    identifier: "com.jovaii.tabshelf.extension",
    ...overrides.extensionRelease,
  };
  return `// !$*UTF8*$!
  {
    objects = {
      ${IDS.appTarget} /* Tab Shelf */ = {
        isa = PBXNativeTarget;
        buildConfigurationList = ${IDS.appList} /* Build configuration list */;
        name = "Tab Shelf";
        productType = "com.apple.product-type.application";
      };
      ${IDS.extensionTarget} /* Tab Shelf Extension */ = {
        isa = PBXNativeTarget;
        buildConfigurationList = ${IDS.extensionList} /* Build configuration list */;
        name = "Tab Shelf Extension";
        productType = "com.apple.product-type.app-extension";
      };
      ${IDS.appList} = {
        isa = XCConfigurationList;
        buildConfigurations = (${IDS.appDebug}, ${IDS.appRelease});
      };
      ${IDS.extensionList} = {
        isa = XCConfigurationList;
        buildConfigurations = (${IDS.extensionDebug}, ${IDS.extensionRelease});
      };
      ${configuration(IDS.appDebug, "Debug", appDebug)}
      ${configuration(IDS.appRelease, "Release", appRelease)}
      ${configuration(IDS.extensionDebug, "Debug", extensionDebug)}
      ${configuration(IDS.extensionRelease, "Release", extensionRelease)}
      ${overrides.extraObjects ?? ""}
    };
  }
  `;
}

function addGeneratedFixture(root, projectSource = generatedProject()) {
  const generatedRoot = join(root, "native/generated");
  const container = join(generatedRoot, PRODUCT);
  write(join(container, `${PRODUCT}.xcodeproj/project.pbxproj`), projectSource);
  write(
    join(container, `${PRODUCT}.xcodeproj/project.xcworkspace/contents.xcworkspacedata`),
    "<Workspace></Workspace>\n",
  );
  mkdirSync(
    join(container, `${PRODUCT}.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/configuration`),
    { recursive: true },
  );
  for (const path of APPLE_APP_FILES) {
    write(join(container, PRODUCT, path), `synthetic Apple resource ${path}\n`);
  }
  write(
    join(container, PRODUCT, "AppDelegate.swift"),
    "import Cocoa\nfinal class AppDelegate: NSObject {}\n",
  );
  cpSync(
    join(root, "native/host/Base.lproj/Main.html"),
    join(container, PRODUCT, "Resources/Base.lproj/Main.html"),
  );
  cpSync(
    join(root, "native/host/Style.css"),
    join(container, PRODUCT, "Resources/Style.css"),
  );
  cpSync(
    join(root, "native/host/Script.js"),
    join(container, PRODUCT, "Resources/Script.js"),
  );
  cpSync(
    join(root, "native/host/ViewController.swift"),
    join(container, PRODUCT, "ViewController.swift"),
  );
  cpSync(join(root, "extension"), join(container, `${PRODUCT} Extension/Resources`), {
    recursive: true,
  });
  write(join(container, `${PRODUCT} Extension/Info.plist`), "<plist></plist>\n");
  write(join(container, `${PRODUCT} Extension/SafariWebExtensionHandler.swift`), SAFE_HANDLER);
  return generatedRoot;
}

test("source readiness reports the immutable release boundary", () => {
  assert.deepEqual(checkSourceReadiness({ root: SOURCE_ROOT }), {
    product: "Tab Shelf",
    version: "1.0.0",
    build: "1",
    dependencies: 0,
    permissions: ["storage", "tabs"],
    appStoreURLPublished: false,
  });
});

test("source readiness independently rejects coherent approved-release drift", (t) => {
  const root = makeSourceFixture(t);
  addReadinessScripts(root);
  for (const path of [
    "scripts/release-config.mjs",
    "package.json",
    "extension/manifest.json",
  ]) {
    replace(join(root, path), "1.0.0", "2.0.0");
  }

  const result = runFixtureCLI(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "source_release_tuple_invalid\n");
});

test("source readiness rejects a published App Store URL during pre-publication", (t) => {
  const root = makeSourceFixture(t);
  addReadinessScripts(root);
  replace(
    join(root, "scripts/release-config.mjs"),
    'appStoreURL: ""',
    'appStoreURL: "https://apps.example.invalid/product"',
  );

  const result = runFixtureCLI(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "source_release_tuple_invalid\n");
});

test("readiness CLI emits one stable success line and bounded usage failures", () => {
  const success = spawnSync(
    process.execPath,
    ["scripts/check-app-store-readiness.mjs", "--source-only"],
    { cwd: SOURCE_ROOT, encoding: "utf8" },
  );
  assert.equal(success.status, 0);
  assert.equal(success.stderr, "");
  assert.equal(
    success.stdout,
    "PASS app_store_ready product=Tab Shelf version=1.0.0 build=1 network_entitlement=off secrets=0\n",
  );

  const failure = spawnSync(
    process.execPath,
    ["scripts/check-app-store-readiness.mjs", "--generated"],
    { cwd: SOURCE_ROOT, encoding: "utf8" },
  );
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, "");
  assert.match(failure.stderr, /^Usage: check-app-store-readiness\.mjs/u);
});

test("package commands expose stable source and generated readiness modes", () => {
  const manifest = JSON.parse(readFileSync(join(SOURCE_ROOT, "package.json"), "utf8"));
  assert.equal(
    manifest.scripts.check,
    "npm test && npm run audit && npm run check:release",
  );
  assert.equal(
    manifest.scripts["check:release"],
    "node scripts/check-app-store-readiness.mjs --source-only",
  );
  assert.equal(
    manifest.scripts["check:app-store"],
    "node scripts/check-app-store-readiness.mjs --generated native/generated",
  );
});

test("source-only readiness does not require a generated native project", (t) => {
  const root = makeSourceFixture(t);
  assert.doesNotThrow(() => checkSourceReadiness({ root }));
});

test("source readiness rejects version and identifier drift", async (t) => {
  await t.test("package version", (t) => {
    const root = makeSourceFixture(t);
    replace(join(root, "package.json"), '"version": "1.0.0"', '"version": "1.0.1"');
    assert.throws(() => checkSourceReadiness({ root }), /source_version_invalid/u);
  });
  await t.test("native extension identifier", (t) => {
    const root = makeSourceFixture(t);
    replace(
      join(root, "native/host/ViewController.swift"),
      "com.jovaii.tabshelf.extension",
      "com.example.unexpected",
    );
    assert.throws(() => checkSourceReadiness({ root }), /source_identity_invalid/u);
  });
});

test("source readiness rejects extra extension and host permissions", async (t) => {
  await t.test("extension permission", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "extension/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.permissions.push("bookmarks");
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /source_extension_permissions_invalid/u);
  });
  await t.test("host permission", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "extension/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.host_permissions = ["https://example.invalid/*"];
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /source_host_permissions_invalid/u);
  });
});

test("source readiness rejects package dependencies and vendored trees", async (t) => {
  await t.test("dependency field", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.dependencies = { sample: "1.0.0" };
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /source_dependency_policy_invalid/u);
  });
  await t.test("vendored tree", (t) => {
    const root = makeSourceFixture(t);
    mkdirSync(join(root, "vendor"));
    assert.throws(() => checkSourceReadiness({ root }), /source_dependency_policy_invalid/u);
  });
});

test("source readiness rejects remote embedded HTML resources", (t) => {
  const root = makeSourceFixture(t);
  replace(
    join(root, "extension/popup.html"),
    "</body>",
    '<script src="https://assets.example.invalid/widget.js"></script></body>',
  );
  assert.throws(() => checkSourceReadiness({ root }), /source_remote_resource_found/u);
});

test("source readiness rejects runtime network APIs", (t) => {
  const root = makeSourceFixture(t);
  writeFileSync(
    join(root, "extension/network.mjs"),
    'export const request = () => fetch("https://api.example.invalid/");\n',
  );
  assert.throws(() => checkSourceReadiness({ root }), /runtime network APIs/u);
});

test("source readiness rejects native Swift networking", (t) => {
  const root = makeSourceFixture(t);
  writeFileSync(
    join(root, "native/host/NetworkClient.swift"),
    "import Foundation\nlet session = URLSession.shared\n",
  );
  assert.throws(() => checkSourceReadiness({ root }), /source_network_api_found/u);
});

test("source readiness rejects an ancestor symlink without disclosing its target", (t) => {
  const root = makeSourceFixture(t);
  const outside = mkdtempSync(join(tmpdir(), "tab-shelf-outside-host-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  cpSync(join(root, "native/host"), outside, { recursive: true });
  rmSync(join(root, "native/host"), { recursive: true });
  symlinkSync(outside, join(root, "native/host"), "dir");

  assert.throws(
    () => checkSourceReadiness({ root }),
    (error) => {
      assert.equal(error.message, "source_path_invalid label=native_host_template");
      assert.equal(error.message.includes(outside), false);
      return true;
    },
  );
});

test("CLI filesystem and sensitive failures never disclose paths or credential names", async (t) => {
  await t.test("unavailable source file", (t) => {
    const root = makeSourceFixture(t);
    addReadinessScripts(root);
    rmSync(join(root, "NOTICE"));
    mkdirSync(join(root, "NOTICE"));

    const result = runFixtureCLI(root);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "source_file_unavailable label=legal_file\n");
    assert.equal(result.stderr.includes(root), false);
    assert.equal(result.stderr.includes("NOTICE"), false);
  });
  await t.test("sensitive artifact", (t) => {
    const root = makeSourceFixture(t);
    addReadinessScripts(root);
    const basename = "synthetic-export.p12";
    const contents = "synthetic fixture value only";
    writeFileSync(join(root, basename), contents);

    const result = runFixtureCLI(root);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "sensitive_artifacts_found count=1\n");
    assert.equal(result.stderr.includes(root), false);
    assert.equal(result.stderr.includes(basename), false);
    assert.equal(result.stderr.includes(contents), false);
  });
  await t.test("generated root outside repository", (t) => {
    const root = makeSourceFixture(t);
    addReadinessScripts(root);
    const outside = mkdtempSync(join(tmpdir(), "tab-shelf-cli-outside-"));
    t.after(() => rmSync(outside, { recursive: true, force: true }));

    const result = runFixtureCLI(root, ["--generated", outside]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "generated_root_invalid\n");
    assert.equal(result.stderr.includes(root), false);
    assert.equal(result.stderr.includes(outside), false);
  });
});

test("source readiness requires legal files and all native host templates", async (t) => {
  await t.test("legal file", (t) => {
    const root = makeSourceFixture(t);
    rmSync(join(root, "NOTICE"));
    assert.throws(() => checkSourceReadiness({ root }), /source_file_unavailable label=legal_file/u);
  });
  await t.test("host template", (t) => {
    const root = makeSourceFixture(t);
    rmSync(join(root, "native/host/Script.js"));
    assert.throws(() => checkSourceReadiness({ root }), /source_file_unavailable label=native_host_template/u);
  });
});

test("source readiness rejects prohibited product text without disclosing it", (t) => {
  const root = makeSourceFixture(t);
  const term = String.fromCharCode(108, 101, 103, 97, 99, 121, 45, 109, 97, 114, 107, 101, 114);
  const termsPath = join(dirname(root), `${PRODUCT.toLowerCase().replaceAll(" ", "-")}-terms.txt`);
  writeFileSync(termsPath, `${term}\n`);
  t.after(() => rmSync(termsPath, { force: true }));
  writeFileSync(join(root, "extension/prohibited.txt"), `current product ${term}\n`);

  assert.throws(
    () => checkSourceReadiness({ root, prohibitedTermsFile: termsPath }),
    (error) => {
      assert.match(error.message, /prohibited_terms_found count=1/u);
      assert.equal(error.message.includes(term), false);
      return true;
    },
  );
});

test("generated readiness validates exact target configurations", (t) => {
  const root = makeSourceFixture(t);
  const generatedRoot = addGeneratedFixture(root);

  assert.deepEqual(checkGeneratedReadiness({ root, generatedRoot }), {
    appBundleIdentifier: "com.jovaii.tabshelf",
    extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
    configurations: 4,
    networkEntitlement: "off",
  });
});

test("generated readiness rejects target-specific identifier and entitlement drift", async (t) => {
  await t.test("identifier", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      extensionRelease: { identifier: "com.example.unexpected" },
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_project_invalid target=extension configuration=Release field=PRODUCT_BUNDLE_IDENTIFIER/u,
    );
  });
  await t.test("outgoing network", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      appDebug: { network: "YES" },
      extraObjects: configuration(
        "CC0000000000000000000009",
        "Decoy",
        { identifier: "com.example.decoy", network: "NO" },
      ),
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_project_invalid target=app configuration=Debug field=ENABLE_OUTGOING_NETWORK_CONNECTIONS/u,
    );
  });
  await t.test("marketing version", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      appRelease: { version: "1.0.1" },
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_project_invalid target=app configuration=Release field=MARKETING_VERSION/u,
    );
  });
  await t.test("build number", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      extensionDebug: { build: "2" },
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_project_invalid target=extension configuration=Debug field=CURRENT_PROJECT_VERSION/u,
    );
  });
});

test("generated readiness rejects a missing target-specific App Sandbox setting", (t) => {
  const root = makeSourceFixture(t);
  const generatedRoot = addGeneratedFixture(root, generatedProject({
    appRelease: { sandbox: undefined },
  }));
  assert.throws(
    () => checkGeneratedReadiness({ root, generatedRoot }),
    /generated_project_invalid target=app configuration=Release field=ENABLE_APP_SANDBOX/u,
  );
});

test("generated readiness compares every extension resource byte-for-byte", async (t) => {
  for (const relativePath of [
    "popup.html",
    "background.js",
    "core/tab-model.mjs",
  ]) {
    await t.test(relativePath, (t) => {
      const root = makeSourceFixture(t);
      const generatedRoot = addGeneratedFixture(root);
      const path = join(
        generatedRoot,
        PRODUCT,
        `${PRODUCT} Extension/Resources`,
        relativePath,
      );
      writeFileSync(path, `${readFileSync(path, "utf8")}\n// stale generated fixture\n`);
      assert.throws(
        () => checkGeneratedReadiness({ root, generatedRoot }),
        /generated_resource_tree_invalid reason=changed count=1/u,
      );
    });
  }
});

test("generated readiness rejects unexpected, symbolic-link, and aliased resources", async (t) => {
  await t.test("missing extension resource", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    rmSync(join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/Resources/settings.mjs`,
    ));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=missing count=1/u,
    );
  });
  await t.test("unexpected resource", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    write(
      join(generatedRoot, PRODUCT, `${PRODUCT} Extension/Resources/unexpected.js`),
      "export const unexpected = true;\n",
    );
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=unexpected count=1/u,
    );
  });
  await t.test("resource symlink", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    const resource = join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/Resources/popup.mjs`,
    );
    unlinkSync(resource);
    symlinkSync(join(root, "extension/popup.mjs"), resource);
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=symlink count=1/u,
    );
  });
  await t.test("resource hard-link alias", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    const source = join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/Resources/background.js`,
    );
    const alias = join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/Resources/popup.mjs`,
    );
    unlinkSync(alias);
    linkSync(source, alias);
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=alias count=2/u,
    );
  });
});

test("generated readiness requires the exact Apple-generated resource contract", async (t) => {
  await t.test("missing generated icon", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    rmSync(join(generatedRoot, PRODUCT, PRODUCT, "Resources/Icon.png"));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=missing count=1/u,
    );
  });
  await t.test("unexpected Xcode metadata", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    write(
      join(generatedRoot, PRODUCT, `${PRODUCT}.xcodeproj/xcuserdata/unexpected.xcuserdatad`),
      "synthetic metadata\n",
    );
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_resource_tree_invalid reason=unexpected count=2/u,
    );
  });
});

test("generated readiness rejects ancestor symlinks outside the repository safely", (t) => {
  const root = makeSourceFixture(t);
  const generatedRoot = addGeneratedFixture(root);
  const ui = join(generatedRoot, PRODUCT, `${PRODUCT} Extension/Resources/ui`);
  const outside = mkdtempSync(join(tmpdir(), "tab-shelf-outside-generated-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  cpSync(ui, outside, { recursive: true });
  rmSync(ui, { recursive: true });
  symlinkSync(outside, ui, "dir");

  assert.throws(
    () => checkGeneratedReadiness({ root, generatedRoot }),
    (error) => {
      assert.match(error.message, /generated_resource_tree_invalid reason=symlink/u);
      assert.equal(error.message.includes(outside), false);
      return true;
    },
  );
});

test("generated readiness validates native Swift and the extension handler contract", async (t) => {
  await t.test("generated App networking", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    writeFileSync(
      join(generatedRoot, PRODUCT, PRODUCT, "AppDelegate.swift"),
      "import Network\nlet connection = NWConnection(host: \"example.invalid\", port: 443)\n",
    );
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_network_api_found/u,
    );
  });
  await t.test("generated extension networking", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    const handler = join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/SafariWebExtensionHandler.swift`,
    );
    writeFileSync(handler, `${SAFE_HANDLER}\nlet request = URLRequest(url: URL(string: \"https://example.invalid\")!)\n`);
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_network_api_found/u,
    );
  });
  await t.test("corrupt generated handler", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    const handler = join(
      generatedRoot,
      PRODUCT,
      `${PRODUCT} Extension/SafariWebExtensionHandler.swift`,
    );
    replace(handler, "context.completeRequest", "context.cancelRequest");
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_handler_invalid/u,
    );
  });
});

test("generated readiness rejects unexpected native product source", (t) => {
  const root = makeSourceFixture(t);
  const generatedRoot = addGeneratedFixture(root);
  write(
    join(generatedRoot, PRODUCT, PRODUCT, "UnexpectedController.swift"),
    "import Cocoa\nfinal class UnexpectedController {}\n",
  );
  assert.throws(
    () => checkGeneratedReadiness({ root, generatedRoot }),
    /generated_resource_tree_invalid reason=unexpected count=1/u,
  );
});

test("generated readiness rejects remote host resources and signing artifacts", async (t) => {
  await t.test("remote host resource", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    const path = join(generatedRoot, PRODUCT, PRODUCT, "Resources/Base.lproj/Main.html");
    replace(path, "</head>", '<script src="//assets.example.invalid/widget.js"></script></head>');
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /generated_remote_resource_found/u,
    );
  });
  await t.test("signing artifact", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    write(join(generatedRoot, PRODUCT, "export.p12"), "synthetic fixture only\n");
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /sensitive_artifacts_found count=1/u,
    );
  });
});

test("generated readiness rejects prohibited generated product text without disclosing it", (t) => {
  const root = makeSourceFixture(t);
  const generatedRoot = addGeneratedFixture(root);
  const term = String.fromCharCode(108, 101, 103, 97, 99, 121, 45, 109, 97, 114, 107, 101, 114);
  const termsPath = join(dirname(root), `${PRODUCT.toLowerCase().replaceAll(" ", "-")}-terms.txt`);
  writeFileSync(termsPath, `${term}\n`);
  t.after(() => rmSync(termsPath, { force: true }));
  const generatedBackground = join(
    generatedRoot,
    PRODUCT,
    `${PRODUCT} Extension/Resources/background.js`,
  );
  writeFileSync(
    generatedBackground,
    `${readFileSync(generatedBackground, "utf8")}\n// generated product ${term}\n`,
  );

  assert.throws(
    () => checkGeneratedReadiness({ root, generatedRoot, prohibitedTermsFile: termsPath }),
    (error) => {
      assert.match(error.message, /prohibited_terms_found count=1/u);
      assert.equal(error.message.includes(term), false);
      return true;
    },
  );
});
