# Contributing to Tab Shelf

Thank you for helping improve Tab Shelf. Contributions must preserve its Safari-only, local, privacy-first product boundary.

## Contribution requirements

- Write code, documentation, issue content, and commit messages in English.
- Submit original work that you have the right to contribute and that is compatible with the repository's Apache-2.0 license.
- Do not add third-party runtime assets or dependencies, including remote fonts, images, icon packs, analytics, advertising, or network services.
- Keep each change focused and add focused tests for new behavior or a regression.
- Run `npm run check` before requesting review.
- Do not commit or post secrets or personal browsing data, including credentials, private URLs, browsing history, unredacted tab titles, or personal screenshots.

By submitting a contribution, you agree that your contribution is licensed under Apache-2.0 as part of Tab Shelf.

## Development workflow

1. Create a focused branch from the current default branch.
2. Add or update a test first and verify that it fails for the intended reason.
3. Implement the smallest change that satisfies the test.
4. Run the focused test, then run `npm run check`.
5. Review the diff for unrelated files, generated output, secrets, and personal data.
6. Open a pull request that explains the problem, the bounded solution, and the verification performed.

Do not include `node_modules`, generated Xcode projects, archives, signing certificates, provisioning profiles, App Store credentials, build output, or local preference exports.

## Product boundaries

Tab Shelf uses no account, analytics, telemetry, advertising, remote runtime asset, or application-owned network service. A contribution that changes this boundary needs a separately approved product and privacy decision before implementation.

Safari tab and storage permissions must remain narrowly justified by user-visible behavior. Tests and previews must use synthetic or disposable tab data.

## Documentation and interface changes

Keep public documentation in English and base claims on behavior verified in the repository. Do not invent release links, store availability, signing status, or screenshots. Interface changes should preserve keyboard access, reduced-motion behavior, readable contrast, and responsive layouts.

## License

Tab Shelf is licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
