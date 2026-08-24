import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  readVerifiedRepositoryFile,
  resolveVerifiedRepositoryPath,
} from "./prepare-macos-project.mjs";

const DEPENDENCY_DIRECTORIES = Object.freeze([
  "node_modules",
  "vendor",
  "Pods",
  "Carthage",
]);
const SENSITIVE_EXTENSIONS = new Set([
  ".cer",
  ".ipa",
  ".mobileprovision",
  ".p12",
  ".provisionprofile",
  ".xcarchive",
]);
const SENSITIVE_FILENAME_PATTERNS = Object.freeze([
  /^\.env(?:\.[a-z0-9_-]+)?$/u,
  /^authkey_[a-z0-9]+\.p8$/u,
  /^(?:app[-_ ]?store[-_ ]?connect|asc)[-_ ](?:api[-_ ]?key|credentials?)\.(?:json|p8)$/u,
  /^exportoptions\.plist$/u,
]);
const REPOSITORY_INVENTORY_EXCLUSIONS = Object.freeze([
  ".git",
  ".superpowers",
  ".worktrees",
  "artifacts/qa",
  "build",
  "dist",
  "native/generated",
  ...DEPENDENCY_DIRECTORIES,
]);

function isMissing(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

function assertRealDirectory(path, label) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  return realpathSync(absolute);
}

