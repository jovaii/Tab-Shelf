import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RELEASE, validateReleaseVersions } from "../scripts/release-config.mjs";

test("defines one App Store and GitHub release identity", () => {
  assert.deepEqual(RELEASE, {
    productName: "Tab Shelf",
    version: "1.0.0",
    build: "1",
    appBundleIdentifier: "com.jovaii.tabshelf",
    extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
    appStorePriceUSD: 9.99,
    appStoreURL: "",
  });
  assert.equal(Object.isFrozen(RELEASE), true);
});

test("requires package and extension versions to match the release", () => {
  const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
  const extensionManifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
  assert.doesNotThrow(() => validateReleaseVersions({
    packageVersion: packageManifest.version,
    extensionVersion: extensionManifest.version,
  }));
  assert.throws(
    () => validateReleaseVersions({ packageVersion: "1.0.1", extensionVersion: "1.0.0" }),
    /Release version mismatch/u,
  );
});
