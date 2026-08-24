export const RELEASE = Object.freeze({
  productName: "Tab Shelf",
  version: "1.0.0",
  build: "1",
  appBundleIdentifier: "com.jovaii.tabshelf",
  extensionBundleIdentifier: "com.jovaii.tabshelf.extension",
  appStorePriceUSD: 9.99,
  appStoreURL: "",
});

export function validateReleaseVersions({ packageVersion, extensionVersion }) {
  if (packageVersion !== RELEASE.version || extensionVersion !== RELEASE.version) {
    throw new Error(
      `Release version mismatch: release=${RELEASE.version} package=${packageVersion} extension=${extensionVersion}`,
    );
  }
}
