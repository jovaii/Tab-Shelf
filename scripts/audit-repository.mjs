import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

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
  const absoluteRoot = assertRealDirectory(root, "Audit root");
  const absolute = resolve(absoluteRoot, path);
  const difference = relative(absoluteRoot, absolute);
  if (
    difference === ".." ||
    difference.startsWith(`..${sep}`) ||
    isAbsolute(difference)
  ) {
    throw new Error("Audit path escapes its root");
  }
  let current = absoluteRoot;
  for (const component of difference.split(sep).filter(Boolean)) {
    current = resolve(current, component);
    const componentStatus = lstatSync(current);
    if (componentStatus.isSymbolicLink()) {
      throw new Error("Audit inputs must not cross symbolic links");
    }
  }
  const stat = lstatSync(current);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Audit inputs must be regular files");
  }
  const resolved = realpathSync(current);
  const resolvedDifference = relative(absoluteRoot, resolved);
  if (
    resolvedDifference === ".." ||
    resolvedDifference.startsWith(`..${sep}`) ||
    isAbsolute(resolvedDifference)
  ) {
    throw new Error("Audit path escapes its root");
  }
  return resolved;
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
        if (isMissing(error)) return false;
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

export function inventoryTree({ root, excludedRoots = [] }) {
  const treeRoot = assertRealDirectory(root, "Inventory root");
  const exclusions = [...new Set(excludedRoots.map(normalizeInventoryPath))].sort();
  const inventory = [];

  function walk(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error("Inventory tree is unavailable", { cause: error });
    }
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const path = relative(treeRoot, absolute).split(sep).join("/");
      if (isExcluded(path, exclusions)) continue;
      let status;
      try {
        status = lstatSync(absolute);
      } catch (error) {
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
        path,
        type,
        device: status.dev,
        inode: status.ino,
        links: status.nlink,
        size: status.size,
      }));
      if (type === "directory") walk(absolute);
    }
  }

  walk(treeRoot);
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

export function scanTerms({ root, files, terms }) {
  const normalizedTerms = [...new Set(terms.map((term) => term
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")))]
    .filter(Boolean);
  const findings = [];
  for (const path of files) {
    const absolute = resolveContainedFile(root, path);
    findings.push(...scanText(path, readFileSync(absolute).toString("utf8"), normalizedTerms));
  }
  return findings;
}

export function hashFiles({ root, files }) {
  const hashes = new Map();
  for (const path of files) {
    const digest = sha256(readFileSync(resolveContainedFile(root, path)));
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
  const comparison = hashFiles({
    root: comparisonRoot,
    files: inventoryTree({ root: comparisonRoot, excludedRoots: [".git"] })
      .filter(({ type }) => type === "file")
      .map(({ path }) => path),
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
    const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
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
  return readFileSync(assertRealFile(path, "Prohibited terms file"), "utf8")
    .split(/\r?\n/u)
    .map((term) => term.trim())
    .filter(Boolean);
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
    const productFiles = productInventory
      .filter(({ type }) => type === "file")
      .map(({ path }) => path);
    findings.push(...scanTerms({ root: absoluteProductRoot, files: productFiles, terms }));
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
