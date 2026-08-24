const executableSourceDigests = Object.freeze({
  "extension/background.js": "e130c8f6e9ee5dfc4a57c7616a72a54f8b77b2d44e7885d239a2241b9cae9988",
  "extension/core/preferences.mjs": "a4e00ce025da7f4ffeec13798d876eac8aabfa62261d19bfcb07ad3c703f6b86",
  "extension/core/tab-model.mjs": "c5e2c55a590fbdbf2400f0fa9fc50c958bbca929020007df918d78fa7c54c249",
  "extension/platform/safari-gateway.mjs": "d8180aa9563a819d90b7158603987c97250353ba07e9041d5e6381ac26958806",
  "extension/popup.html": "0aed1aea8ec467acbee6350986534bed5b5332aa5f8d9f7e7b361962f7341bf6",
  "extension/popup.mjs": "4c5e92b325ebe6b42c3b106ee53d459e7a4f8c8732326d987f4d806db91aba45",
  "extension/settings.html": "d97c754fa6cca408b6e0984e98fab5ca0d353177b2f2c70b25244e388d51b7cc",
  "extension/settings.mjs": "1b5cebb616dde2fefded09f24708fd19f5b5eec172ab0e52ee7a9891f47e4f0b",
  "extension/shelf.html": "c8bef6d4353da52bf22d3d66bd5a68eba3939751a45cf277a17d83da194ffa4e",
  "extension/shelf.mjs": "78630b998767937b038410a1b2241aeafe7261df64d211f1a0dbbcf02235df1a",
  "extension/ui/dom.mjs": "2e8f134251ff526775a5bc4786340a6d48be1eddbb572da9a461de1a4b0527b4",
  "extension/ui/shelf-view.mjs": "8d907eccfb6cb04fc5883690a305704081b261a1fdcf432477879a4777c4af73",
  "extension/ui/site-accent.mjs": "360294a61e5b29f2829762528a189ba3d34b52860f861413456e85eb3a02caa5",
  "extension/ui/theme-runtime.mjs": "32c9999d018426246f66e13c87e1aa552e360885f85075dbd1d009a09a91cc2e",
  "native/host/Script.js": "cc017148e703eee6200b7a08bf99ae62a46faddd50123a9d4771611740a913f7",
  "native/host/ViewController.swift": "e69f9f4bf396bcb1b4d7ebf645ae189b64a30048933a6abde7e21109f1e45304",
  "native/host/Base.lproj/Main.html": "6bce2692d2279b8e4d34a0f573b9ce8f925818fd42c144db758cf0ba936e137c",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf/AppDelegate.swift": "a6e56ef23838b79d59b5a86e851014f280bbdb68cda1e486329b36d56d47ce97",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift": "a10697d1812af24568d12405c84ba9ce5f982e48ce2e3ce7082b5a3b3c5addfb",
});

function file(template, digest, png) {
  return Object.freeze({ template, digest, mode: 0o644, ...(png ? { png: Object.freeze(png) } : {}) });
}

const generatedFiles = Object.freeze({
  "Tab Shelf/Tab Shelf/AppDelegate.swift": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/AppDelegate.swift",
    "a6e56ef23838b79d59b5a86e851014f280bbdb68cda1e486329b36d56d47ce97",
  ),
  "Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift",
    "a10697d1812af24568d12405c84ba9ce5f982e48ce2e3ce7082b5a3b3c5addfb",
  ),
  "Tab Shelf/Tab Shelf/Info.plist": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Info.plist",
    "b7229c826c56675a9e80fe18fa4fe8703f06eb90caa8e3d3d9da1ea383422b47",
  ),
  "Tab Shelf/Tab Shelf Extension/Info.plist": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/Info.plist",
    "b5d9f77d13c8aa21e7613df22f7a3cc614d9a30477acced688a03e959917f144",
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/Contents.json": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/Contents.json",
    "0fd49ba3c3585c709678e0046a821c3c60685ec7063720d30d3a3448be3a208b",
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AccentColor.colorset/Contents.json": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AccentColor.colorset/Contents.json",
    "9af65086fa30b49252fae1a1225731691de794f7775af74d71befeb507d12b7c",
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/Contents.json": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/Contents.json",
    "abad7172d7a1b15da877eb3b63224605358b99719d6dfe20f3f49dcfb71d3287",
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/LargeIcon.imageset/Contents.json": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/LargeIcon.imageset/Contents.json",
    "fe03d3965051f713a0c5e9f79b597f40068d9a9271934ac4c359c40687bda283",
  ),
  "Tab Shelf/Tab Shelf/Base.lproj/Main.storyboard": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Base.lproj/Main.storyboard",
    "73dfcd41257766bd978d4d86293cc5c566e7fc44d9c367eb99b5288c8a32890d",
  ),
  "Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/contents.xcworkspacedata": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
    "7f3b00b5c3fdb45242d7b87e1e5c4e25d1fa8129a16c94295ecc4e8ea2235c5f",
  ),
  "Tab Shelf/Tab Shelf/Resources/Icon.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Resources/Icon.png",
    "67189c4a018c0754e2c845ee8c54d9c4decad9dfaf5f786f349a32c3656df717",
    { width: 512, height: 512 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png",
    "f04bc86787c858d28233ad41f4706a72091c04c94a944f0664e13b9e3c9ab3d5",
    { width: 16, height: 16 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png",
    "90c7e3755be9307dc4b329aa4727ee4a7fc007aab41c20e2a13322ae33b4a5bc",
    { width: 32, height: 32 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png",
    "90c7e3755be9307dc4b329aa4727ee4a7fc007aab41c20e2a13322ae33b4a5bc",
    { width: 32, height: 32 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png",
    "8a901727d5d5c67059e81f2d55ae3103422ed519c890738a02d6afe9f779dc95",
    { width: 64, height: 64 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png",
    "affea05df20a795a6b0fdc1b4df09457fa96fb5c97c8babaef9f79729c13b7a7",
    { width: 128, height: 128 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png",
    "3bd7f230fac1f86ad21e0766ad68f3692c4e4b08c1ae61188e30527fc3293443",
    { width: 256, height: 256 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png",
    "3bd7f230fac1f86ad21e0766ad68f3692c4e4b08c1ae61188e30527fc3293443",
    { width: 256, height: 256 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png",
    "ab65b70bde4932b410c55c78388c2798b13d79d51fd01a6222b90711b204deca",
    { width: 512, height: 512 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png",
    "ab65b70bde4932b410c55c78388c2798b13d79d51fd01a6222b90711b204deca",
    { width: 512, height: 512 },
  ),
  "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png": file(
    "native/release/xcode-26.6/Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png",
    "fb4d1aa2e27b1f0df55c2b97ca153b7afd54eaeb8342091aea065f71832be114",
    { width: 1024, height: 1024 },
  ),
});

export const APP_STORE_RELEASE_PROFILE = Object.freeze({
  name: "xcode-26.6-safari-converter-26.6",
  xcode: Object.freeze({
    version: "26.6",
    objectVersion: "77",
    lastSwiftUpdateCheck: "2660",
    lastUpgradeCheck: "2660",
  }),
  safariConverter: Object.freeze({ version: "26.6" }),
  executableSourceDigests,
  generatedFiles,
});
