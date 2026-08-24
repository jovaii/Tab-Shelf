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
        entry,
      ).contents.toString("utf8");
      if (extension === ".html" && REMOTE_EMBEDDED_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if ((extension === ".css" || extension === ".html") && REMOTE_CSS_RESOURCE.test(source)) {
        fail(`${scope}_remote_resource_found`);
      }
      if (
        (extension === ".html" || extension === ".js" || extension === ".mjs") &&
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

function addExpectedDirectory(expected, path, mode = 0o755) {
  const leaf = path;
  let current = path;
  while (current && current !== ".") {
    if (!expected.has(current)) {
      expected.set(
        current,
        Object.freeze({ type: "directory", mode: current === leaf ? mode : 0o755 }),
      );
    }
    current = dirname(current);
  }
}

function addExpectedFile(expected, path, mode = 0o644) {
  expected.set(path, Object.freeze({ type: "file", mode }));
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
    addExpectedDirectory(expected, join(project, path), 0o777);
  }
  for (const [path, profile] of Object.entries(APP_STORE_RELEASE_PROFILE.generatedFiles)) {
    addExpectedFile(expected, path, profile.mode);
  }
  for (const [source, output] of [
    ["ViewController.swift", "ViewController.swift"],
    ["Base.lproj/Main.html", "Resources/Base.lproj/Main.html"],
    ["Style.css", "Resources/Style.css"],
    ["Script.js", "Resources/Script.js"],
  ]) {
    addExpectedFile(expected, join(app, output), 0o644);
  }
  addExpectedDirectory(expected, join(extension, "Resources"));
  for (const entry of sourceExtensionInventory) {
    const output = join(extension, "Resources", entry.path);
    expected.set(
      output,
      Object.freeze({ type: entry.type, mode: entry.type === "file" ? 0o644 : 0o755 }),
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
  const wrongMode = inventory.filter(({ path, mode }) => expected.get(path)?.mode !== mode);
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
    if (type === "file") return mode !== 0o644;
    if (type === "directory") return mode !== 0o755;
    return false;
  });
  if (changed.length > 0) {
    fail(`source_release_content_invalid reason=mode count=${changed.length}`);
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
    const profileContents = safeFile(
      root,
      profile.template,
      "source",
      "release_profile",
    ).contents;
    if (sha256(profileContents) !== profile.digest) fail("source_release_profile_invalid");
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
  const expected = APP_STORE_RELEASE_PROFILE.xcode;
  try {
    validatePreparedProjectProfile(project, {
      objectVersion: expected.objectVersion,
      LastSwiftUpdateCheck: expected.lastSwiftUpdateCheck,
      LastUpgradeCheck: expected.lastUpgradeCheck,
    });
  } catch {
    fail("generated_profile_unsupported");
  }
  if (
    countExact(info, `<string>${APP_STORE_RELEASE_PROFILE.safariConverter.version}</string>`) !== 1
  ) fail("generated_profile_unsupported");
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
  const releaseProfileRoot = safeDirectory(
    repositoryRoot,
    "native/release/xcode-26.6",
    "source",
    "release_profile",
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
  const releaseProfileInventory = safeInventory(releaseProfileRoot, "source");
  assertNoTreeSymlinks(
    [extensionInventory, hostInventory, releaseProfileInventory],
    "source",
  );
  validateSourceProductModes([
    extensionInventory,
    hostInventory,
    releaseProfileInventory,
  ]);
  scanProductPolicy({
    root: repositoryRoot,
    trees: [
      { root: extensionRoot, inventory: extensionInventory },
      { root: hostRoot, inventory: hostInventory },
      { root: releaseProfileRoot, inventory: releaseProfileInventory },
    ],
    scope: "source",
  });
  validateSourceReleaseContent(repositoryRoot, [
    { prefix: "extension", root: extensionRoot, inventory: extensionInventory },
    { prefix: "native/host", root: hostRoot, inventory: hostInventory },
    {
      prefix: "native/release/xcode-26.6",
      root: releaseProfileRoot,
      inventory: releaseProfileInventory,
    },
  ]);
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
  const sourceHostRoot = safeDirectory(
    repositoryRoot,
    "native/host",
    "source",
    "native_host_template",
  ).path;
  const sourceHostInventory = safeInventory(sourceHostRoot, "source");
  assertNoTreeSymlinks([sourceHostInventory], "source");
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
