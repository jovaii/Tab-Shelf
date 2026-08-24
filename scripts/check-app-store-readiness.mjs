import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoDependencyTrees,
  countSensitiveArtifacts,
  inventoryTree,
  runAudit,
} from "./audit-repository.mjs";
import {
  readVerifiedRepositoryFile,
  resolveVerifiedRepositoryPath,
  validatePreparedProjectSettings,
} from "./prepare-macos-project.mjs";
import { RELEASE, validateReleaseVersions } from "./release-config.mjs";

const APPROVED_RELEASE = Object.freeze({
  productName: "Tab Shelf",
  version: "1.0.0",
  build: "1",
  appBundleIdentifier: "com.jovaii.tabshelf",
  extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
  appStorePriceUSD: 9.99,
  appStoreURL: "",
});
const REQUIRED_PERMISSIONS = Object.freeze(["storage", "tabs"]);
const LEGAL_FILES = Object.freeze(["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]);
const HOST_TEMPLATES = Object.freeze([
  "ViewController.swift",
  "Base.lproj/Main.html",
  "Style.css",
  "Script.js",
]);
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
const APPLE_PROJECT_FILES = Object.freeze([
  "project.pbxproj",
  "project.xcworkspace/contents.xcworkspacedata",
]);
const APPLE_PROJECT_DIRECTORIES = Object.freeze([
  "project.xcworkspace/xcshareddata/swiftpm/configuration",
]);
const REMOTE_EMBEDDED_RESOURCE = /<[^>]*(?:https?:)?\/\/[^>]*>/iu;
const REMOTE_CSS_RESOURCE = /(?:@import\s+(?:url\()?|url\()\s*["']?\s*(?:https?:)?\/\//iu;
const RUNTIME_NETWORK_API = /\b(?:EventSource|WebSocket|XMLHttpRequest|fetch)\s*\(|\bnavigator\.sendBeacon\s*\(/u;
const SWIFT_NETWORK_APIS = Object.freeze([
  /(?:^|\n)\s*import\s+(?:CFNetwork|Network)\b/u,
  /\b(?:CFHost|CFHTTPMessage|CFNetwork|NSURLConnection|NWBrowser|NWConnection|NWListener|NWPathMonitor|URLRequest|URLSession|URLSessionConfiguration|URLSessionTask)\b/u,
  /\b(?:Data|NSData|String)\s*\(\s*contentsOf\s*:/u,
]);
const SAFE_HANDLER_ANCHORS = Object.freeze([
  "import SafariServices",
  "SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling",
  "func beginRequest(with context: NSExtensionContext)",
  "context.completeRequest(",
]);

class ReadinessError extends Error {}

function fail(message) {
  throw new ReadinessError(message);
}

function countExact(source, value) {
  return source.split(value).length - 1;
}

function assertApprovedRelease() {
  const expectedKeys = Object.keys(APPROVED_RELEASE).sort();
  const actualKeys = Object.keys(RELEASE).sort();
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index]) ||
    expectedKeys.some((key) => RELEASE[key] !== APPROVED_RELEASE[key])
  ) {
    fail("source_release_tuple_invalid");
  }
}

function safeDirectory(root, candidate, scope, label) {
  try {
    return resolveVerifiedRepositoryPath({
      root,
      candidate,
      label,
      type: "directory",
    });
  } catch (error) {
    if (error instanceof ReadinessError) throw error;
    fail(`${scope}_path_invalid label=${label}`);
  }
}

function safeFile(root, candidate, scope, label) {
  try {
    const file = readVerifiedRepositoryFile({ root, candidate, label });
    if (file.contents.length === 0) fail(`${scope}_file_unavailable label=${label}`);
    return file;
  } catch (error) {
    if (error instanceof ReadinessError) throw error;
    fail(`${scope}_file_unavailable label=${label}`);
  }
}

function safeInventory(root, scope) {
  try {
    return inventoryTree({ root, excludedRoots: [] });
  } catch {
    fail(`${scope}_inventory_unavailable`);
  }
}

function readJSON(root, candidate, scope, label) {
  const source = safeFile(root, candidate, scope, label).contents.toString("utf8");
  try {
    return JSON.parse(source);
  } catch {
    fail(`${scope}_json_invalid label=${label}`);
  }
}

function validateManifest(manifest, scope) {
  if (manifest.name !== RELEASE.productName || manifest.short_name !== RELEASE.productName) {
    fail(`${scope}_identity_invalid`);
  }
  if (manifest.version !== RELEASE.version) fail(`${scope}_version_invalid`);
  const permissions = Array.isArray(manifest.permissions)
    ? [...manifest.permissions].sort()
    : [];
  if (
    permissions.length !== REQUIRED_PERMISSIONS.length ||
    permissions.some((permission, index) => permission !== REQUIRED_PERMISSIONS[index])
  ) {
    fail(`${scope}_extension_permissions_invalid`);
  }
  for (const field of ["host_permissions", "optional_host_permissions"]) {
    if (Object.hasOwn(manifest, field)) fail(`${scope}_host_permissions_invalid`);
  }
  for (const field of ["content_scripts", "externally_connectable", "optional_permissions"]) {
    if (Object.hasOwn(manifest, field)) fail(`${scope}_permission_surface_invalid`);
  }
  return permissions;
}

function assertNoTreeSymlinks(inventories, scope) {
  if (inventories.some((inventory) => inventory.some(({ type }) => type === "symlink"))) {
    fail(`${scope}_path_invalid label=product_tree`);
  }
  if (inventories.some((inventory) => inventory.some(({ type }) => type === "other"))) {
    fail(`${scope}_path_invalid label=product_tree`);
  }
}

function scanProductPolicy({ root, trees, scope }) {
  for (const tree of trees) {
    for (const entry of tree.inventory) {
      if (entry.type !== "file") continue;
      const extension = extname(entry.path).toLocaleLowerCase("en-US");
      if (![".css", ".html", ".js", ".mjs", ".swift"].includes(extension)) continue;
      const source = safeFile(
        root,
        join(tree.root, entry.path),
        scope,
        "product_source",
      ).contents.toString("utf8");
      if (extension === ".html" && REMOTE_EMBEDDED_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if ((extension === ".css" || extension === ".html") && REMOTE_CSS_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if ((extension === ".js" || extension === ".mjs") && RUNTIME_NETWORK_API.test(source)) {
        fail(`${scope}_network_api_found runtime network APIs`);
      }
      if (extension === ".swift" && SWIFT_NETWORK_APIS.some((pattern) => pattern.test(source))) {
        fail(`${scope}_network_api_found`);
      }
    }
  }
}

function translateAuditFailure(error, scope) {
  if (error instanceof ReadinessError) throw error;
  const message = typeof error?.message === "string" ? error.message : "";
  const sensitive = /signing or credential files=(\d+)/u.exec(message);
  if (sensitive) fail(`sensitive_artifacts_found count=${sensitive[1]}`);
  const prohibited = /prohibited=(\d+)/u.exec(message);
  if (prohibited && prohibited[1] !== "0") {
    fail(`prohibited_terms_found count=${prohibited[1]}`);
  }
  if (/Dependency tree|Package dependencies/u.test(message)) {
    fail(`${scope}_dependency_policy_invalid`);
  }
  if (/Prohibited terms file/u.test(message)) fail(`${scope}_prohibited_terms_unavailable`);
  if (/repository state|Inventory/u.test(message)) fail(`${scope}_repository_inventory_failed`);
  fail(`${scope}_audit_failed`);
}

function runSafeAudit(options, scope) {
  try {
    return runAudit(options);
  } catch (error) {
    translateAuditFailure(error, scope);
  }
}

function addExpectedDirectory(expected, path) {
  let current = path;
  while (current && current !== ".") {
    if (!expected.has(current)) expected.set(current, "directory");
    current = dirname(current);
  }
}

function addExpectedFile(expected, path) {
  expected.set(path, "file");
  addExpectedDirectory(expected, dirname(path));
}

function buildGeneratedContract(sourceExtensionInventory) {
  const expected = new Map();
  const container = RELEASE.productName;
  const app = join(container, RELEASE.productName);
  const extension = join(container, `${RELEASE.productName} Extension`);
  const project = join(container, `${RELEASE.productName}.xcodeproj`);
  addExpectedDirectory(expected, container);

  for (const path of APPLE_PROJECT_FILES) addExpectedFile(expected, join(project, path));
  for (const path of APPLE_PROJECT_DIRECTORIES) {
    addExpectedDirectory(expected, join(project, path));
  }
  for (const path of APPLE_APP_FILES) addExpectedFile(expected, join(app, path));
  for (const path of [
    "ViewController.swift",
    "Resources/Base.lproj/Main.html",
    "Resources/Style.css",
    "Resources/Script.js",
  ]) {
    addExpectedFile(expected, join(app, path));
  }
  addExpectedFile(expected, join(extension, "Info.plist"));
  addExpectedFile(expected, join(extension, "SafariWebExtensionHandler.swift"));
  addExpectedDirectory(expected, join(extension, "Resources"));
  for (const entry of sourceExtensionInventory) {
    const output = join(extension, "Resources", entry.path);
    expected.set(output, entry.type);
    addExpectedDirectory(expected, dirname(output));
  }
  return expected;
}

function validateGeneratedShape(inventory, expected) {
  const actual = new Map(inventory.map((entry) => [entry.path, entry]));
  const symlinks = inventory.filter(({ type }) => type === "symlink");
  if (symlinks.length > 0) {
    fail(`generated_resource_tree_invalid reason=symlink count=${symlinks.length}`);
  }
  const missing = [...expected].filter(([path]) => !actual.has(path));
  if (missing.length > 0) {
    fail(`generated_resource_tree_invalid reason=missing count=${missing.length}`);
  }
  const unexpected = inventory.filter(({ path }) => !expected.has(path));
  if (unexpected.length > 0) {
    fail(`generated_resource_tree_invalid reason=unexpected count=${unexpected.length}`);
  }
  const wrongType = inventory.filter(({ path, type }) => expected.get(path) !== type);
  if (wrongType.length > 0) {
    fail(`generated_resource_tree_invalid reason=type count=${wrongType.length}`);
  }
  const aliases = new Set(
    inventory
      .filter(({ type, links }) => type === "file" && links !== 1)
      .map(({ path }) => path),
  );
  const inodes = new Map();
  for (const entry of inventory.filter(({ type }) => type === "file")) {
    const key = `${entry.device}:${entry.inode}`;
    const first = inodes.get(key);
    if (first) {
      aliases.add(first);
      aliases.add(entry.path);
    } else {
      inodes.set(key, entry.path);
    }
  }
  if (aliases.size > 0) {
    fail(`generated_resource_tree_invalid reason=alias count=${aliases.size}`);
  }
}

function compareFiles(root, pairs) {
  let changed = 0;
  for (const [source, generated] of pairs) {
    const sourceContents = safeFile(root, source, "source", "product_source").contents;
    const generatedContents = safeFile(root, generated, "generated", "product_resource").contents;
    if (!sourceContents.equals(generatedContents)) changed += 1;
  }
  if (changed > 0) fail(`generated_resource_tree_invalid reason=changed count=${changed}`);
}

function validateGeneratedHandler(root, handlerPath) {
  const source = safeFile(root, handlerPath, "generated", "extension_handler")
    .contents.toString("utf8");
  if (SWIFT_NETWORK_APIS.some((pattern) => pattern.test(source))) {
    fail("generated_network_api_found");
  }
  const imports = [...source.matchAll(/^\s*import\s+([A-Za-z0-9_.]+)/gmu)]
    .map((match) => match[1]);
  if (imports.some((name) => !["SafariServices", "os.log"].includes(name))) {
    fail("generated_handler_invalid");
  }
  if (SAFE_HANDLER_ANCHORS.some((anchor) => countExact(source, anchor) !== 1)) {
    fail("generated_handler_invalid");
  }
}

function projectError(error) {
  const validation = error?.validation;
  if (validation) {
    const target = validation.target === RELEASE.productName ? "app" : "extension";
    fail(
      `generated_project_invalid target=${target} configuration=${validation.configuration} field=${validation.field}`,
    );
  }
  fail("generated_project_invalid");
}

export function checkSourceReadiness({
  root = process.cwd(),
  prohibitedTermsFile = process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
} = {}) {
  assertApprovedRelease();
  const repositoryRoot = safeDirectory(root, ".", "source", "repository_root").root;
  const extensionRoot = safeDirectory(
    repositoryRoot,
    "extension",
    "source",
    "extension_source",
  ).path;
  const hostRoot = safeDirectory(
    repositoryRoot,
    "native/host",
    "source",
    "native_host_template",
  ).path;
  const packageManifest = readJSON(
    repositoryRoot,
    "package.json",
    "source",
    "package_manifest",
  );
  const extensionManifest = readJSON(
    repositoryRoot,
    "extension/manifest.json",
    "source",
    "extension_manifest",
  );

  try {
    validateReleaseVersions({
      packageVersion: packageManifest.version,
      extensionVersion: extensionManifest.version,
    });
  } catch {
    fail("source_version_invalid");
  }
  const permissions = validateManifest(extensionManifest, "source");
  try {
    assertNoDependencyTrees(repositoryRoot);
  } catch {
    fail("source_dependency_policy_invalid");
  }
  for (const path of LEGAL_FILES) safeFile(repositoryRoot, path, "source", "legal_file");
  for (const path of HOST_TEMPLATES) {
    safeFile(repositoryRoot, join("native/host", path), "source", "native_host_template");
  }

  const controller = safeFile(
    repositoryRoot,
    "native/host/ViewController.swift",
    "source",
    "native_host_template",
  ).contents.toString("utf8");
  const identifier = `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`;
  if (countExact(controller, identifier) !== 1) fail("source_identity_invalid");

  const extensionInventory = safeInventory(extensionRoot, "source");
  const hostInventory = safeInventory(hostRoot, "source");
  assertNoTreeSymlinks([extensionInventory, hostInventory], "source");
  scanProductPolicy({
    root: repositoryRoot,
    trees: [
      { root: extensionRoot, inventory: extensionInventory },
      { root: hostRoot, inventory: hostInventory },
    ],
    scope: "source",
  });
  runSafeAudit({ root: repositoryRoot, prohibitedTermsFile }, "source");

  return Object.freeze({
    product: RELEASE.productName,
    version: RELEASE.version,
    build: RELEASE.build,
    dependencies: 0,
    permissions,
    appStoreURLPublished: false,
  });
}

export function checkGeneratedReadiness({
  root = process.cwd(),
  generatedRoot,
  prohibitedTermsFile = process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
} = {}) {
  assertApprovedRelease();
  const repositoryRoot = safeDirectory(root, ".", "generated", "repository_root").root;
  let generated;
  try {
    generated = resolveVerifiedRepositoryPath({
      root,
      candidate: generatedRoot,
      label: "generated_root",
      type: "directory",
    });
  } catch {
    fail("generated_root_invalid");
  }
  const generatedInventory = safeInventory(generated.path, "generated");
  const sensitiveCount = countSensitiveArtifacts(generatedInventory);
  if (sensitiveCount > 0) fail(`sensitive_artifacts_found count=${sensitiveCount}`);

  const sourceExtensionRoot = safeDirectory(
    repositoryRoot,
    "extension",
    "source",
    "extension_source",
  ).path;
  const sourceExtensionInventory = safeInventory(sourceExtensionRoot, "source");
  assertNoTreeSymlinks([sourceExtensionInventory], "source");
  const expected = buildGeneratedContract(sourceExtensionInventory);
  validateGeneratedShape(generatedInventory, expected);

  runSafeAudit({
    root: repositoryRoot,
    prohibitedTermsFile,
    productRoot: generated.path,
  }, "generated");

  const container = join(generated.path, RELEASE.productName);
  const appTarget = join(container, RELEASE.productName);
  const extensionTarget = join(container, `${RELEASE.productName} Extension`);
  const extensionResources = join(extensionTarget, "Resources");
  const appInventory = generatedInventory
    .filter(({ path }) => path.startsWith(`${RELEASE.productName}/${RELEASE.productName}/`))
    .map((entry) => Object.freeze({
      ...entry,
      path: entry.path.slice(`${RELEASE.productName}/${RELEASE.productName}/`.length),
    }));
  const extensionInventory = generatedInventory
    .filter(({ path }) => path.startsWith(`${RELEASE.productName}/${RELEASE.productName} Extension/`))
    .map((entry) => Object.freeze({
      ...entry,
      path: entry.path.slice(`${RELEASE.productName}/${RELEASE.productName} Extension/`.length),
    }));
  scanProductPolicy({
    root: repositoryRoot,
    trees: [
      { root: appTarget, inventory: appInventory },
      { root: extensionTarget, inventory: extensionInventory },
    ],
    scope: "generated",
  });

  const handlerPath = join(extensionTarget, "SafariWebExtensionHandler.swift");
  validateGeneratedHandler(repositoryRoot, handlerPath);
  const pairs = [];
  for (const entry of sourceExtensionInventory.filter(({ type }) => type === "file")) {
    pairs.push([
      join(sourceExtensionRoot, entry.path),
      join(extensionResources, entry.path),
    ]);
  }
  for (const [source, output] of [
    ["ViewController.swift", "ViewController.swift"],
    ["Base.lproj/Main.html", "Resources/Base.lproj/Main.html"],
    ["Style.css", "Resources/Style.css"],
    ["Script.js", "Resources/Script.js"],
  ]) {
    pairs.push([join(repositoryRoot, "native/host", source), join(appTarget, output)]);
  }
  compareFiles(repositoryRoot, pairs);

  const generatedManifest = readJSON(
    repositoryRoot,
    join(extensionResources, "manifest.json"),
    "generated",
    "extension_manifest",
  );
  validateManifest(generatedManifest, "generated");
  const projectPath = join(
    container,
    `${RELEASE.productName}.xcodeproj/project.pbxproj`,
  );
  const projectSource = safeFile(
    repositoryRoot,
    projectPath,
    "generated",
    "project_settings",
  ).contents.toString("utf8");
  let projectReport;
  try {
    projectReport = validatePreparedProjectSettings(projectSource);
  } catch (error) {
    projectError(error);
  }

  return Object.freeze({
    appBundleIdentifier: RELEASE.appBundleIdentifier,
    extensionBundleIdentifier: RELEASE.extensionBundleIdentifier,
    configurations: projectReport.configurations,
    networkEntitlement: projectReport.networkEntitlement,
  });
}

function successLine() {
  return `PASS app_store_ready product=${RELEASE.productName} version=${RELEASE.version} build=${RELEASE.build} network_entitlement=off secrets=0\n`;
}

function main(args) {
  if (args.length === 1 && args[0] === "--source-only") {
    checkSourceReadiness({ root: process.cwd() });
  } else if (args.length === 2 && args[0] === "--generated") {
    checkSourceReadiness({ root: process.cwd() });
    checkGeneratedReadiness({ root: process.cwd(), generatedRoot: args[1] });
  } else {
    fail("Usage: check-app-store-readiness.mjs --source-only | --generated <path>");
  }
  process.stdout.write(successLine());
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof ReadinessError
      ? error.message
      : "readiness_internal_error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
