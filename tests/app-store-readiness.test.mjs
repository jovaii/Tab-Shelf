import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  cpSync(join(root, "native/host"), join(container, PRODUCT, "Resources"), {
    recursive: true,
  });
  cpSync(
    join(root, "native/host/ViewController.swift"),
    join(container, PRODUCT, "ViewController.swift"),
  );
  cpSync(join(root, "extension"), join(container, `${PRODUCT} Extension/Resources`), {
    recursive: true,
  });
  write(join(container, `${PRODUCT} Extension/SafariWebExtensionHandler.swift`), "final class Handler {}\n");
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
    assert.throws(() => checkSourceReadiness({ root }), /Release version mismatch/u);
  });
  await t.test("native extension identifier", (t) => {
    const root = makeSourceFixture(t);
    replace(
      join(root, "native/host/ViewController.swift"),
      "com.jovaii.tabshelf.extension",
      "com.example.unexpected",
    );
    assert.throws(() => checkSourceReadiness({ root }), /native host extension identifier/u);
  });
});

test("source readiness rejects extra extension and host permissions", async (t) => {
  await t.test("extension permission", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "extension/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.permissions.push("bookmarks");
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /extension permissions/u);
  });
  await t.test("host permission", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "extension/manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.host_permissions = ["https://example.invalid/*"];
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /host permissions/u);
  });
});

test("source readiness rejects package dependencies and vendored trees", async (t) => {
  await t.test("dependency field", (t) => {
    const root = makeSourceFixture(t);
    const path = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.dependencies = { sample: "1.0.0" };
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => checkSourceReadiness({ root }), /Package dependencies are not allowed/u);
  });
  await t.test("vendored tree", (t) => {
    const root = makeSourceFixture(t);
    mkdirSync(join(root, "vendor"));
    assert.throws(() => checkSourceReadiness({ root }), /Dependency tree is not allowed/u);
  });
});

test("source readiness rejects remote embedded HTML resources", (t) => {
  const root = makeSourceFixture(t);
  replace(
    join(root, "extension/popup.html"),
    "</body>",
    '<script src="https://assets.example.invalid/widget.js"></script></body>',
  );
  assert.throws(() => checkSourceReadiness({ root }), /remote embedded resources/u);
});

test("source readiness rejects runtime network APIs", (t) => {
  const root = makeSourceFixture(t);
  writeFileSync(
    join(root, "extension/network.mjs"),
    'export const request = () => fetch("https://api.example.invalid/");\n',
  );
  assert.throws(() => checkSourceReadiness({ root }), /runtime network APIs/u);
});

test("source readiness requires legal files and all native host templates", async (t) => {
  await t.test("legal file", (t) => {
    const root = makeSourceFixture(t);
    rmSync(join(root, "NOTICE"));
    assert.throws(() => checkSourceReadiness({ root }), /required legal file/u);
  });
  await t.test("host template", (t) => {
    const root = makeSourceFixture(t);
    rmSync(join(root, "native/host/Script.js"));
    assert.throws(() => checkSourceReadiness({ root }), /required native host template/u);
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
      assert.match(error.message, /prohibited=1/u);
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
      /Tab Shelf Extension Release PRODUCT_BUNDLE_IDENTIFIER/u,
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
      /Tab Shelf Debug ENABLE_OUTGOING_NETWORK_CONNECTIONS/u,
    );
  });
  await t.test("marketing version", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      appRelease: { version: "1.0.1" },
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /Tab Shelf Release MARKETING_VERSION/u,
    );
  });
  await t.test("build number", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root, generatedProject({
      extensionDebug: { build: "2" },
    }));
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /Tab Shelf Extension Debug CURRENT_PROJECT_VERSION/u,
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
    /Tab Shelf Release ENABLE_APP_SANDBOX/u,
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
      /remote embedded resources/u,
    );
  });
  await t.test("signing artifact", (t) => {
    const root = makeSourceFixture(t);
    const generatedRoot = addGeneratedFixture(root);
    write(join(generatedRoot, PRODUCT, "export.p12"), "synthetic fixture only\n");
    assert.throws(
      () => checkGeneratedReadiness({ root, generatedRoot }),
      /signing or credential files=1/u,
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
  write(
    join(generatedRoot, PRODUCT, `${PRODUCT} Extension/Resources/prohibited.txt`),
    `generated product ${term}\n`,
  );

  assert.throws(
    () => checkGeneratedReadiness({ root, generatedRoot, prohibitedTermsFile: termsPath }),
    (error) => {
      assert.match(error.message, /prohibited=1/u);
      assert.equal(error.message.includes(term), false);
      return true;
    },
  );
});
