import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertNoDependencyTrees,
  assertNoSensitiveRepositoryFiles,
  compareWholeFileHashes,
  listTrackedFiles,
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

test("ignores tracked files deleted from the current working tree", () => {
  withTemporaryDirectory((root) => {
    writeFileSync(join(root, "kept.txt"), "kept\n");
    writeFileSync(join(root, "removed.txt"), "removed\n");
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "add", "kept.txt", "removed.txt"]).status, 0);
    unlinkSync(join(root, "removed.txt"));

    assert.deepEqual(listTrackedFiles(root), ["kept.txt"]);
  });
});

test("rejects a vendored dependency directory", () => {
  withTemporaryDirectory((root) => {
    mkdirSync(join(root, "node_modules"));

    assert.throws(() => assertNoDependencyTrees(root), /Dependency tree is not allowed/);
  });
});

test("rejects tracked and untracked signing or credential artifacts without disclosing them", () => {
  withTemporaryDirectory((root) => {
    writeFileSync(join(root, ".gitignore"), ".env\n");
    writeFileSync(join(root, ".env"), "SYNTHETIC_TEST_VALUE=not-a-secret\n");
    writeFileSync(join(root, "export.p12"), "synthetic fixture only\n");
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "add", ".gitignore"]).status, 0);

    assert.throws(
      () => assertNoSensitiveRepositoryFiles(root),
      (error) => {
        assert.match(error.message, /signing or credential files=2/u);
        assert.equal(error.message.includes("SYNTHETIC_TEST_VALUE"), false);
        assert.equal(error.message.includes("export.p12"), false);
        return true;
      },
    );
  });
});

test("rejects every signing export extension and App Store credential filename", () => {
  withTemporaryDirectory((root) => {
    writeFileSync(join(root, ".gitignore"), "*.p8\n");
    for (const extension of [
      ".p12",
      ".cer",
      ".mobileprovision",
      ".provisionprofile",
      ".ipa",
    ]) {
      writeFileSync(join(root, `synthetic${extension}`), "synthetic fixture only\n");
    }
    mkdirSync(join(root, "synthetic.xcarchive"));
    const credentialName = ["Auth", "Key_", "TESTONLY", ".p8"].join("");
    writeFileSync(join(root, credentialName), "synthetic fixture only\n");
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "add", ".gitignore"]).status, 0);

    assert.throws(
      () => assertNoSensitiveRepositoryFiles(root),
      /signing or credential files=7/u,
    );
  });
});

test("sensitive inventory does not traverse Git or ignored build output", () => {
  withTemporaryDirectory((root) => {
    writeFileSync(join(root, ".gitignore"), "build/\n");
    mkdirSync(join(root, "build"));
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "add", ".gitignore"]).status, 0);
    writeFileSync(join(root, "build/synthetic.p12"), "ignored build output\n");
    writeFileSync(join(root, ".git/synthetic.p12"), "Git internals are outside the scan\n");

    assert.doesNotThrow(() => assertNoSensitiveRepositoryFiles(root));
  });
});
