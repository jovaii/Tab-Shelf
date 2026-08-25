const executableSourceDigests = Object.freeze({
  "extension/background.js": "e130c8f6e9ee5dfc4a57c7616a72a54f8b77b2d44e7885d239a2241b9cae9988",
  "extension/core/classifier.mjs": "85699738ab9252a3bcc2712c292728982c0c2197d4d19bd2b1669e130d129b13",
  "extension/core/preferences.mjs": "a4e00ce025da7f4ffeec13798d876eac8aabfa62261d19bfcb07ad3c703f6b86",
  "extension/core/tab-model.mjs": "c5e2c55a590fbdbf2400f0fa9fc50c958bbca929020007df918d78fa7c54c249",
  "extension/core/workspace-actions.mjs": "1eda115d3cb44aea05c0c2ef17ec1fbab2d7411a7d73f1b418f71c0def4c31c4",
  "extension/core/workspace.mjs": "6c20e274f8a7e5f6ca4ece269d77eeb43725d6404a0abe27ae94683d21b9de40",
  "extension/platform/safari-gateway.mjs": "65ffe0dafde381d244dd2fa7c8a793f443d9c5135b39d62eb8f39fb7bc210185",
  "extension/popup.html": "0aed1aea8ec467acbee6350986534bed5b5332aa5f8d9f7e7b361962f7341bf6",
  "extension/popup.mjs": "4c5e92b325ebe6b42c3b106ee53d459e7a4f8c8732326d987f4d806db91aba45",
  "extension/settings.html": "fabc75fa131f9778d3369818c43bc297f75fd5abb70ff878b04cf6e568082645",
  "extension/settings.mjs": "5b5a5340f6371d0a0d94195184930d1eac1ed5322391b22b12ff46e16c218d98",
  "extension/shelf.html": "0a31a5386c72ead9829df7788918fb1a7a1c5fc026cc4a0bffe33cc87607298c",
  "extension/shelf.mjs": "861729325c7010867cb2e11b0ce1ec6bd814ac17e9d0e0f8d48b8ba12c9c6115",
  "extension/ui/dom.mjs": "4f1f6cb42a930252a30c2c895aa65d0b2d722b6667b551d6ea25312642ccbee3",
  "extension/ui/shelf-view.mjs": "4c31ac96396f9efc533ef1cfe3d88eddd72103ac757fa90d31a7409323072b2e",
  "extension/ui/site-accent.mjs": "360294a61e5b29f2829762528a189ba3d34b52860f861413456e85eb3a02caa5",
  "extension/ui/sortable-controller.mjs": "6887bbef2b986454cbfb5577293567c4a803ad70b69bba24d399604bcbd76145",
  "extension/ui/theme-runtime.mjs": "32c9999d018426246f66e13c87e1aa552e360885f85075dbd1d009a09a91cc2e",
  "native/host/Script.js": "cc017148e703eee6200b7a08bf99ae62a46faddd50123a9d4771611740a913f7",
  "native/host/ViewController.swift": "e69f9f4bf396bcb1b4d7ebf645ae189b64a30048933a6abde7e21109f1e45304",
  "native/host/Base.lproj/Main.html": "6bce2692d2279b8e4d34a0f573b9ce8f925818fd42c144db758cf0ba936e137c",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf/AppDelegate.swift": "a6e56ef23838b79d59b5a86e851014f280bbdb68cda1e486329b36d56d47ce97",
  "native/release/xcode-26.6/Tab Shelf/Tab Shelf Extension/SafariWebExtensionHandler.swift": "a10697d1812af24568d12405c84ba9ce5f982e48ce2e3ce7082b5a3b3c5addfb",
});

function extensionFile(digest) {
  return Object.freeze({ type: "file", digest, modeClass: "file" });
}

