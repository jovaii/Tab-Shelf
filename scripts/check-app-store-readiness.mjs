import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoDependencyTrees,
  countSensitiveArtifacts,
  inventoryTree,
  runAudit,
  sha256,
} from "./audit-repository.mjs";
import { APP_STORE_RELEASE_PROFILE } from "./app-store-release-profile.mjs";
import {
  readVerifiedRepositoryFile,
  resolveVerifiedRepositoryPath,
  validatePreparedLegalResources,
  validatePreparedProjectProfile,
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
const APPLE_PROJECT_DIRECTORIES = Object.freeze([
  "project.xcworkspace/xcshareddata",
  "project.xcworkspace/xcshareddata/swiftpm",
  "project.xcworkspace/xcshareddata/swiftpm/configuration",
]);
const APPROVED_PROFILE_KEYS = Object.freeze([
  "artwork", "executableSourceDigests", "extensionTree", "generatedDirectories",
  "generatedFiles", "name", "safariConverter", "xcode",
]);
const APPROVED_XCODE_PROFILE = Object.freeze({
  version: "26.6",
  build: "17F113",
  objectVersion: "77",
  lastSwiftUpdateCheck: "2660",
  lastUpgradeCheck: "2660",
});
const APPROVED_PROFILE_SEAL = "623165eb5c1b38e52c548e6df677806ae5b6d7c01746b465250af8cdb987159d";
const APPROVED_EXTENSION_PATHS = Object.freeze([
  "background.js", "core", "core/classifier.mjs", "core/preferences.mjs", "core/tab-model.mjs",
  "core/workspace-actions.mjs", "core/workspace.mjs", "icons",
  "icons/icon-128.png", "icons/icon-16.png", "icons/icon-256.png", "icons/icon-32.png",
  "icons/icon-48.png", "icons/icon-512.png", "icons/icon-64.png", "icons/icon-96.png",
  "manifest.json", "platform", "platform/safari-gateway.mjs", "popup.css", "popup.html",
  "popup.mjs", "settings.css", "settings.html", "settings.mjs", "shared",
  "shared/tokens.css", "shelf.css", "shelf.html", "shelf.mjs", "ui", "ui/dom.mjs",
  "ui/shelf-view.mjs", "ui/site-accent.mjs", "ui/sortable-controller.mjs", "ui/theme-runtime.mjs",
]);
const APPROVED_GENERATED_PATHS = Object.freeze([
  "Tab Shelf/Tab Shelf Extension/Info.plist",
  "Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift",
  "Tab Shelf/Tab Shelf/AppDelegate.swift",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AccentColor.colorset/Contents.json",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/Contents.json",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png",
  "Tab Shelf/Tab Shelf/Assets.xcassets/Contents.json",
  "Tab Shelf/Tab Shelf/Assets.xcassets/LargeIcon.imageset/Contents.json",
  "Tab Shelf/Tab Shelf/Base.lproj/Main.storyboard",
  "Tab Shelf/Tab Shelf/Info.plist",
  "Tab Shelf/Tab Shelf/Resources/Icon.png",
  "Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
]);
const APPROVED_ARTWORK_PATHS = Object.freeze([
  "Tab Shelf/Tab Shelf/Resources/Icon.png",
  ...APPROVED_GENERATED_PATHS.filter((path) => path.endsWith(".png") && !path.endsWith("Resources/Icon.png")),
].sort());
const APPROVED_EXECUTABLE_PATHS = Object.freeze([
  "extension/background.js", "extension/core/classifier.mjs", "extension/core/preferences.mjs", "extension/core/tab-model.mjs",
  "extension/core/workspace-actions.mjs", "extension/core/workspace.mjs",
  "extension/platform/safari-gateway.mjs", "extension/popup.html", "extension/popup.mjs",
  "extension/settings.html", "extension/settings.mjs", "extension/shelf.html", "extension/shelf.mjs",
  "extension/ui/dom.mjs", "extension/ui/shelf-view.mjs", "extension/ui/site-accent.mjs",
  "extension/ui/sortable-controller.mjs", "extension/ui/theme-runtime.mjs",
  "native/host/Base.lproj/Main.html", "native/host/Script.js",
  "native/host/ViewController.swift",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf/AppDelegate.swift",
]);
const REMOTE_EMBEDDED_RESOURCE = /<[^>]*(?:https?:)?\/\/[^>]*>/iu;
const REMOTE_CSS_RESOURCE = /(?:@import\s+(?:url\()?|url\()\s*["']?\s*(?:https?:)?\/\//iu;
const RUNTIME_NETWORK_APIS = Object.freeze([
  /\b(?:EventSource|WebSocket|WebTransport|XMLHttpRequest|fetch|importScripts)\s*\(/u,
  /\b(?:globalThis|self|window)\s*(?:\.\s*|\[\s*["'])(?:EventSource|WebSocket|WebTransport|XMLHttpRequest|fetch|importScripts)(?:["']\s*\])?\s*\(/u,
  /\bnavigator\s*(?:\.\s*sendBeacon|\[\s*["']sendBeacon["']\s*\])\s*\(/u,
  /\b(?:RTCDataChannel|RTCPeerConnection)\s*\(/u,
]);
const SWIFT_NETWORK_APIS = Object.freeze([
  /(?:^|\n)\s*import\s+(?:CFNetwork|Darwin|Glibc|Network)\b/u,
  /\b(?:CFHost|CFHTTPMessage|CFNetwork|CFReadStreamCreateForHTTPRequest|CFReadStreamCreateForStreamedHTTPRequest|NSURLConnection|NWBrowser|NWConnection|NWListener|NWPathMonitor|URLRequest|URLSession|URLSessionConfiguration|URLSessionTask|URLSessionWebSocketTask)\b/u,
  /\b(?:InputStream|NSStream|OutputStream|Stream)\s*\.\s*getStreamsToHost\b/u,
  /\b(?:InputStream|OutputStream)\s*\([^)]*(?:host|url)\s*:/u,
  /\b(?:accept|bind|connect|getaddrinfo|gethostbyname|listen|recv|recvfrom|send|sendto|socket)\s*\(/u,
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

function sameKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function samePaths(value, expected) {
  if (!Array.isArray(value)) return false;
  const actual = [...value].sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((path, index) => path === wanted[index]);
}

function assertApprovedProfileShape() {
  const profile = APP_STORE_RELEASE_PROFILE;
  if (
    sha256(Buffer.from(JSON.stringify(profile))) !== APPROVED_PROFILE_SEAL ||
    !sameKeys(profile, APPROVED_PROFILE_KEYS) ||
    profile.name !== "xcode-26.6-safari-converter-26.6" ||
    !sameKeys(profile.xcode, Object.keys(APPROVED_XCODE_PROFILE)) ||
    Object.keys(APPROVED_XCODE_PROFILE).some((key) => profile.xcode[key] !== APPROVED_XCODE_PROFILE[key]) ||
    !sameKeys(profile.safariConverter, ["version"]) ||
    profile.safariConverter.version !== "26.6" ||
    !sameKeys(profile.extensionTree, APPROVED_EXTENSION_PATHS) ||
    !sameKeys(profile.generatedFiles, APPROVED_GENERATED_PATHS) ||
    !sameKeys(profile.executableSourceDigests, APPROVED_EXECUTABLE_PATHS) ||
    !samePaths(profile.generatedDirectories, APPLE_PROJECT_DIRECTORIES.map((path) => `Tab Shelf/Tab Shelf.xcodeproj/${path}`)) ||
    !samePaths(profile.artwork, APPROVED_ARTWORK_PATHS)
  ) fail("source_release_profile_invalid");
  for (const path of APPROVED_EXTENSION_PATHS) {
    const entry = profile.extensionTree[path];
    const expectedType = path === "core" || path === "icons" || path === "platform" || path === "shared" || path === "ui"
      ? "directory"
      : "file";
    if (!sameKeys(entry, expectedType === "file" ? ["digest", "modeClass", "type"] : ["modeClass", "type"]) ||
        entry.type !== expectedType || entry.modeClass !== expectedType ||
        (expectedType === "file" && !/^[a-f0-9]{64}$/u.test(entry.digest))) {
      fail("source_release_profile_invalid");
    }
  }
  for (const path of APPROVED_GENERATED_PATHS) {
    const entry = profile.generatedFiles[path];
    const keys = entry.png ? ["digest", "modeClass", "png", "template"] : ["digest", "modeClass", "template"];
    if (!sameKeys(entry, keys) || entry.template !== `native/release/xcode-26.6/${path}` ||
        entry.modeClass !== "file" || !/^[a-f0-9]{64}$/u.test(entry.digest)) {
      fail("source_release_profile_invalid");
    }
  }
}

function modeMatches(modeClass, mode) {
  if ((mode & 0o022) !== 0) return false;
  if (modeClass === "file") return (mode & 0o111) === 0;
  if (modeClass === "directory") return (mode & 0o100) !== 0;
  return false;
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

function safeFile(root, candidate, scope, label, expectedIdentity) {
  try {
    const file = readVerifiedRepositoryFile({
      root,
      candidate,
      label,
      expectedIdentity,
    });
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

function readJSON(root, candidate, scope, label, expectedIdentity) {
  const source = safeFile(root, candidate, scope, label, expectedIdentity).contents.toString("utf8");
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

function validatePinnedManifest(manifest) {
  const keys = [
    "action", "background", "chrome_url_overrides", "description", "icons",
    "manifest_version", "name", "permissions", "short_name", "version",
  ];
  if (!sameKeys(manifest, keys)) fail("source_extension_tree_invalid reason=manifest count=1");
  const references = [
    ...(Array.isArray(manifest.background?.scripts) ? manifest.background.scripts : []),
    ...Object.values(manifest.chrome_url_overrides ?? {}),
    manifest.action?.default_popup,
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...Object.values(manifest.icons ?? {}),
  ].filter((path) => typeof path === "string").sort();
  const expected = [
    "background.js", "icons/icon-128.png", "icons/icon-128.png", "icons/icon-16.png",
    "icons/icon-16.png", "icons/icon-256.png", "icons/icon-32.png", "icons/icon-32.png",
    "icons/icon-48.png", "icons/icon-48.png", "icons/icon-512.png", "icons/icon-64.png",
    "icons/icon-64.png", "icons/icon-96.png", "icons/icon-96.png",
    "popup.html", "shelf.html",
  ].sort();
  if (!samePaths(references, expected) || references.some((path) => !Object.hasOwn(APP_STORE_RELEASE_PROFILE.extensionTree, path))) {
    fail("source_extension_tree_invalid reason=manifest count=1");
  }
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
      if (![".cjs", ".css", ".htm", ".html", ".js", ".mjs", ".swift", ".xhtml"].includes(extension)) continue;
      const source = safeFile(
        root,
        join(tree.root, entry.path),
        scope,
        "product_source",
        entry,
      ).contents.toString("utf8");
      if ([".htm", ".html", ".xhtml"].includes(extension) && REMOTE_EMBEDDED_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if ([".css", ".htm", ".html", ".xhtml"].includes(extension) && REMOTE_CSS_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if (
        [".cjs", ".htm", ".html", ".js", ".mjs", ".xhtml"].includes(extension) &&
        RUNTIME_NETWORK_APIS.some((pattern) => pattern.test(source))
      ) {
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
  const leaf = path;
  let current = path;
  while (current && current !== ".") {
    if (!expected.has(current)) {
      expected.set(
        current,
        Object.freeze({ type: "directory", modeClass: "directory" }),
      );
    }
    current = dirname(current);
  }
}

function addExpectedFile(expected, path) {
  expected.set(path, Object.freeze({ type: "file", modeClass: "file" }));
  addExpectedDirectory(expected, dirname(path));
}

function buildGeneratedContract(sourceExtensionInventory) {
  const expected = new Map();
  const container = RELEASE.productName;
  const app = join(container, RELEASE.productName);
  const extension = join(container, `${RELEASE.productName} Extension`);
  const project = join(container, `${RELEASE.productName}.xcodeproj`);
  addExpectedDirectory(expected, container);

  addExpectedFile(expected, join(project, "project.pbxproj"));
  for (const path of APPLE_PROJECT_DIRECTORIES) {
    addExpectedDirectory(expected, join(project, path));
  }
  for (const [path, profile] of Object.entries(APP_STORE_RELEASE_PROFILE.generatedFiles)) {
    addExpectedFile(expected, path);
  }
  for (const [source, output] of [
    ["ViewController.swift", "ViewController.swift"],
    ["Base.lproj/Main.html", "Resources/Base.lproj/Main.html"],
    ["Style.css", "Resources/Style.css"],
    ["Script.js", "Resources/Script.js"],
  ]) {
    addExpectedFile(expected, join(app, output));
  }
  for (const legalFile of LEGAL_FILES) {
    addExpectedFile(expected, join(app, "Resources/Legal", legalFile));
  }
  addExpectedDirectory(expected, join(extension, "Resources"));
  for (const entry of sourceExtensionInventory) {
    const output = join(extension, "Resources", entry.path);
    expected.set(
      output,
      Object.freeze({ type: entry.type, modeClass: entry.type }),
    );
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
  const wrongType = inventory.filter(({ path, type }) => expected.get(path)?.type !== type);
  if (wrongType.length > 0) {
    fail(`generated_resource_tree_invalid reason=type count=${wrongType.length}`);
  }
  const wrongMode = inventory.filter(({ path, mode }) => !modeMatches(expected.get(path)?.modeClass, mode));
  if (wrongMode.length > 0) {
    fail(`generated_resource_tree_invalid reason=mode count=${wrongMode.length}`);
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

function validateExtensionTree(root, extensionRoot, inventory, { contents = true } = {}) {
  const expected = APP_STORE_RELEASE_PROFILE.extensionTree;
  const actual = new Map(inventory.map((entry) => [entry.path, entry]));
  const aliases = new Set();
  const inodes = new Map();
  for (const entry of inventory.filter(({ type }) => type === "file")) {
    if (entry.links !== 1) aliases.add(entry.path);
    const key = `${entry.device}:${entry.inode}`;
    const first = inodes.get(key);
    if (first) {
      aliases.add(first);
      aliases.add(entry.path);
    } else inodes.set(key, entry.path);
  }
  if (aliases.size > 0) fail(`source_extension_tree_invalid reason=alias count=${aliases.size}`);
  const symlinks = inventory.filter(({ type }) => type === "symlink");
  if (symlinks.length > 0) fail(`source_extension_tree_invalid reason=symlink count=${symlinks.length}`);
  const missing = Object.keys(expected).filter((path) => !actual.has(path));
  if (missing.length > 0) fail(`source_extension_tree_invalid reason=missing count=${missing.length}`);
  const unexpected = inventory.filter(({ path }) => !Object.hasOwn(expected, path));
  if (unexpected.length > 0) fail(`source_extension_tree_invalid reason=unexpected count=${unexpected.length}`);
  const wrongType = inventory.filter(({ path, type }) => expected[path]?.type !== type);
  if (wrongType.length > 0) fail(`source_extension_tree_invalid reason=type count=${wrongType.length}`);
  const wrongMode = inventory.filter(({ path, mode }) => !modeMatches(expected[path]?.modeClass, mode));
  if (wrongMode.length > 0) fail(`source_extension_tree_invalid reason=mode count=${wrongMode.length}`);
  if (!contents) return;
  let changed = 0;
  for (const [path, profile] of Object.entries(expected)) {
    if (profile.type !== "file") continue;
    const contents = safeFile(root, join(extensionRoot, path), "source", "extension_resource", actual.get(path)).contents;
    if (sha256(contents) !== profile.digest) changed += 1;
  }
  if (changed > 0) fail(`source_extension_tree_invalid reason=changed count=${changed}`);
}

function compareFiles(root, pairs) {
  let changed = 0;
  for (const { source, generated, sourceIdentity, generatedIdentity } of pairs) {
    const sourceContents = safeFile(
      root,
      source,
      "source",
      "product_source",
      sourceIdentity,
    ).contents;
    const generatedContents = safeFile(
      root,
      generated,
      "generated",
      "product_resource",
      generatedIdentity,
    ).contents;
    if (!sourceContents.equals(generatedContents)) changed += 1;
  }
  if (changed > 0) fail(`generated_resource_tree_invalid reason=changed count=${changed}`);
}

function validateGeneratedHandler(root, handlerPath, identity) {
  const source = safeFile(root, handlerPath, "generated", "extension_handler", identity)
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

function executableExtension(path) {
  return [".html", ".js", ".mjs", ".swift"].includes(
    extname(path).toLocaleLowerCase("en-US"),
  );
}

function validateSourceReleaseContent(root, trees) {
  const entries = new Map();
  for (const tree of trees) {
    for (const entry of tree.inventory) {
      if (entry.type !== "file" || !executableExtension(entry.path)) continue;
      entries.set(join(tree.prefix, entry.path), { ...entry, absoluteRoot: tree.root });
    }
  }
  const expected = APP_STORE_RELEASE_PROFILE.executableSourceDigests;
  const missing = Object.keys(expected).filter((path) => !entries.has(path));
  const unexpected = [...entries.keys()].filter((path) => !Object.hasOwn(expected, path));
  if (missing.length > 0) {
    fail(`source_release_content_invalid reason=missing count=${missing.length}`);
  }
  if (unexpected.length > 0) {
    fail(`source_release_content_invalid reason=unexpected count=${unexpected.length}`);
  }
  let changed = 0;
  for (const [path, digest] of Object.entries(expected)) {
    const entry = entries.get(path);
    const contents = safeFile(
      root,
      join(entry.absoluteRoot, entry.path),
      "source",
      "release_source",
      entry,
    ).contents;
    if (sha256(contents) !== digest) changed += 1;
  }
  if (changed > 0) fail(`source_release_content_invalid reason=changed count=${changed}`);
}

function validateSourceProductModes(inventories) {
  const changed = inventories.flat().filter(({ type, mode }) => {
    if (type === "file") return !modeMatches("file", mode);
    if (type === "directory") return !modeMatches("directory", mode);
    return false;
  });
  if (changed.length > 0) {
    fail(`source_release_content_invalid reason=mode count=${changed.length}`);
  }
}

function validateProfileTemplates(root) {
  for (const profile of Object.values(APP_STORE_RELEASE_PROFILE.generatedFiles)) {
    const contents = safeFile(root, profile.template, "source", "release_profile").contents;
    if (sha256(contents) !== profile.digest) fail("source_release_profile_invalid");
  }
}

function pngDimensions(contents) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    contents.length < 24 ||
    !contents.subarray(0, 8).equals(signature) ||
    contents.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return undefined;
  }
  return Object.freeze({
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  });
}

function validateGeneratedProfileFiles(root, generatedRoot, generatedEntries) {
  let executableChanged = 0;
  let profileChanged = 0;
  let invalidPng = 0;
  for (const [generatedPath, profile] of Object.entries(APP_STORE_RELEASE_PROFILE.generatedFiles)) {
    const profileContents = safeFile(root, profile.template, "source", "release_profile").contents;
    const generatedContents = safeFile(
      root,
      join(generatedRoot, generatedPath),
      "generated",
      "profile_resource",
      generatedEntries.get(generatedPath),
    ).contents;
    if (profile.png) {
      const dimensions = pngDimensions(generatedContents);
      if (
        !dimensions ||
        dimensions.width !== profile.png.width ||
        dimensions.height !== profile.png.height
      ) {
        invalidPng += 1;
        continue;
      }
    }
    if (!generatedContents.equals(profileContents)) {
      if (generatedPath.endsWith(".swift")) executableChanged += 1;
      else profileChanged += 1;
    }
  }
  if (invalidPng > 0) {
    fail(`generated_profile_content_invalid reason=png count=${invalidPng}`);
  }
  if (executableChanged > 0) {
    fail(`generated_release_content_invalid reason=changed count=${executableChanged}`);
  }
  if (profileChanged > 0) {
    fail(`generated_profile_content_invalid reason=changed count=${profileChanged}`);
  }
}

function validateGeneratedProfile(root, projectPath, projectIdentity, appInfoPath, appInfoIdentity) {
  const project = safeFile(
    root,
    projectPath,
    "generated",
    "project_profile",
    projectIdentity,
  ).contents.toString("utf8");
  const info = safeFile(
    root,
    appInfoPath,
    "generated",
    "converter_profile",
    appInfoIdentity,
  ).contents.toString("utf8");
  const expected = APPROVED_XCODE_PROFILE;
  try {
    validatePreparedProjectProfile(project, {
      objectVersion: expected.objectVersion,
      LastSwiftUpdateCheck: expected.lastSwiftUpdateCheck,
      LastUpgradeCheck: expected.lastUpgradeCheck,
    });
  } catch {
    fail("generated_profile_unsupported");
  }
  const withoutComments = info.replace(/<!--[\s\S]*?-->/gu, "");
  if (withoutComments.includes("<!--") || withoutComments.includes("-->")) {
    fail("generated_profile_unsupported");
  }
  const pairs = [...withoutComments.matchAll(/<key>\s*([^<]+?)\s*<\/key>\s*<string>\s*([^<]*?)\s*<\/string>/gu)];
  const converterPairs = pairs.filter((match) => match[1].trim() === "SFSafariWebExtensionConverterVersion");
  if (converterPairs.length !== 1 || converterPairs[0][2].trim() !== "26.6") {
    fail("generated_profile_unsupported");
  }
  return project;
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

function checkImmutableSourceGate(root) {
  assertApprovedRelease();
  assertApprovedProfileShape();
  const repositoryRoot = safeDirectory(root, ".", "source", "repository_root").root;
  const extensionRoot = safeDirectory(repositoryRoot, "extension", "source", "extension_source").path;
  const hostRoot = safeDirectory(repositoryRoot, "native/host", "source", "native_host_template").path;
  const releaseProfileRoot = safeDirectory(
    repositoryRoot,
    "native/release/xcode-26.6",
    "source",
    "release_profile",
  ).path;
  for (const path of HOST_TEMPLATES) {
    safeFile(repositoryRoot, join("native/host", path), "source", "native_host_template");
  }
  const extensionInventory = safeInventory(extensionRoot, "source");
  const hostInventory = safeInventory(hostRoot, "source");
  const releaseProfileInventory = safeInventory(releaseProfileRoot, "source");
  validateExtensionTree(repositoryRoot, extensionRoot, extensionInventory, { contents: false });
  assertNoTreeSymlinks([hostInventory, releaseProfileInventory], "source");
  validateSourceProductModes([hostInventory, releaseProfileInventory]);
  const extensionManifest = readJSON(
    repositoryRoot,
    "extension/manifest.json",
    "source",
    "extension_manifest",
    extensionInventory.find(({ path }) => path === "manifest.json"),
  );
  const permissions = validateManifest(extensionManifest, "source");
  scanProductPolicy({
    root: repositoryRoot,
    trees: [
      { root: extensionRoot, inventory: extensionInventory },
      { root: hostRoot, inventory: hostInventory },
      { root: releaseProfileRoot, inventory: releaseProfileInventory },
    ],
    scope: "source",
  });
  const controller = safeFile(
    repositoryRoot,
    "native/host/ViewController.swift",
    "source",
    "native_host_template",
  ).contents.toString("utf8");
  const identifier = `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`;
  if (countExact(controller, identifier) !== 1) fail("source_identity_invalid");
  validateExtensionTree(repositoryRoot, extensionRoot, extensionInventory);
  validatePinnedManifest(extensionManifest);
  validateProfileTemplates(repositoryRoot);
  validateSourceReleaseContent(repositoryRoot, [
    { prefix: "extension", root: extensionRoot, inventory: extensionInventory },
    { prefix: "native/host", root: hostRoot, inventory: hostInventory },
    { prefix: "native/release/xcode-26.6", root: releaseProfileRoot, inventory: releaseProfileInventory },
  ]);
  return Object.freeze({
    repositoryRoot,
    extensionRoot,
    hostRoot,
    releaseProfileRoot,
    extensionInventory,
    hostInventory,
    releaseProfileInventory,
    extensionManifest,
    permissions,
  });
}

export function checkSourceReadiness({
  root = process.cwd(),
  prohibitedTermsFile = process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
} = {}) {
  const gate = checkImmutableSourceGate(root);
  const { repositoryRoot, hostRoot, extensionManifest, permissions } = gate;
  const packageManifest = readJSON(
    repositoryRoot,
    "package.json",
    "source",
    "package_manifest",
  );

  try {
    validateReleaseVersions({
      packageVersion: packageManifest.version,
      extensionVersion: extensionManifest.version,
    });
  } catch {
    fail("source_version_invalid");
  }
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
  const gate = checkImmutableSourceGate(root);
  const {
    repositoryRoot,
    extensionRoot: sourceExtensionRoot,
    extensionInventory: sourceExtensionInventory,
    hostRoot: sourceHostRoot,
    hostInventory: sourceHostInventory,
  } = gate;
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

  const expected = buildGeneratedContract(sourceExtensionInventory);
  validateGeneratedShape(generatedInventory, expected);
  const generatedEntries = new Map(generatedInventory.map((entry) => [entry.path, entry]));

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
  validateGeneratedHandler(
    repositoryRoot,
    handlerPath,
    generatedEntries.get(join(RELEASE.productName, `${RELEASE.productName} Extension/SafariWebExtensionHandler.swift`)),
  );
  const pairs = [];
  for (const entry of sourceExtensionInventory.filter(({ type }) => type === "file")) {
    pairs.push({
      source: join(sourceExtensionRoot, entry.path),
      generated: join(extensionResources, entry.path),
      sourceIdentity: entry,
      generatedIdentity: generatedEntries.get(
        join(RELEASE.productName, `${RELEASE.productName} Extension/Resources`, entry.path),
      ),
    });
  }
  for (const [source, output] of [
    ["ViewController.swift", "ViewController.swift"],
    ["Base.lproj/Main.html", "Resources/Base.lproj/Main.html"],
    ["Style.css", "Resources/Style.css"],
    ["Script.js", "Resources/Script.js"],
  ]) {
    pairs.push({
      source: join(sourceHostRoot, source),
      generated: join(appTarget, output),
      sourceIdentity: sourceHostInventory.find((entry) => entry.path === source),
      generatedIdentity: generatedEntries.get(
        join(RELEASE.productName, RELEASE.productName, output),
      ),
    });
  }
  for (const legalFile of LEGAL_FILES) {
    pairs.push({
      source: join(repositoryRoot, legalFile),
      generated: join(appTarget, "Resources/Legal", legalFile),
      generatedIdentity: generatedEntries.get(
        join(RELEASE.productName, RELEASE.productName, "Resources/Legal", legalFile),
      ),
    });
  }
  compareFiles(repositoryRoot, pairs);

  const generatedManifest = readJSON(
    repositoryRoot,
    join(extensionResources, "manifest.json"),
    "generated",
    "extension_manifest",
    generatedEntries.get(join(RELEASE.productName, `${RELEASE.productName} Extension/Resources/manifest.json`)),
  );
  validateManifest(generatedManifest, "generated");
  const projectPath = join(
    container,
    `${RELEASE.productName}.xcodeproj/project.pbxproj`,
  );
  const projectRelative = join(
    RELEASE.productName,
    `${RELEASE.productName}.xcodeproj/project.pbxproj`,
  );
  const appInfoRelative = join(RELEASE.productName, RELEASE.productName, "Info.plist");
  const projectSource = validateGeneratedProfile(
    repositoryRoot,
    projectPath,
    generatedEntries.get(projectRelative),
    join(appTarget, "Info.plist"),
    generatedEntries.get(appInfoRelative),
  );
  validateGeneratedProfileFiles(repositoryRoot, generated.path, generatedEntries);
  let projectReport;
  try {
    projectReport = validatePreparedProjectSettings(projectSource);
    validatePreparedLegalResources(projectSource);
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
