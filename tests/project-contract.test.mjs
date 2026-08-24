import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("uses the independent product identity", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(manifest.name, "tab-shelf");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.devDependencies ?? {}, {});
  assert.match(
    readFileSync("NOTICE", "utf8"),
    /^Tab Shelf\nCopyright 2026 James Li \/ Jovaii\n$/,
  );
});

test("contains the complete Apache License 2.0", () => {
  const license = readFileSync("LICENSE", "utf8");

  assert.match(license, /^Apache License\n {27}Version 2\.0, January 2004\n/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(license, /Copyright \[yyyy\] \[name of copyright owner\]/);
});

test("contains no vendored dependency tree", () => {
  assert.equal(existsSync("node_modules"), false);
  assert.equal(existsSync("package-lock.json"), false);
  assert.equal(existsSync("vendor"), false);
  assert.equal(existsSync("Pods"), false);
  assert.equal(existsSync("Carthage"), false);
});

test("documents the Safari-only and privacy boundaries", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /^# Tab Shelf$/m);
  assert.match(readme, /Safari-only personal utility/);
  assert.match(readme, /No telemetry/);
  assert.match(readme, /Apache License 2\.0/);
});
