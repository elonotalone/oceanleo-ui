# W09 delivery — Website: Puck composed normal + Puck default Pro

Commit: 320da85c (native-editors(W09)) plus this delivery commit.

## What changed
- Added `src/shell/website-local/website-puck-faces.ts` (pure): `WebsiteFace`, `websiteFaceForMode`, `WEBSITE_PUCK_OVERRIDES` (empty `header` + `headerActions` overrides, so Puck's header, Publish button, internal undo/redo and sidebar toggles never render in either face), OceanLeo token mapping for `--puck-*` vars.
- Added `src/shell/website-local/WebsitePuckStage.tsx`: a single `<Puck>`. Normal = children `WebsiteNormalLayout` (Puck.Components + Puck.Outline left, Puck.Preview centre, Puck.Fields right; no Puck header/sidebars). Pro = no children, i.e. Puck's default full UI. Same instance and same data object; switching only swaps children, never converts or remounts. Imports `@puckeditor/core/no-external.css` (Puck styles without remote font imports; previously no Puck CSS was imported anywhere in src).
- Edited `advanced-routes/WebsiteLocalRoute.tsx`: adds `adapter.mode` (local state + `setPluginMode("website", …)`) so the shell's Pro page works; moved undo/redo from in-stage buttons to `adapter.history` (OceanLeo top bar only); stage uses `WebsitePuckStage`. No `onPublish` anywhere; save stays via adapter persistence.
- Source-code website projects / `websiteProUnavailableSourceProject` untouched (that reason is declared in EmbeddedRoute/manifest, not in this cluster).
- Nothing deleted.

## Tests
- New `tests/website-faces-w09.test.mjs` (6): SSR-renders the real Puck: control with default UI shows PuckHeader + "Publish"; normal face has no PuckHeader/PuckLayout/Nav/Sidebar/Publish and renders Puck preview; pro face renders PuckLayout (default full UI) with no Publish/PuckHeader; stage has exactly one `<Puck`, no `onPublish`, face not in the remount key, no iframe/hosted shell in route or stage.
- Edited `tests/w10-website-local.test.mjs`: replaced assertion of in-stage `website-local-undo/redo` buttons with adapter.history assertion (stage buttons removed deliberately).
- Deleted: none.

## Verification
- `run-light … --test tests/website-faces-w09.test.mjs tests/w10-website-local.test.mjs tests/website-source-carrier.test.mjs`: 25 pass, 0 fail.
- `run-heavy npx tsc --noEmit -p .`: 8 errors, none in website files (other owners' in-flight work).

## Cross-owner requests / deps
- None needed for package.json (`@puckeditor/core/no-external.css` export already exists in 0.23.0).
- W01: website must stay in `PRO_PAGE_ONLY`/allowlist; the stale-mode rule is fine as website is allowed. `tests/w10-harness/r2-website.tsx` and `tests/w10-r2-ui-offline.test.mjs` (not mine/browser-based) still reference `website-local-undo/redo` testids and the old Puck default; the r2 test needs a browser so I did not run or edit it.
- Parent i18n: new inline strings use `tt("添加区块"/"页面结构"/"编辑内容")`; no message files edited.

## Limitations
- No browser/visual check (forbidden); layout/CSS fit unverified visually. Pro face has no Puck header, so no sidebar-toggle buttons on narrow viewports (accepted: header carries publish/undo that must not be exposed). Puck's keyboard undo (ctrl+z) in Pro still runs Puck's internal history, and each result is committed to the OceanLeo history through onChange.
- Page bar / theme colour bar remain our toolbar above the stage.
