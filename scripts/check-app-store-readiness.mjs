import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoDependencyTrees,
  assertNoSensitiveTree,
  runAudit,
} from "./audit-repository.mjs";
import { validatePreparedProjectSettings } from "./prepare-macos-project.mjs";
import { RELEASE, validateReleaseVersions } from "./release-config.mjs";

const REQUIRED_PERMISSIONS = Object.freeze(["storage", "tabs"]);
const LEGAL_FILES = Object.freeze(["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]);
const HOST_TEMPLATES = Object.freeze([
  "ViewController.swift",
  "Base.lproj/Main.html",
  "Style.css",
  "Script.js",
]);
const REMOTE_EMBEDDED_RESOURCE = /\b(?:data|href|poster|src|srcset)\s*=\s*["']\s*(?:https?:)?\/\//iu;
const REMOTE_CSS_RESOURCE = /(?:@import\s+(?:url\()?|url\()\s*["']?\s*(?:https?:)?\/\//iu;
const RUNTIME_NETWORK_API = /\b(?:EventSource|WebSocket|XMLHttpRequest|fetch)\s*\(|\bnavigator\.sendBeacon\s*\(/u;

function isInside(parent, candidate) {
  const difference = relative(parent, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

function requireRoot(root) {
  const candidate = resolve(root);
  const status = lstatSync(candidate);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error("repository root must be a real directory");
  }
  return realpathSync(candidate);
}

function requireFile(root, path, label) {
  const candidate = resolve(root, path);
  if (!isInside(root, candidate)) throw new Error(`${label} escapes repository root`);
  let status;
  try {
    status = lstatSync(candidate);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`${label} is missing`);
    }
    throw error;
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real file`);
  }
  const contents = readFileSync(candidate);
  if (contents.length === 0) throw new Error(`${label} must not be empty`);
  return { path: realpathSync(candidate), contents };
}

function readJSON(root, path, label) {
  try {
    return JSON.parse(requireFile(root, path, label).contents.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} must contain valid JSON`);
    throw error;
  }
}

function countExact(source, value) {
  return source.split(value).length - 1;
}

function validateManifest(manifest, label) {
  if (manifest.name !== RELEASE.productName || manifest.short_name !== RELEASE.productName) {
    throw new Error(`${label} product name does not match release`);
  }
  if (manifest.version !== RELEASE.version) {
    throw new Error(`${label} version does not match release`);
  }
  const permissions = Array.isArray(manifest.permissions)
    ? [...manifest.permissions].sort()
    : [];
  if (
    permissions.length !== REQUIRED_PERMISSIONS.length ||
    permissions.some((permission, index) => permission !== REQUIRED_PERMISSIONS[index])
  ) {
    throw new Error(`${label} extension permissions must be exactly storage,tabs`);
  }
  for (const field of ["host_permissions", "optional_host_permissions"]) {
    if (Object.hasOwn(manifest, field)) {
      throw new Error(`${label} host permissions are not allowed`);
    }
  }
  for (const field of ["content_scripts", "externally_connectable", "optional_permissions"]) {
    if (Object.hasOwn(manifest, field)) {
      throw new Error(`${label} unexpected permission surface is not allowed`);
    }
  }
  return permissions;
}

function walkFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("product trees must not contain symbolic links");
    if (entry.isDirectory()) walkFiles(path, output);
    if (entry.isFile()) output.push(path);
  }
  return output;
}

function assertNoRemoteResources(directories) {
  for (const directory of directories) {
    for (const path of walkFiles(directory)) {
      const extension = path.slice(path.lastIndexOf(".")).toLocaleLowerCase("en-US");
      if (![".css", ".html", ".js", ".mjs"].includes(extension)) continue;
      const source = readFileSync(path, "utf8");
      if (extension === ".html" && REMOTE_EMBEDDED_RESOURCE.test(source)) {
        throw new Error("Product HTML contains remote embedded resources");
      }
      if ((extension === ".css" || extension === ".html") && REMOTE_CSS_RESOURCE.test(source)) {
        throw new Error("Product styles contain remote embedded resources");
      }
      if ((extension === ".js" || extension === ".mjs") && RUNTIME_NETWORK_API.test(source)) {
        throw new Error("Product runtime network APIs are not allowed");
      }
    }
  }
}

function requireDirectory(root, path, label) {
  const candidate = resolve(root, path);
  if (!isInside(root, candidate)) throw new Error(`${label} escapes repository root`);
  let status;
  try {
    status = lstatSync(candidate);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`${label} is missing`);
    }
    throw error;
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  return realpathSync(candidate);
}

export function checkSourceReadiness({
  root = process.cwd(),
  prohibitedTermsFile = process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
} = {}) {
  const repositoryRoot = requireRoot(root);
  const packageManifest = readJSON(repositoryRoot, "package.json", "package manifest");
  const extensionManifest = readJSON(
    repositoryRoot,
    "extension/manifest.json",
    "source extension manifest",
  );

  validateReleaseVersions({
    packageVersion: packageManifest.version,
    extensionVersion: extensionManifest.version,
  });
  const permissions = validateManifest(extensionManifest, "source extension manifest");
  assertNoDependencyTrees(repositoryRoot);

  for (const path of LEGAL_FILES) requireFile(repositoryRoot, path, "required legal file");
  for (const path of HOST_TEMPLATES) {
    requireFile(repositoryRoot, join("native/host", path), "required native host template");
  }

  const controller = requireFile(
    repositoryRoot,
    "native/host/ViewController.swift",
    "required native host template",
  ).contents.toString("utf8");
  const identifier = `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`;
  if (countExact(controller, identifier) !== 1) {
    throw new Error("native host extension identifier does not match release");
  }

  assertNoRemoteResources([
    requireDirectory(repositoryRoot, "extension", "extension source"),
    requireDirectory(repositoryRoot, "native/host", "native host source"),
  ]);
  runAudit({ root: repositoryRoot, prohibitedTermsFile });

  return Object.freeze({
    product: RELEASE.productName,
    version: RELEASE.version,
    build: RELEASE.build,
    dependencies: 0,
    permissions,
    appStoreURLPublished: RELEASE.appStoreURL.length > 0,
  });
}

function locateGeneratedProject(repositoryRoot, generatedRoot) {
  if (typeof generatedRoot !== "string" || generatedRoot.length === 0) {
    throw new Error("generated root is required");
  }
  const generatedCandidate = resolve(repositoryRoot, generatedRoot);
  let status;
  try {
    status = lstatSync(generatedCandidate);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error("generated root is missing");
    }
    throw error;
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error("generated root must be a real directory");
  }
  const resolvedGeneratedRoot = realpathSync(generatedCandidate);
  if (!isInside(repositoryRoot, resolvedGeneratedRoot)) {
    throw new Error("generated root must be inside repository root");
  }
  const projects = walkFiles(resolvedGeneratedRoot)
    .filter((path) => path.endsWith(`${sep}project.pbxproj`))
    .map((path) => resolve(path, ".."));
  if (projects.length !== 1) {
    throw new Error(`generated Xcode projects: expected 1, found ${projects.length}`);
  }
  const project = projects[0];
  if (!project.endsWith(".xcodeproj")) {
    throw new Error("generated project settings must belong to an Xcode project");
  }
  const container = realpathSync(resolve(project, ".."));
  const appTarget = requireDirectory(
    repositoryRoot,
    join(container, RELEASE.productName),
    "generated App target",
  );
  const extensionTarget = requireDirectory(
    repositoryRoot,
    join(container, `${RELEASE.productName} Extension`),
    "generated extension target",
  );
  return { resolvedGeneratedRoot, project, appTarget, extensionTarget };
}

export function checkGeneratedReadiness({
  root = process.cwd(),
  generatedRoot,
  prohibitedTermsFile = process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
} = {}) {
  const repositoryRoot = requireRoot(root);
  const generated = locateGeneratedProject(repositoryRoot, generatedRoot);
  assertNoSensitiveTree(generated.resolvedGeneratedRoot);

  const projectSource = requireFile(
    repositoryRoot,
    join(generated.project, "project.pbxproj"),
    "generated project settings",
  ).contents.toString("utf8");
  const projectReport = validatePreparedProjectSettings(projectSource);

  const generatedManifest = readJSON(
    repositoryRoot,
    join(generated.extensionTarget, "Resources/manifest.json"),
    "generated extension manifest",
  );
  validateManifest(generatedManifest, "generated extension manifest");
  const sourceManifest = readJSON(
    repositoryRoot,
    "extension/manifest.json",
    "source extension manifest",
  );
  if (JSON.stringify(generatedManifest) !== JSON.stringify(sourceManifest)) {
    throw new Error("generated extension manifest does not match source");
  }

  assertNoRemoteResources([
    requireDirectory(repositoryRoot, generated.appTarget, "generated App target"),
    requireDirectory(repositoryRoot, generated.extensionTarget, "generated extension target"),
  ]);

  const copies = [
    ["ViewController.swift", join(generated.appTarget, "ViewController.swift")],
    ["Base.lproj/Main.html", join(generated.appTarget, "Resources/Base.lproj/Main.html")],
    ["Style.css", join(generated.appTarget, "Resources/Style.css")],
    ["Script.js", join(generated.appTarget, "Resources/Script.js")],
  ];
  for (const [sourcePath, generatedPath] of copies) {
    const source = requireFile(
      repositoryRoot,
      join("native/host", sourcePath),
      "required native host template",
    ).contents;
    const output = requireFile(
      repositoryRoot,
      generatedPath,
      "generated native host template",
    ).contents;
    if (!source.equals(output)) throw new Error("generated native host template does not match source");
  }
  runAudit({
    root: repositoryRoot,
    prohibitedTermsFile,
    productRoot: generated.resolvedGeneratedRoot,
  });

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
    throw new Error("Usage: check-app-store-readiness.mjs --source-only | --generated <path>");
  }
  process.stdout.write(successLine());
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
