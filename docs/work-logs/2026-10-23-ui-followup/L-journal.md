# L listings / edit journal

- Read live kernel, workstation instructions, OceanLeo and parallel rollout packs. Bootstrap passed on main; unrelated worktree edits preserved.
- Import-chain breakpoint: BayMine → mine panes → MineTradeList; ServiceEditorPane → BayRevealForm → BayImageGallery. Giant white surface is the LeoBayPage paper wrapper. Parent extended ownership to this exact condition.
- Parent owns common select primitives. L migrates seller native enum and pricing model selectors; parent handles shared BayChoice alignment.
- Implemented Library search and grid/list controls in BayMine. Query state is scoped to each of the four lists. Existing categories, route targets, edit/delete handlers, paid amounts and statements remain connected.
- MineTradeList now renders separate image cards/compact rows. Covers come from existing listing/favorite/app payloads and the service lookup already used for order categories. Missing/broken covers fall back to a category icon. Added Unicode/case-normalized multi-term search without discarding the underlying loaded lists.
- BayRevealForm gives uploads and each input section their own white card, with a split grid that stacks based on available pane width. LeoBayPage keeps the existing scroll/rail geometry but has a transparent card canvas. BayImageGallery no longer forces a 448px image area and selected thumbnails use a neutral border.
- Collapsible BayChoice uses the common MenuSelect (portal, keyboard selection, disabled options); non-collapsible tiles remain. Seller pricing, enum and legacy media-kind inputs use BayMenuSelect. Shared select internals/CSS remain parent-owned.
- Applied parent/H geometry contract: only the page block gets a bounded flex root/tabpanel/body, so the personal page builder can use remaining height.
- Updated old tests for the new independent-card and portal-menu contract. Fixed one stale test domain stub missing runtimePageOrigin so all 12 bay-needs-help cases actually execute.
- Verification uses the following prefix from /root/projects/oceanleo-ui (all are focused run-light jobs):

```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2
```

- Green group A, 34/34: tests/bay-seller-editor.test.mjs tests/bay2-publish-form.test.mjs tests/bay-choice.test.mjs tests/bay-form-follow-through.test.mjs
- Green group B, 28/28: tests/bay-buy-sell-terms.test.mjs tests/bay-listing-sections.test.mjs tests/bay4-mine-trade.test.mjs tests/bay-mine-category.test.mjs
- Green group C, 60/60: tests/bay-needs-help.test.mjs tests/bay3-page.test.mjs tests/bay4-publish.test.mjs tests/lbp-w04-mine.test.mjs
- Green group D, 35/35: tests/leochat-get-help.test.mjs tests/bay-app-endpoint.test.mjs tests/bay-apps-editor.test.mjs tests/bay-lessons-editor.test.mjs
- `leo-git diff --check` passed for all L-owned changed paths. No browser, dependency installs, global build/typecheck, push or commits. No new translated strings/dictionary registration.

Product paths changed:

```
src/shell/bay/shell/BayMine.tsx
src/shell/bay/shell/LeoBayPage.tsx (paper-wrapper condition only)
src/shell/bay/mine/MineTradeList.tsx
src/shell/bay/mine/MyPublishedPane.tsx
src/shell/bay/mine/MySoldPane.tsx
src/shell/bay/mine/MyBoughtPane.tsx
src/shell/bay/mine/MyFavoritesPane.tsx
src/shell/bay/mine/mine-bundle.ts
src/shell/bay/mine/mine-load.ts
src/shell/bay/mine/mine-view-state.ts
src/shell/bay/mine/mine-trade-model.ts (new)
src/shell/bay/form/BayChoice.tsx
src/shell/bay/form/BayRevealForm.tsx
src/shell/bay/form/BayImageGallery.tsx
src/shell/bay/seller/editor-steps.tsx
```