function assertRealFile(path, label) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real file`);
  }
  return absolute;
}

function resolveContainedFile(root, path) {
  return resolveVerifiedRepositoryPath({
    root,
    candidate: path,
    label: "audit input",
    type: "file",
  }).path;
}

function readAuditFile({ root, path, expectedIdentity, auditHooks }) {
  try {
    return readVerifiedRepositoryFile({
      root,
      candidate: path,
      label: "audit file",
      expectedIdentity,
      afterInspect: () => auditHooks?.afterFileInspect?.({ path }),
    }).contents;
  } catch (error) {
    throw new Error("Audit file changed during validation", { cause: error });
  }
}

function runGit(root, args, encoding = "buffer") {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });
  if (result.status !== 0) throw new Error("Unable to inspect repository state");
  return result.stdout;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function listTrackedFiles(root) {
  const output = runGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  return [...new Set(output.toString("utf8").split("\0").filter(Boolean))]
    .filter((path) => {
      try {
        resolveContainedFile(root, path);
        return true;
      } catch (error) {
        if (isMissing(error) || isMissing(error?.cause)) return false;
        throw error;
      }
    })
    .sort();
}

function normalizeInventoryPath(path) {
  const normalized = path.split(sep).join("/").replace(/^\.\//u, "").replace(/\/$/u, "");
  if (
    normalized.length === 0 ||
    isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error("Inventory exclusion must be repository-relative");
  }
  return normalized;
}

function isExcluded(path, exclusions) {
  return exclusions.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function sameInventoryIdentity(left, right) {
  return (
    left.isDirectory() &&
    !left.isSymbolicLink() &&
    right.isDirectory() &&
    !right.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
}

export function inventoryTree({ root, excludedRoots = [], auditHooks } = {}) {
  const treeRoot = assertRealDirectory(root, "Inventory root");
  const exclusions = [...new Set(excludedRoots.map(normalizeInventoryPath))].sort();
  const inventory = [];

  function walk(directory, path, inspected) {
    let entries;
    try {
      const before = lstatSync(directory);
      if (!sameInventoryIdentity(inspected, before)) {
        throw new Error("Inventory tree changed during validation");
      }
      auditHooks?.beforeDirectoryRead?.({ path });
      const ready = lstatSync(directory);
      if (!sameInventoryIdentity(inspected, ready)) {
        throw new Error("Inventory tree changed during validation");
      }
      entries = readdirSync(directory, { withFileTypes: true });
      const after = lstatSync(directory);
      if (!sameInventoryIdentity(inspected, after)) {
        throw new Error("Inventory tree changed during validation");
      }
    } catch (error) {
      if (error?.message === "Inventory tree changed during validation") throw error;
      throw new Error("Inventory tree is unavailable", { cause: error });
    }
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const childPath = relative(treeRoot, absolute).split(sep).join("/");
      if (isExcluded(childPath, exclusions)) continue;
      let status;
      try {
        auditHooks?.beforeChildLookup?.({ path });
        const beforeChild = lstatSync(directory);
        if (!sameInventoryIdentity(inspected, beforeChild)) {
          throw new Error("Inventory tree changed during validation");
        }
        status = lstatSync(absolute);
        const afterChild = lstatSync(directory);
        if (!sameInventoryIdentity(inspected, afterChild)) {
          throw new Error("Inventory tree changed during validation");
        }
      } catch (error) {
        if (error?.message === "Inventory tree changed during validation") throw error;
        throw new Error("Inventory entry is unavailable", { cause: error });
      }
      const type = status.isSymbolicLink()
        ? "symlink"
        : status.isDirectory()
          ? "directory"
          : status.isFile()
            ? "file"
            : "other";
      inventory.push(Object.freeze({
        path: childPath,
        type,
        device: status.dev,
        inode: status.ino,
        links: status.nlink,
        size: status.size,
        mode: status.mode & 0o777,
      }));
      if (type === "directory") {
        try {
          const beforeDescent = lstatSync(directory);
          if (!sameInventoryIdentity(inspected, beforeDescent)) {
            throw new Error("Inventory tree changed during validation");
          }
        } catch (error) {
          if (error?.message === "Inventory tree changed during validation") throw error;
          throw new Error("Inventory tree is unavailable", { cause: error });
        }
        walk(absolute, childPath, status);
      }
    }
    try {
      const afterRecursion = lstatSync(directory);
      if (!sameInventoryIdentity(inspected, afterRecursion)) {
        throw new Error("Inventory tree changed during validation");
      }
    } catch (error) {
      if (error?.message === "Inventory tree changed during validation") throw error;
      throw new Error("Inventory tree is unavailable", { cause: error });
    }
  }

  walk(treeRoot, "", lstatSync(treeRoot));
  return Object.freeze(inventory.sort((left, right) => left.path.localeCompare(right.path, "en")));
}

function repositorySensitiveInventory(root) {
  const repositoryRoot = assertRealDirectory(root, "Repository root");
  const inventory = new Set(
    inventoryTree({
      root: repositoryRoot,
      excludedRoots: REPOSITORY_INVENTORY_EXCLUSIONS,
    }).map(({ path }) => path),
  );
  const gitPaths = runGit(
    repositoryRoot,
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  ).toString("utf8").split("\0").filter(Boolean);
  for (const path of gitPaths) inventory.add(path.split(sep).join("/"));
  return [...inventory].sort();
}

function isSensitiveName(name) {
  const lowerName = name.toLocaleLowerCase("en-US");
  if (lowerName === ".env.example" || lowerName === ".env.sample") return false;
  if ([...SENSITIVE_EXTENSIONS].some((extension) => lowerName.endsWith(extension))) {
    return true;
  }
  return SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(lowerName));
}

function isSensitivePath(path) {
  return path.split("/").some((component) => isSensitiveName(basename(component)));
}

function sensitiveFindings(inventory) {
  const findings = [];
  for (const path of inventory.filter(isSensitivePath).sort()) {
    if (!findings.some((finding) => path.startsWith(`${finding}/`))) findings.push(path);
  }
  return findings;
}

export function countSensitiveArtifacts(inventory) {
  return sensitiveFindings(
    inventory.map((entry) => typeof entry === "string" ? entry : entry.path),
  ).length;
}

export function assertNoSensitiveRepositoryFiles(root) {
  const count = sensitiveFindings(repositorySensitiveInventory(root)).length;
  if (count > 0) {
    throw new Error(`Sensitive repository audit failed: signing or credential files=${count}`);
  }
  return 0;
}

export function assertNoSensitiveTree(root) {
  const count = sensitiveFindings(
    inventoryTree({ root, excludedRoots: [".git"] }).map(({ path }) => path),
  ).length;
  if (count > 0) {
    throw new Error(`Sensitive tree audit failed: signing or credential files=${count}`);
  }
  return 0;
}

function scanText(path, content, normalizedTerms) {
  const normalizedContent = content
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  const findings = [];
  for (const term of normalizedTerms) {
    if (term && normalizedContent.includes(term)) {
      findings.push({ path, termDigest: sha256(term) });
    }
  }
  return findings;
}

export function scanTerms({ root, files, terms, identities, auditHooks }) {
  const normalizedTerms = [...new Set(terms.map((term) => term
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")))]
    .filter(Boolean);
  const findings = [];
  for (const path of files) {
    const content = readAuditFile({
      root,
      path,
      expectedIdentity: identities?.get(path),
      auditHooks,
    });
    findings.push(...scanText(path, content.toString("utf8"), normalizedTerms));
  }
  return findings;
}

export function hashFiles({ root, files, identities, auditHooks }) {
  const hashes = new Map();
  for (const path of files) {
    const digest = sha256(readAuditFile({
      root,
      path,
      expectedIdentity: identities?.get(path),
      auditHooks,
    }));
    const paths = hashes.get(digest) ?? [];
    paths.push(path);
    hashes.set(digest, paths);
  }
  return hashes;
}

export function compareWholeFileHashes({ candidateRoot, comparisonRoot }) {
  const candidate = hashFiles({
    root: candidateRoot,
    files: listTrackedFiles(candidateRoot),
  });
  const comparisonInventory = inventoryTree({ root: comparisonRoot, excludedRoots: [".git"] });
  const comparisonFiles = comparisonInventory.filter(({ type }) => type === "file");
  const comparison = hashFiles({
    root: comparisonRoot,
    files: comparisonFiles.map(({ path }) => path),
    identities: new Map(comparisonFiles.map((entry) => [entry.path, entry])),
  });
  const matches = [];
  for (const [digest, candidatePaths] of candidate) {
    const comparisonPaths = comparison.get(digest) ?? [];
    for (const candidatePath of candidatePaths) {
      for (const comparisonPath of comparisonPaths) {
        matches.push({ digest, candidatePath, comparisonPath });
      }
    }
  }
  return matches;
}

export function assertNoDependencyTrees(root) {
  for (const name of DEPENDENCY_DIRECTORIES) {
    try {
      lstatSync(resolve(root, name));
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    throw new Error(`Dependency tree is not allowed: ${name}`);
  }
  const packageFile = resolve(root, "package.json");
  try {
    lstatSync(packageFile);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  try {
    const manifest = JSON.parse(readAuditFile({
      root,
      path: "package.json",
    }).toString("utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (Object.keys(manifest[field] ?? {}).length > 0) {
        throw new Error(`Package dependencies are not allowed: ${field}`);
      }
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function readTerms(path) {
  if (!path) return [];
  const absolute = assertRealFile(path, "Prohibited terms file");
  try {
    return readAuditFile({
      root: resolve(absolute, ".."),
      path: basename(absolute),
    }).toString("utf8")
      .split(/\r?\n/u)
      .map((term) => term.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error("Prohibited terms file is unavailable", { cause: error });
  }
}

function scanCommitMetadata(root, terms) {
  if (terms.length === 0) return [];
  const metadata = runGit(root, ["log", "--all", "--format=%an%n%ae%n%B%x00"], "utf8");
  const normalizedTerms = terms.map((term) => term.normalize("NFKC").toLocaleLowerCase("en-US"));
  return scanText("<git-history>", metadata, normalizedTerms);
}

export function runAudit({
  root,
  prohibitedTermsFile,
  comparisonRoot,
  productRoot,
}) {
  const repositoryRoot = assertRealDirectory(root, "Repository root");
  const terms = readTerms(prohibitedTermsFile);
  assertNoDependencyTrees(repositoryRoot);
  assertNoSensitiveRepositoryFiles(repositoryRoot);
  const files = listTrackedFiles(repositoryRoot);

  const findings = scanTerms({ root: repositoryRoot, files, terms });
  findings.push(...scanCommitMetadata(repositoryRoot, terms));

  if (productRoot) {
    const absoluteProductRoot = assertRealDirectory(productRoot, "Product root");
    const productInventory = inventoryTree({ root: absoluteProductRoot, excludedRoots: [] });
    if (productInventory.some(({ type }) => type === "symlink" || type === "other")) {
      throw new Error("Audit product tree contains unsupported entries");
    }
    const productFiles = productInventory.filter(({ type }) => type === "file");
    findings.push(...scanTerms({
      root: absoluteProductRoot,
      files: productFiles.map(({ path }) => path),
      identities: new Map(productFiles.map((entry) => [entry.path, entry])),
      terms,
    }));
  }

  const equalFiles = comparisonRoot
    ? compareWholeFileHashes({
        candidateRoot: repositoryRoot,
        comparisonRoot: assertRealDirectory(comparisonRoot, "Comparison root"),
      })
    : [];

  if (findings.length > 0 || equalFiles.length > 0) {
    throw new Error(
      `Independent release audit failed: prohibited=${findings.length} whole_file_matches=${equalFiles.length}`,
    );
  }

  return Object.freeze({
    trackedFiles: files.length,
    dependencyCount: 0,
    sensitiveFiles: 0,
    prohibitedMatches: 0,
    wholeFileMatches: 0,
  });
}

function main() {
  const report = runAudit({
    root: process.cwd(),
    prohibitedTermsFile: process.env.TAB_SHELF_PROHIBITED_TERMS_FILE,
    comparisonRoot: process.env.TAB_SHELF_COMPARISON_ROOT,
    productRoot: process.env.TAB_SHELF_PRODUCT_ROOT,
  });
  process.stdout.write(
    `PASS product=Tab Shelf tracked_files=${report.trackedFiles} dependencies=0 prohibited=0 whole_file_matches=0\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
