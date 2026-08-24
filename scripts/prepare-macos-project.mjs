import fs from "node:fs";
import {
  lstatSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { RELEASE } from "./release-config.mjs";

const COPYRIGHT = "Copyright 2026 James Li / Jovaii";
const GENERATED_SWIFT_IDENTIFIER =
  'let extensionBundleIdentifier = "com.jovaii.tabshelf.Extension"';
const TEMPLATE_ANCHORS = Object.freeze({
  "ViewController.swift": [
    [`let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`, 1, "release identifier"],
    [
      "final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {",
      1,
      "controller declaration",
    ],
    ["webView.loadFileURL(page, allowingReadAccessTo: resourceRoot)", 1, "local resource load"],
  ],
  "Main.html": [
    ["<!doctype html>", 1, "doctype"],
    ["<main>", 1, "anchor <main>"],
    ['src="../Icon.png"', 1, "generated icon reference"],
    ['<script src="../Script.js" defer></script>', 1, "local script reference"],
  ],
  "Style.css": [
    [":root {", 2, "root rules"],
    ['--font-ui: -apple-system, "Helvetica Neue", sans-serif;', 1, "system font stack"],
    ["@media (prefers-reduced-motion: reduce) {", 1, "reduced motion query"],
  ],
  "Script.js": [
    ["const approvedActions = new Set([", 1, "approved action set"],
    ["function showExtensionState(enabled, usesSettingsName) {", 1, "state function"],
    ["window.showExtensionState = showExtensionState;", 1, "bridge export"],
  ],
  "AppDelegate.swift": [
    ["@main", 1, "App entry point"],
    ["class AppDelegate: NSObject, NSApplicationDelegate", 1, "App delegate declaration"],
    ["applicationShouldTerminateAfterLastWindowClosed", 1, "window termination policy"],
  ],
  "SafariWebExtensionHandler.swift": [
    ["import SafariServices", 1, "Safari services import"],
    ["class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling", 1, "handler declaration"],
    ["func beginRequest(with context: NSExtensionContext)", 1, "request entry point"],
    ["context.completeRequest(", 1, "request completion"],
  ],
});

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

function collectGeneratedModeTargets(root) {
  const targets = [];
  const inodes = new Map();
  function walk(path) {
    const status = lstatSync(path);
    if (status.isSymbolicLink() || (!status.isDirectory() && !status.isFile())) {
      throw new Error("generated project contains an unsupported filesystem entry");
    }
    if (status.isFile()) {
      if (status.nlink !== 1) throw new Error("generated project contains a hard link");
      const key = `${status.dev}:${status.ino}`;
      if (inodes.has(key)) throw new Error("generated project contains an inode collision");
      inodes.set(key, path);
    }
    targets.push({
      path,
      device: status.dev,
      inode: status.ino,
      type: status.isDirectory() ? "directory" : "file",
      originalMode: status.mode & 0o777,
      desiredMode: status.isDirectory() ? 0o755 : 0o644,
    });
    if (status.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) walk(join(path, entry.name));
    }
  }
  walk(root);
  return targets;
}

function normalizeGeneratedModes(targets) {
  const changed = [];
  const restore = () => {
    for (const target of changed.slice().reverse()) fs.chmodSync(target.path, target.originalMode);
  };
  try {
    for (const target of targets) {
      const before = lstatSync(target.path);
      if (before.dev !== target.device || before.ino !== target.inode || before.isSymbolicLink() ||
          (target.type === "file") !== before.isFile() || (target.type === "directory") !== before.isDirectory()) {
        throw new Error("generated project changed during mode normalization");
      }
      if (target.originalMode === target.desiredMode) continue;
      fs.chmodSync(target.path, target.desiredMode);
      const after = lstatSync(target.path);
      if (after.dev !== target.device || after.ino !== target.inode ||
          (after.mode & 0o777) !== target.desiredMode) {
        throw new Error("generated project changed during mode normalization");
      }
      changed.push(target);
    }
    return restore;
  } catch (error) {
    restore();
    throw error;
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

function codeMask(source) {
  const mask = new Uint8Array(source.length);
  let state = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (character === '"') {
        state = "string";
      } else if (character === "/" && next === "*") {
        state = "block-comment";
        index += 1;
      } else if (character === "/" && next === "/") {
        state = "line-comment";
        index += 1;
      } else {
        mask[index] = 1;
      }
    } else if (state === "string") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        state = "code";
      }
    } else if (state === "block-comment" && character === "*" && next === "/") {
      state = "code";
      index += 1;
    } else if (state === "line-comment" && (character === "\n" || character === "\r")) {
      state = "code";
      mask[index] = 1;
    }
  }

  return mask;
}

