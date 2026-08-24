import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RELEASE } from "./release-config.mjs";

const COPYRIGHT = "Copyright 2026 James Li / Jovaii";
const GENERATED_APP_IDENTIFIER = 'PRODUCT_BUNDLE_IDENTIFIER = "com.jovaii.Tab-Shelf";';
const GENERATED_EXTENSION_IDENTIFIER =
  "PRODUCT_BUNDLE_IDENTIFIER = com.jovaii.tabshelf.Extension;";
const GENERATED_SWIFT_IDENTIFIER =
  'let extensionBundleIdentifier = "com.jovaii.tabshelf.Extension"';

export function replaceExact(source, before, after, expectedCount, label) {
  const actual = source.split(before).length - 1;
  if (actual !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount}, found ${actual}`);
  }
  return source.split(before).join(after);
}

function isInside(parent, candidate) {
  const difference = relative(parent, candidate);
  return (
    difference === "" ||
    (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
  );
}

function requireInside(parent, candidate, label) {
  if (!isInside(parent, candidate)) {
    throw new Error(`${label} must be inside repository root`);
  }
}

function requireType(path, label, type) {
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    throw new Error(`${label} is missing: ${path}`, { cause: error });
  }

  if (status.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (type === "directory" && !status.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
  if (type === "file" && !status.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function requireNoSymlinkComponents(parent, candidate, label) {
  requireInside(parent, candidate, label);
  const difference = relative(parent, candidate);
  if (difference === "") return;

  let current = parent;
  for (const component of difference.split(sep)) {
    current = join(current, component);
    let status;
    try {
      status = lstatSync(current);
    } catch (error) {
      throw new Error(`${label} is missing: ${current}`, { cause: error });
    }
    if (status.isSymbolicLink()) {
      throw new Error(`${label} crosses a symbolic link: ${current}`);
    }
  }
}

function resolveExistingInside(parent, candidate, label, type) {
  requireNoSymlinkComponents(parent, candidate, label);
  requireType(candidate, label, type);
  const resolved = realpathSync(candidate);
  requireInside(parent, resolved, label);
  return resolved;
}

function scanGeneratedTree(directory, projects) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`generated project contains a symbolic link: ${path}`);
    }
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(".xcodeproj")) {
      projects.push(path);
    }
    scanGeneratedTree(path, projects);
  }
}

function requireOneTarget(projectContainer, targetName, label) {
  const count = readdirSync(projectContainer, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name === targetName,
  ).length;
  if (count !== 1) {
    throw new Error(`${label}: expected 1, found ${count}`);
  }
  return join(projectContainer, targetName);
}

function validatePreparedProject(source) {
  const expectedValues = [
    [
      `PRODUCT_BUNDLE_IDENTIFIER = ${RELEASE.appBundleIdentifier};`,
      2,
      "prepared App bundle identifiers",
    ],
    [
      `PRODUCT_BUNDLE_IDENTIFIER = ${RELEASE.extensionBundleIdentifier};`,
      2,
      "prepared extension bundle identifiers",
    ],
    ["ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;", 2, "prepared outgoing network settings"],
    ["ENABLE_APP_SANDBOX = YES;", 4, "App Sandbox build settings"],
    [`MARKETING_VERSION = ${RELEASE.version};`, 4, "prepared marketing versions"],
    [`CURRENT_PROJECT_VERSION = ${RELEASE.build};`, 4, "prepared build versions"],
    [COPYRIGHT, 4, "prepared copyright settings"],
  ];

  for (const [value, count, label] of expectedValues) {
    replaceExact(source, value, value, count, label);
  }
}

function validateGeneratedProjectStructure(source) {
  const exactValues = [
    ["isa = PBXNativeTarget;", 2, "native targets"],
    ['productType = "com.apple.product-type.application";', 1, "native App targets"],
    [
      'productType = "com.apple.product-type.app-extension";',
      1,
      "native extension targets",
    ],
    ["PRODUCT_BUNDLE_IDENTIFIER = ", 4, "bundle identifier setting keys"],
    ["ENABLE_OUTGOING_NETWORK_CONNECTIONS = ", 2, "outgoing network setting keys"],
    ["ENABLE_APP_SANDBOX = ", 4, "App Sandbox setting keys"],
    ["MARKETING_VERSION = ", 4, "marketing version setting keys"],
    ["CURRENT_PROJECT_VERSION = ", 4, "build version setting keys"],
    [
      "INFOPLIST_KEY_NSHumanReadableCopyright = ",
      4,
      "copyright setting keys",
    ],
  ];

  for (const [value, count, label] of exactValues) {
    replaceExact(source, value, value, count, label);
  }
}

export function prepareMacOSProject({ root = process.cwd(), generatedRoot } = {}) {
  if (typeof generatedRoot !== "string" || generatedRoot.length === 0) {
    throw new Error("generated root is required");
  }

  const rootPath = resolve(root);
  requireType(rootPath, "repository root", "directory");
  const repositoryRoot = realpathSync(rootPath);
  const generatedCandidate = resolve(rootPath, generatedRoot);
  requireInside(rootPath, generatedCandidate, "generated root");
  requireNoSymlinkComponents(rootPath, generatedCandidate, "generated root");
  const resolvedGeneratedRoot = realpathSync(generatedCandidate);
  requireInside(repositoryRoot, resolvedGeneratedRoot, "generated root");

  const projects = [];
  scanGeneratedTree(resolvedGeneratedRoot, projects);
  if (projects.length !== 1) {
    throw new Error(`generated Xcode projects: expected 1, found ${projects.length}`);
  }

  const project = resolveExistingInside(
    repositoryRoot,
    projects[0],
    "generated Xcode project",
    "directory",
  );
  const projectContainer = resolveExistingInside(
    repositoryRoot,
    resolve(project, ".."),
    "generated project container",
    "directory",
  );
  const appTarget = resolveExistingInside(
    repositoryRoot,
    requireOneTarget(projectContainer, RELEASE.productName, "generated App targets"),
    "generated App target",
    "directory",
  );
  const extensionTarget = resolveExistingInside(
    repositoryRoot,
    requireOneTarget(
      projectContainer,
      `${RELEASE.productName} Extension`,
      "generated extension targets",
    ),
    "generated extension target",
    "directory",
  );

  const projectSettings = resolveExistingInside(
    repositoryRoot,
    join(project, "project.pbxproj"),
    "generated project settings",
    "file",
  );
  const generatedController = resolveExistingInside(
    repositoryRoot,
    join(appTarget, "ViewController.swift"),
    "generated App view controller",
    "file",
  );
  const icon = resolveExistingInside(
    repositoryRoot,
    join(appTarget, "Resources/Icon.png"),
    "generated App icon",
    "file",
  );

  const hostRoot = resolveExistingInside(
    repositoryRoot,
    join(repositoryRoot, "native/host"),
    "tracked host templates",
    "directory",
  );
  const copies = [
    [join(hostRoot, "ViewController.swift"), generatedController],
    [
      join(hostRoot, "Base.lproj/Main.html"),
      join(appTarget, "Resources/Base.lproj/Main.html"),
    ],
    [join(hostRoot, "Style.css"), join(appTarget, "Resources/Style.css")],
    [join(hostRoot, "Script.js"), join(appTarget, "Resources/Script.js")],
  ].map(([source, destination], index) => [
    resolveExistingInside(repositoryRoot, source, `tracked host template ${index + 1}`, "file"),
    resolveExistingInside(repositoryRoot, destination, `generated host resource ${index + 1}`, "file"),
  ]);

  // Requiring the generated icon establishes that templates are copied into Apple's
  // existing Resources directory without replacing or relocating the icon.
  void icon;

  let preparedProject = readFileSync(projectSettings, "utf8");
  validateGeneratedProjectStructure(preparedProject);
  preparedProject = replaceExact(
    preparedProject,
    GENERATED_APP_IDENTIFIER,
    `PRODUCT_BUNDLE_IDENTIFIER = ${RELEASE.appBundleIdentifier};`,
    2,
    "generated App bundle identifiers",
  );
  preparedProject = replaceExact(
    preparedProject,
    GENERATED_EXTENSION_IDENTIFIER,
    `PRODUCT_BUNDLE_IDENTIFIER = ${RELEASE.extensionBundleIdentifier};`,
    2,
    "generated extension bundle identifiers",
  );
  preparedProject = replaceExact(
    preparedProject,
    "ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;",
    "ENABLE_OUTGOING_NETWORK_CONNECTIONS = NO;",
    2,
    "outgoing network build settings",
  );
  preparedProject = replaceExact(
    preparedProject,
    "MARKETING_VERSION = 1.0;",
    `MARKETING_VERSION = ${RELEASE.version};`,
    4,
    "generated marketing versions",
  );
  preparedProject = replaceExact(
    preparedProject,
    "CURRENT_PROJECT_VERSION = 1;",
    `CURRENT_PROJECT_VERSION = ${RELEASE.build};`,
    4,
    "generated build versions",
  );
  preparedProject = replaceExact(
    preparedProject,
    'INFOPLIST_KEY_NSHumanReadableCopyright = "";',
    `INFOPLIST_KEY_NSHumanReadableCopyright = "${COPYRIGHT}";`,
    4,
    "generated copyright settings",
  );

  const originalController = readFileSync(generatedController, "utf8");
  replaceExact(
    originalController,
    GENERATED_SWIFT_IDENTIFIER,
    `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`,
    1,
    "generated Swift extension identifiers",
  );

  const preparedCopies = copies.map(([source, destination]) => ({
    destination,
    contents: readFileSync(source),
  }));
  const controllerTemplate = preparedCopies.find(
    ({ destination }) => destination === generatedController,
  ).contents.toString("utf8");
  replaceExact(
    controllerTemplate,
    `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`,
    `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`,
    1,
    "tracked Swift extension identifiers",
  );
  validatePreparedProject(preparedProject);

  writeFileSync(projectSettings, preparedProject);
  for (const { destination, contents } of preparedCopies) {
    writeFileSync(destination, contents);
  }

  return Object.freeze({ project, appTarget, extensionTarget });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    prepareMacOSProject({ generatedRoot: process.argv[2] });
  } catch (error) {
    process.stderr.write(`Tab Shelf project preparation stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
