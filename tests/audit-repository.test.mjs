import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertNoDependencyTrees,
  compareWholeFileHashes,
  scanTerms,
} from "../scripts/audit-repository.mjs";

function withTemporaryDirectory(run) {
  const root = mkdtempSync(join(tmpdir(), "tab-shelf-audit-test-"));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("reports prohibited text by digest without returning the text", () => {
  withTemporaryDirectory((root) => {
    writeFileSync(join(root, "sample.txt"), "A LEGACY-MARKER appears here.\n");

    const findings = scanTerms({
      root,
      files: ["sample.txt"],
      terms: ["legacy-marker"],
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, "sample.txt");
    assert.match(findings[0].termDigest, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(findings).includes("legacy-marker"), false);
  });
});

test("detects a complete tracked file copied from a comparison root", () => {
  withTemporaryDirectory((temporaryRoot) => {
    const candidateRoot = join(temporaryRoot, "candidate");
    const comparisonRoot = join(temporaryRoot, "comparison");
    mkdirSync(candidateRoot);
    mkdirSync(comparisonRoot);
    writeFileSync(join(candidateRoot, "module.mjs"), "export const value = 7;\n");
    writeFileSync(join(comparisonRoot, "different-name.js"), "export const value = 7;\n");
    assert.equal(spawnSync("git", ["init", "-q", candidateRoot]).status, 0);
    assert.equal(spawnSync("git", ["-C", candidateRoot, "add", "module.mjs"]).status, 0);

    const matches = compareWholeFileHashes({ candidateRoot, comparisonRoot });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].candidatePath, "module.mjs");
    assert.equal(matches[0].comparisonPath, "different-name.js");
  });
});

test("rejects a vendored dependency directory", () => {
  withTemporaryDirectory((root) => {
    mkdirSync(join(root, "node_modules"));

    assert.throws(() => assertNoDependencyTrees(root), /Dependency tree is not allowed/);
  });
});