function findClosingDelimiter(source, mask, openingIndex, opening, closing, label) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (!mask[index]) continue;
    if (source[index] === opening) depth += 1;
    if (source[index] !== closing) continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error(`${label} has an unclosed ${opening}`);
}

function parsePBXObjects(source) {
  const mask = codeMask(source);
  const objects = [];
  const start = /^[\t ]*([A-F0-9]{24})(?: \/\*[^\r\n]*\*\/)? = \{/gmu;
  for (const match of source.matchAll(start)) {
    const identifierIndex = match.index + match[0].indexOf(match[1]);
    if (!mask[identifierIndex]) continue;
    const openingIndex = match.index + match[0].lastIndexOf("{");
    const closingIndex = findClosingDelimiter(
      source,
      mask,
      openingIndex,
      "{",
      "}",
      `PBX object ${match[1]}`,
    );
    objects.push({
      id: match[1],
      start: openingIndex + 1,
      end: closingIndex,
      source: source.slice(openingIndex + 1, closingIndex),
      sourceOffset: openingIndex + 1,
    });
  }
  return { objects, mask };
}

function isDirectPosition(source, mask, position) {
  let braceDepth = 0;
  let parenthesisDepth = 0;
  for (let index = 0; index < position; index += 1) {
    if (!mask[index]) continue;
    if (source[index] === "{") braceDepth += 1;
    if (source[index] === "}") braceDepth -= 1;
    if (source[index] === "(") parenthesisDepth += 1;
    if (source[index] === ")") parenthesisDepth -= 1;
  }
  return braceDepth === 0 && parenthesisDepth === 0;
}

function directAssignments(object, key) {
  const mask = codeMask(object.source);
  const pattern = new RegExp(`^[\\t ]*${key} = ([^;\\r\\n]+);`, "gmu");
  return [...object.source.matchAll(pattern)]
    .filter((match) => {
      const keyIndex = match.index + match[0].indexOf(key);
      return mask[keyIndex] && isDirectPosition(object.source, mask, keyIndex);
    })
    .map((match) => match[1].trim());
}

function requireAssignment(object, key, label) {
  const values = directAssignments(object, key);
  if (values.length !== 1) {
    throw new Error(`${label} ${key}: expected 1, found ${values.length}`);
  }
  return values[0];
}

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function objectsWithIsa(objects, isa) {
  return objects.filter((object) => {
    const values = directAssignments(object, "isa");
    return values.length === 1 && values[0] === isa;
  });
}

function requireObjectById(objects, id, isa, label) {
  const candidates = objects.filter(
    (object) => object.id === id && objectsWithIsa([object], isa).length === 1,
  );
  if (candidates.length !== 1) {
    throw new Error(`${label}: expected one ${isa} object ${id}, found ${candidates.length}`);
  }
  return candidates[0];
}

function referencedObjectId(value, label) {
  const match = /^([A-F0-9]{24})(?:\s|$)/u.exec(value);
  if (!match) throw new Error(`${label} must reference one PBX object`);
  return match[1];
}

function configurationReferences(list, source, mask, label) {
  const pattern = /^[\t ]*buildConfigurations = \(/gmu;
  const listMask = codeMask(list.source);
  const matches = [...list.source.matchAll(pattern)].filter(
    (match) => {
      const localIndex = match.index + match[0].indexOf("buildConfigurations");
      return (
        mask[list.sourceOffset + localIndex] &&
        isDirectPosition(list.source, listMask, localIndex)
      );
    },
  );
  if (matches.length !== 1) {
    throw new Error(`${label} buildConfigurations: expected 1, found ${matches.length}`);
  }
  const openingIndex = list.sourceOffset + matches[0].index + matches[0][0].lastIndexOf("(");
  const closingIndex = findClosingDelimiter(source, mask, openingIndex, "(", ")", label);
  const contents = source.slice(openingIndex + 1, closingIndex);
  const contentsMask = codeMask(contents);
  return [...contents.matchAll(/[A-F0-9]{24}/gu)]
    .filter((match) => contentsMask[match.index])
    .map((match) => match[0]);
}

function buildSettingsRange(configuration, source, mask, label) {
  const pattern = /^[\t ]*buildSettings = \{/gmu;
  const configurationMask = codeMask(configuration.source);
  const matches = [...configuration.source.matchAll(pattern)].filter(
    (match) => {
      const localIndex = match.index + match[0].indexOf("buildSettings");
      return (
        mask[configuration.sourceOffset + localIndex] &&
        isDirectPosition(configuration.source, configurationMask, localIndex)
      );
    },
  );
  if (matches.length !== 1) {
    throw new Error(`${label} buildSettings: expected 1, found ${matches.length}`);
  }
  const openingIndex =
    configuration.sourceOffset + matches[0].index + matches[0][0].lastIndexOf("{");
  const closingIndex = findClosingDelimiter(source, mask, openingIndex, "{", "}", label);
  return { start: openingIndex + 1, end: closingIndex };
}

function transformSetting(dictionary, key, before, after, label) {
  const mask = codeMask(dictionary);
  const pattern = new RegExp(`^([\\t ]*${key} = )([^;\\r\\n]+)(;[\\t ]*)$`, "gmu");
  const matches = [...dictionary.matchAll(pattern)].filter(
    (match) => {
      const keyIndex = match.index + match[0].indexOf(key);
      return mask[keyIndex] && isDirectPosition(dictionary, mask, keyIndex);
    },
  );
  if (matches.length !== 1) {
    throw new Error(`${label} ${key}: expected 1, found ${matches.length}`);
  }
  const actual = matches[0][2].trim();
  if (actual !== before) {
    throw new Error(`${label} ${key}: expected ${before}, found ${actual}`);
  }
  const match = matches[0];
  return `${dictionary.slice(0, match.index)}${match[1]}${after}${match[3]}${dictionary.slice(match.index + match[0].length)}`;
}

function requireAbsentSetting(dictionary, key, label) {
  const mask = codeMask(dictionary);
  const pattern = new RegExp(`^[\\t ]*${key} = `, "gmu");
  const count = [...dictionary.matchAll(pattern)].filter(
    (match) => {
      const keyIndex = match.index + match[0].indexOf(key);
      return mask[keyIndex] && isDirectPosition(dictionary, mask, keyIndex);
    },
  ).length;
  if (count !== 0) throw new Error(`${label} ${key}: expected 0, found ${count}`);
}

function transformConfiguration(dictionary, target, configuration) {
  const label = `${target} ${configuration}`;
  let transformed = dictionary;
  transformed = transformSetting(
    transformed,
    "CURRENT_PROJECT_VERSION",
    "1",
    RELEASE.build,
    label,
  );
  transformed = transformSetting(transformed, "ENABLE_APP_SANDBOX", "YES", "YES", label);
  transformed = transformSetting(
    transformed,
    "INFOPLIST_KEY_NSHumanReadableCopyright",
    '""',
    `"${COPYRIGHT}"`,
    label,
  );
  transformed = transformSetting(
    transformed,
    "MARKETING_VERSION",
    "1.0",
    RELEASE.version,
    label,
  );

  if (target === RELEASE.productName) {
    transformed = transformSetting(
      transformed,
      "ENABLE_OUTGOING_NETWORK_CONNECTIONS",
      "YES",
      "NO",
      label,
    );
    transformed = transformSetting(
      transformed,
      "PRODUCT_BUNDLE_IDENTIFIER",
      '"com.jovaii.Tab-Shelf"',
      RELEASE.appBundleIdentifier,
      label,
    );
  } else {
    requireAbsentSetting(transformed, "ENABLE_OUTGOING_NETWORK_CONNECTIONS", label);
    transformed = transformSetting(
      transformed,
      "PRODUCT_BUNDLE_IDENTIFIER",
      "com.jovaii.tabshelf.Extension",
      RELEASE.extensionBundleIdentifier,
      label,
    );
  }
  return transformed;
}

function projectConfigurations(source) {
  const { objects, mask } = parsePBXObjects(source);
  const targets = objectsWithIsa(objects, "PBXNativeTarget");
  if (targets.length !== 2) {
    throw new Error(`native targets: expected 2, found ${targets.length}`);
  }

  const entries = [];
  for (const [targetName, productType] of [
    [RELEASE.productName, "com.apple.product-type.application"],
    [`${RELEASE.productName} Extension`, "com.apple.product-type.app-extension"],
  ]) {
    const namedTargets = targets.filter(
      (target) => unquote(requireAssignment(target, "name", "native target")) === targetName,
    );
    if (namedTargets.length !== 1) {
      throw new Error(`${targetName} native targets: expected 1, found ${namedTargets.length}`);
    }
    const target = namedTargets[0];
    const actualProductType = unquote(requireAssignment(target, "productType", targetName));
    if (actualProductType !== productType) {
      throw new Error(`${targetName} productType: expected ${productType}, found ${actualProductType}`);
    }
    const listId = referencedObjectId(
      requireAssignment(target, "buildConfigurationList", targetName),
      `${targetName} buildConfigurationList`,
    );
    const list = requireObjectById(objects, listId, "XCConfigurationList", targetName);
    const references = configurationReferences(list, source, mask, `${targetName} configurations`);
    if (references.length !== 2 || new Set(references).size !== 2) {
      throw new Error(`${targetName} configurations: expected Debug and Release exactly once`);
    }
    const configurations = references.map((id) =>
      requireObjectById(objects, id, "XCBuildConfiguration", `${targetName} configuration`),
    );
    const namedConfigurations = configurations.map((configuration) => ({
      configuration,
      name: unquote(requireAssignment(configuration, "name", `${targetName} configuration`)),
    }));
    if (
      namedConfigurations.filter(({ name }) => name === "Debug").length !== 1 ||
      namedConfigurations.filter(({ name }) => name === "Release").length !== 1
    ) {
      throw new Error(`${targetName} configurations: expected Debug and Release exactly once`);
    }

    for (const { configuration, name } of namedConfigurations) {
      const range = buildSettingsRange(configuration, source, mask, `${targetName} ${name}`);
      entries.push({
        target: targetName,
        configuration: name,
        ...range,
        contents: source.slice(range.start, range.end),
      });
    }
  }
  return entries;
}

function prepareProjectSettings(source) {
  const replacements = projectConfigurations(source).map((entry) => ({
    ...entry,
    contents: transformConfiguration(
      entry.contents,
      entry.target,
      entry.configuration,
    ),
  }));

  let prepared = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    prepared = `${prepared.slice(0, replacement.start)}${replacement.contents}${prepared.slice(replacement.end)}`;
  }
  return prepared;
}

function preparedSettingError(entry, key, expected, actual) {
  const error = new Error(
    `${entry.target} ${entry.configuration} ${key}: expected ${expected}, found ${actual}`,
  );
  error.validation = Object.freeze({
    target: entry.target,
    configuration: entry.configuration,
    field: key,
  });
  return error;
}

function requirePreparedSetting(entry, key, expected) {
  const dictionary = entry.contents;
  const values = directAssignments({ source: dictionary }, key);
  if (values.length !== 1 || values[0] !== expected) {
    const actual = values.length === 1 ? values[0] : `count ${values.length}`;
    throw preparedSettingError(entry, key, expected, actual);
  }
}

export function validatePreparedProjectSettings(source) {
  const configurations = projectConfigurations(source);
  for (const entry of configurations) {
    requirePreparedSetting(
      entry,
      "CURRENT_PROJECT_VERSION",
      RELEASE.build,
    );
    requirePreparedSetting(entry, "ENABLE_APP_SANDBOX", "YES");
    requirePreparedSetting(entry, "MARKETING_VERSION", RELEASE.version);

    if (entry.target === RELEASE.productName) {
      requirePreparedSetting(
        entry,
        "PRODUCT_BUNDLE_IDENTIFIER",
        RELEASE.appBundleIdentifier,
      );
      requirePreparedSetting(
        entry,
        "ENABLE_OUTGOING_NETWORK_CONNECTIONS",
        "NO",
      );
    } else {
      requirePreparedSetting(
        entry,
        "PRODUCT_BUNDLE_IDENTIFIER",
        RELEASE.extensionBundleIdentifier,
      );
      const networkValues = directAssignments(
        { source: entry.contents },
        "ENABLE_OUTGOING_NETWORK_CONNECTIONS",
      );
      if (networkValues.length !== 0) {
        throw preparedSettingError(
          entry,
          "ENABLE_OUTGOING_NETWORK_CONNECTIONS",
          "absent",
          `count ${networkValues.length}`,
        );
      }
    }
  }
  return Object.freeze({ configurations: configurations.length, networkEntitlement: "off" });
}

export function validatePreparedProjectProfile(source, expected) {
  const mask = codeMask(source);
  for (const [key, value] of Object.entries(expected)) {
    const pattern = new RegExp(`^[\\t ]*${key} = ([^;\\r\\n]+);`, "gmu");
    const values = [...source.matchAll(pattern)]
      .filter((match) => mask[match.index + match[0].indexOf(key)])
      .map((match) => match[1].trim());
    if (values.length !== 1 || values[0] !== value) {
      throw new Error(`generated project profile ${key} is unsupported`);
    }
  }
  return Object.freeze({ profile: "supported" });
}

function validateTemplate(label, contents) {
  if (contents.length === 0) throw new Error(`tracked ${label} must not be empty`);
  const source = contents.toString("utf8");
  for (const [anchor, count, anchorLabel] of TEMPLATE_ANCHORS[label]) {
    replaceExact(source, anchor, anchor, count, `tracked ${label} ${anchorLabel}`);
  }
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function matchesExpectedIdentity(status, expectedIdentity) {
  if (!expectedIdentity) return true;
  return (
    expectedIdentity.type === "file" &&
    status.dev === expectedIdentity.device &&
    status.ino === expectedIdentity.inode &&
    status.size === expectedIdentity.size &&
    (status.mode & 0o777) === expectedIdentity.mode
  );
}

function openVerifiedFile(path, label, { expectedIdentity, afterInspect } = {}) {
  const inspected = fs.lstatSync(path);
  if (inspected.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!inspected.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  if (!matchesExpectedIdentity(inspected, expectedIdentity)) {
    throw new Error(`${label} changed during validation: ${path}`);
  }
  afterInspect?.();

  let descriptor;
  try {
    descriptor = fs.openSync(
      path,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    throw new Error(
      `${label} changed during validation or is a symbolic link: ${error.message}`,
      { cause: error },
    );
  }

  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || !sameFile(inspected, opened)) {
      throw new Error(`${label} changed during validation: ${path}`);
    }
    if (opened.nlink !== 1) {
      throw new Error(`${label} must not be a hard link: found ${opened.nlink} links`);
    }
    return { descriptor, inspected: opened, label, path };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function openVerifiedFiles(entries) {
  const handles = new Map();
  try {
    for (const entry of entries) {
      if (!handles.has(entry.path)) {
        handles.set(entry.path, openVerifiedFile(entry.path, entry.label));
      }
    }

    const inodes = new Map();
    for (const handle of handles.values()) {
      const key = `${handle.inspected.dev}:${handle.inspected.ino}`;
      const collision = inodes.get(key);
      if (collision && collision.path !== handle.path) {
        throw new Error(`${handle.label} has an inode collision with ${collision.label}`);
      }
      inodes.set(key, handle);
    }
    return handles;
  } catch (error) {
    for (const handle of handles.values()) fs.closeSync(handle.descriptor);
    throw error;
  }
}

function revalidateHandle(handle) {
  let current;
  try {
    current = fs.lstatSync(handle.path);
  } catch (error) {
    throw new Error(`${handle.label} changed during validation: ${handle.path}`, { cause: error });
  }
  if (current.isSymbolicLink() || !current.isFile() || !sameFile(current, handle.inspected)) {
    throw new Error(`${handle.label} changed during validation: ${handle.path}`);
  }
  if (current.nlink !== 1) {
    throw new Error(`${handle.label} must not be a hard link: found ${current.nlink} links`);
  }
}

export function resolveVerifiedRepositoryPath({
  root = process.cwd(),
  candidate,
  label = "repository path",
  type,
}) {
  if (type !== "file" && type !== "directory") {
    throw new Error(`${label} type must be file or directory`);
  }
  const rootPath = resolve(root);
  requireType(rootPath, "repository root", "directory");
  const repositoryRoot = realpathSync(rootPath);
  const candidatePath = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(rootPath, candidate);
  const difference = relative(rootPath, candidatePath);
  if (
    difference === ".." ||
    difference.startsWith(`..${sep}`) ||
    isAbsolute(difference)
  ) {
    throw new Error(`${label} must be inside repository root`);
  }
  const canonicalCandidate = resolve(repositoryRoot, difference);
  return Object.freeze({
    root: repositoryRoot,
    path: resolveExistingInside(
      repositoryRoot,
      canonicalCandidate,
      label,
      type,
    ),
  });
}

export function readVerifiedRepositoryFile({
  root = process.cwd(),
  candidate,
  label = "repository file",
  expectedIdentity,
  afterInspect,
}) {
  const resolved = resolveVerifiedRepositoryPath({
    root,
    candidate,
    label,
    type: "file",
  });
  const handle = openVerifiedFile(resolved.path, label, { expectedIdentity, afterInspect });
  try {
    const contents = fs.readFileSync(handle.descriptor);
    revalidateHandle(handle);
    return Object.freeze({ ...resolved, contents });
  } finally {
    fs.closeSync(handle.descriptor);
  }
}

let temporarySequence = 0;

function unusedSibling(destination, kind) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    temporarySequence += 1;
    const candidate = join(
      dirname(destination),
      `.tab-shelf-${kind}-${process.pid}-${temporarySequence}`,
    );
    try {
      fs.lstatSync(candidate);
    } catch (error) {
      if (error.code === "ENOENT") return candidate;
      throw error;
    }
  }
  throw new Error(`unable to reserve a ${kind} path beside ${destination}`);
}

function unlinkTemporary(path) {
  if (!path) return;
  try {
    const status = fs.lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`temporary transaction path is unsafe: ${path}`);
    }
    fs.unlinkSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function stageOperation(operation) {
  const stage = unusedSibling(operation.destination, "stage");
  let descriptor;
  try {
    descriptor = fs.openSync(
      stage,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    fs.fchmodSync(descriptor, 0o644);
    fs.writeFileSync(descriptor, operation.contents);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return { ...operation, stage };
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    unlinkTemporary(stage);
    throw error;
  }
}

function commitTransaction(operations, allHandles) {
  for (const handle of allHandles.values()) revalidateHandle(handle);

  const staged = [];
  try {
    for (const operation of operations) staged.push(stageOperation(operation));
  } catch (error) {
    for (const operation of staged) unlinkTemporary(operation.stage);
    throw new Error(`transaction staging failed: ${error.message}`, { cause: error });
  }

  const committed = [];
  try {
    for (const operation of staged) {
      revalidateHandle(operation.handle);
      const backup = unusedSibling(operation.destination, "backup");
      fs.renameSync(operation.destination, backup);
      const record = { ...operation, backup, installed: false };
      committed.push(record);
      fs.renameSync(operation.stage, operation.destination);
      record.stage = undefined;
      record.installed = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const record of committed.reverse()) {
      try {
        fs.renameSync(record.backup, record.destination);
        record.backup = undefined;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    for (const operation of staged) {
      try {
        unlinkTemporary(operation.stage);
      } catch (cleanupError) {
        rollbackErrors.push(cleanupError.message);
      }
    }
    const rollbackMessage =
      rollbackErrors.length === 0 ? "" : `; rollback failed: ${rollbackErrors.join("; ")}`;
    throw new Error(`transaction failed: ${error.message}${rollbackMessage}`, { cause: error });
  }

  for (const record of committed) unlinkTemporary(record.backup);
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
  requireType(generatedCandidate, "generated root", "directory");
  const resolvedGeneratedRoot = realpathSync(generatedCandidate);
  requireInside(repositoryRoot, resolvedGeneratedRoot, "generated root");

  const projects = [];
  scanGeneratedTree(resolvedGeneratedRoot, projects);
  const generatedModeTargets = collectGeneratedModeTargets(resolvedGeneratedRoot);
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
  const releaseProfileRoot = resolveExistingInside(
    repositoryRoot,
    join(repositoryRoot, "native/release/xcode-26.6", RELEASE.productName),
    "tracked Xcode 26.6 release profile",
    "directory",
  );
  const copies = [
    {
      label: "ViewController.swift",
      source: join(hostRoot, "ViewController.swift"),
      destination: generatedController,
    },
    {
      label: "Main.html",
      source: join(hostRoot, "Base.lproj/Main.html"),
      destination: join(appTarget, "Resources/Base.lproj/Main.html"),
    },
    {
      label: "Style.css",
      source: join(hostRoot, "Style.css"),
      destination: join(appTarget, "Resources/Style.css"),
    },
    {
      label: "Script.js",
      source: join(hostRoot, "Script.js"),
      destination: join(appTarget, "Resources/Script.js"),
    },
    {
      label: "AppDelegate.swift",
      source: join(releaseProfileRoot, RELEASE.productName, "AppDelegate.swift"),
      destination: join(appTarget, "AppDelegate.swift"),
    },
    {
      label: "SafariWebExtensionHandler.swift",
      source: join(
        releaseProfileRoot,
        `${RELEASE.productName} Extension/SafariWebExtensionHandler.swift`,
      ),
      destination: join(extensionTarget, "SafariWebExtensionHandler.swift"),
    },
  ].map(({ label, source, destination }, index) => ({
    label,
    source: resolveExistingInside(
      repositoryRoot,
      source,
      `tracked host template ${index + 1}`,
      "file",
    ),
    destination: resolveExistingInside(
      repositoryRoot,
      destination,
      `generated host resource ${index + 1}`,
      "file",
    ),
  }));

  // Requiring the generated icon establishes that templates are copied into Apple's
  // existing Resources directory without replacing or relocating the icon.
  void icon;

  const fileEntries = [
    { path: projectSettings, label: "generated project settings" },
    { path: icon, label: "generated App icon" },
    ...copies.flatMap(({ label, source, destination }) => [
      { path: source, label: `tracked ${label}` },
      { path: destination, label: `generated ${label}` },
    ]),
  ];
  const handles = openVerifiedFiles(fileEntries);

  try {
    const preparedProject = prepareProjectSettings(
      fs.readFileSync(handles.get(projectSettings).descriptor, "utf8"),
    );
    const originalController = fs.readFileSync(
      handles.get(generatedController).descriptor,
      "utf8",
    );
    replaceExact(
      originalController,
      GENERATED_SWIFT_IDENTIFIER,
      `let extensionBundleIdentifier = "${RELEASE.extensionBundleIdentifier}"`,
      1,
      "generated Swift extension identifiers",
    );

    const preparedCopies = copies.map(({ label, source, destination }) => ({
      label,
      destination,
      contents: fs.readFileSync(handles.get(source).descriptor),
    }));
    for (const { label, contents } of preparedCopies) validateTemplate(label, contents);

    const restoreModes = normalizeGeneratedModes(generatedModeTargets);
    try {
      commitTransaction(
        [
        {
          destination: projectSettings,
          contents: Buffer.from(preparedProject),
          handle: handles.get(projectSettings),
        },
        ...preparedCopies.map(({ destination, contents }) => ({
          destination,
          contents,
          handle: handles.get(destination),
        })),
        ],
        handles,
      );
    } catch (error) {
      restoreModes();
      throw error;
    }
  } finally {
    for (const handle of handles.values()) fs.closeSync(handle.descriptor);
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
