import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const DEPENDENCY_DIRECTORIES = Object.freeze([
  "node_modules",
  "vendor",
  "Pods",
  "Carthage",
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
  return absolute;
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
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, path);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("Audit path escapes its root");
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Audit inputs must be regular files");
  }
  return absolute;
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
  return [...new Set(output.toString("utf8").split("\0").filter(Boolean))].sort();
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

function walkFiles(root, directory = root, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("Audit roots must not contain symbolic links");
    }
    if (entry.isDirectory()) {
      if (entry.name !== ".git") walkFiles(root, absolute, output);
    } else if (entry.isFile()) {
      output.push(relative(root, absolute).split(sep).join("/"));
    }
  }
  return output.sort();
}

export function compareWholeFileHashes({ candidateRoot, comparisonRoot }) {
  const candidate = hashFiles({
    root: candidateRoot,
    files: listTrackedFiles(candidateRoot),
  });
  const comparison = hashFiles({
    root: comparisonRoot,
    files: walkFiles(comparisonRoot),
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
  const metadata = runGit(root, ["log", "--format=%an%n%ae%n%B%x00"], "utf8");
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
  const files = listTrackedFiles(repositoryRoot);
  const terms = readTerms(prohibitedTermsFile);
  assertNoDependencyTrees(repositoryRoot);

  const findings = scanTerms({ root: repositoryRoot, files, terms });
  findings.push(...scanCommitMetadata(repositoryRoot, terms));

  if (productRoot) {
    const absoluteProductRoot = assertRealDirectory(productRoot, "Product root");
    const productFiles = walkFiles(absoluteProductRoot);
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
