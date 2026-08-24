# Tab Shelf

Tab Shelf is a Safari-only personal utility for organizing open tabs on the current Mac. It replaces the new-tab page with a quiet visual shelf, groups web tabs by domain, and provides quick cleanup and appearance controls.

This repository begins with a new implementation and a new Git history. The application uses Safari and macOS system APIs, system fonts, and newly authored artwork. It has no third-party runtime dependencies.

## Product principles

- Safari only; no alternate-browser build or runtime path.
- Local preferences only.
- No telemetry, analytics, accounts, or application-owned network requests.
- Uniform domain cards with accessible keyboard controls.
- Four built-in themes plus local customization.
- Independent bundle identifiers under `com.jovaii.tabshelf`.

## Development status

Version 1 is under active development. The pure extension can be tested as a temporary Safari extension before the final macOS container is packaged with full Xcode.

## Development

The project requires Node.js 24 or newer for its dependency-free test suite:

```bash
npm test
npm run audit
```

No package installation step is required.

## License

Copyright 2026 James Li / Jovaii.

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
