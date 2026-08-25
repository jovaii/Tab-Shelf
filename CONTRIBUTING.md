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

Workspace changes must preserve the separate validated `tabShelf.workspace.v1` boundary, deterministic automatic classification, bounded custom-category data, keyboard parity for every drag operation, and the rule that Tab Shelf never reorders Safari's native tabs, windows, or Tab Groups.

## Documentation and interface changes

Keep public documentation in English and base claims on behavior verified in the repository. Do not invent release links, store availability, signing status, or screenshots. Interface changes should preserve keyboard access, reduced-motion behavior, readable contrast, and responsive layouts.

### Human approval packages

Any specification, product decision, release decision, or other document that requires explicit human approval must include all three review surfaces before approval is requested:

1. the complete Markdown source of record;
2. a responsive Web mind map that shows the decision structure and relationships; and
3. a one-slide Web summary that states the outcome, user-visible behavior, boundaries, delivery scope, and decision being requested.

Keep the public repository versions in English and link the three surfaces together. Write the Web views in plain product language, not implementation terminology. If a reviewer needs another language, generate a local review copy without replacing the English source of record. The Web views must remain dependency-free, keyboard accessible, printable, and readable without a network connection.

Do not request approval from the Markdown file alone. When the approved source changes materially, update both Web views and repeat approval before implementation or release proceeds.

Verify a review page in desktop and compact WebKit layouts with:

```sh
npm run render:approval -- 'http://127.0.0.1:4173/docs/approvals/<page>.html?approval=1' build/approval-review
```

## License

Tab Shelf is licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
