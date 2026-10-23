# Shared focused test reconciliation

2026-10-23. Tests-only scope; no product source, browser, deploy or account mutations.

- `d25-office-prewarm`: supply the real imported `isArtifactSourceTreeUrl` to the extracted hook harness. Retain concurrent prewarm deduplication, non-Office no-download, retry/error assertions; add authenticated source-tree no-fetch regression.
- `b12-single-scroll-owner`: remove the nonexistent `FabricImageFilterPanel` export expectation. Its actual filter inspector controls are exercised in route-context. Treat the native PDF stage page rail as its own scroll owner, checking its stage mounting rather than incorrectly imposing the shared left-pane invariant on it. Shared left-pane root checks remain.
- `route-context-editors`: replace obsolete literal/module regex assumptions with actual image/video/deck control construction and command dispatch. Check current canonical compact fields versus semantic inspector groups, stale/locked image guards, gesture preview/commit/cancel, deck transition bounds, and multiselection-only grid merge plus split executor. Retain RichDoc/audio/3D persistent engine binding checks, PDF standard annotation roundtrip, and 3D reopen normalization.
- Exact `tests/d25-office-rerender.test.mjs` does not exist; no similarly named file was added to scope.

Validation: guarded Node test command with assert-dom-guard, strip-types and ts-extension-loader, against the three owned test files: **17 passed, 0 failed, 0 skipped**. No product defect found in this focused set. This is not a full-suite or browser acceptance claim; parent owns those gates.