const extensionTree = Object.freeze({
  "background.js": extensionFile("e130c8f6e9ee5dfc4a57c7616a72a54f8b77b2d44e7885d239a2241b9cae9988"),
  core: Object.freeze({ type: "directory", modeClass: "directory" }),
  "core/classifier.mjs": extensionFile("85699738ab9252a3bcc2712c292728982c0c2197d4d19bd2b1669e130d129b13"),
  "core/preferences.mjs": extensionFile("a4e00ce025da7f4ffeec13798d876eac8aabfa62261d19bfcb07ad3c703f6b86"),
  "core/tab-model.mjs": extensionFile("c5e2c55a590fbdbf2400f0fa9fc50c958bbca929020007df918d78fa7c54c249"),
  "core/workspace-actions.mjs": extensionFile("1eda115d3cb44aea05c0c2ef17ec1fbab2d7411a7d73f1b418f71c0def4c31c4"),
  "core/workspace.mjs": extensionFile("6c20e274f8a7e5f6ca4ece269d77eeb43725d6404a0abe27ae94683d21b9de40"),
  icons: Object.freeze({ type: "directory", modeClass: "directory" }),
  "icons/icon-128.png": extensionFile("873173a43f9dd4182516051daa2663bc82495c9fb626daaaf7d7fb3d91ec129e"),
  "icons/icon-16.png": extensionFile("abcbea2a048c1d71da222d0c78d9d80e084980745c9b0f60c542015f0bc08fc3"),
  "icons/icon-256.png": extensionFile("d6f4bf8bab89acb48402be0fc5913fa17b0efb3d0fdfd77b044733d9316614a3"),
  "icons/icon-32.png": extensionFile("27cc51cb291455a60b075b5424283ed2fbcb09427e8d182416adb0119cfd99eb"),
  "icons/icon-48.png": extensionFile("9b500e4d277ded4f53ae32ba80eb8a224386e805c4d685b5a547ae8630ffbfcf"),
  "icons/icon-512.png": extensionFile("67189c4a018c0754e2c845ee8c54d9c4decad9dfaf5f786f349a32c3656df717"),
  "icons/icon-64.png": extensionFile("830218ce2f2f23fd7e793ccd5600af615e050b7b6355b9b21ba1fcab21cfb880"),
  "icons/icon-96.png": extensionFile("b907baeba1d95688f55ecbac8e9178f1d7c14acb2a8cbb191e66b7fd5d1375cc"),
  "manifest.json": extensionFile("639cbd5638e1aaa576a14f27a0a86e887a1ab27039c7483341690ed48e552491"),
  platform: Object.freeze({ type: "directory", modeClass: "directory" }),
  "platform/safari-gateway.mjs": extensionFile("65ffe0dafde381d244dd2fa7c8a793f443d9c5135b39d62eb8f39fb7bc210185"),
  "popup.css": extensionFile("0db16a7555c997cb41dfb9c2204979e322d02fce24f41ef5bb7ea99b53fbc7b4"),
  "popup.html": extensionFile("0aed1aea8ec467acbee6350986534bed5b5332aa5f8d9f7e7b361962f7341bf6"),
  "popup.mjs": extensionFile("4c5e92b325ebe6b42c3b106ee53d459e7a4f8c8732326d987f4d806db91aba45"),
  "settings.css": extensionFile("2b4df189af9e5daa2bae96ff92bc071eec7ceec32a73564be0cee70795067930"),
  "settings.html": extensionFile("fabc75fa131f9778d3369818c43bc297f75fd5abb70ff878b04cf6e568082645"),
  "settings.mjs": extensionFile("5b5a5340f6371d0a0d94195184930d1eac1ed5322391b22b12ff46e16c218d98"),
  shared: Object.freeze({ type: "directory", modeClass: "directory" }),
  "shared/tokens.css": extensionFile("1b5f720a31f01b94340e51908484da29217ebb9f87d07fa07ec564ca135c67e4"),
  "shelf.css": extensionFile("84d293b321c91ff5fa0b3a209f83440aea1b103415986d6db306d88b9e98ce6d"),
  "shelf.html": extensionFile("0a31a5386c72ead9829df7788918fb1a7a1c5fc026cc4a0bffe33cc87607298c"),
  "shelf.mjs": extensionFile("861729325c7010867cb2e11b0ce1ec6bd814ac17e9d0e0f8d48b8ba12c9c6115"),
  ui: Object.freeze({ type: "directory", modeClass: "directory" }),
  "ui/dom.mjs": extensionFile("4f1f6cb42a930252a30c2c895aa65d0b2d722b6667b551d6ea25312642ccbee3"),
  "ui/shelf-view.mjs": extensionFile("4c31ac96396f9efc533ef1cfe3d88eddd72103ac757fa90d31a7409323072b2e"),
  "ui/site-accent.mjs": extensionFile("360294a61e5b29f2829762528a189ba3d34b52860f861413456e85eb3a02caa5"),
  "ui/sortable-controller.mjs": extensionFile("6887bbef2b986454cbfb5577293567c4a803ad70b69bba24d399604bcbd76145"),
  "ui/theme-runtime.mjs": extensionFile("32c9999d018426246f66e13c87e1aa552e360885f85075dbd1d009a09a91cc2e"),
});

function file(template, digest, png) {
  return Object.freeze({
    template,
    digest,
    modeClass: "file",
    ...(png ? { png: Object.freeze(png) } : {}),
  });
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
    build: "17F113",
    objectVersion: "77",
    lastSwiftUpdateCheck: "2660",
    lastUpgradeCheck: "2660",
  }),
  safariConverter: Object.freeze({ version: "26.6" }),
  extensionTree,
  executableSourceDigests,
  generatedFiles,
  generatedDirectories: Object.freeze([
    "Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/xcshareddata",
    "Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/xcshareddata/swiftpm",
    "Tab Shelf/Tab Shelf.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/configuration",
  ]),
  artwork: Object.freeze([
    "Tab Shelf/Tab Shelf/Resources/Icon.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@1x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-16@2x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@1x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-32@2x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@1x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-128@2x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@1x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-256@2x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@1x.png",
    "Tab Shelf/Tab Shelf/Assets.xcassets/AppIcon.appiconset/mac-icon-512@2x.png",
  ]),
});
