# W16 delivery

## Changes
### /root/projects/video — commit 195b7c8
- `components/editor/VideoEditor.tsx`: removed the "next"/OpenVideo core path (core state, read-only conversion banner,
  `siteReadonly` gating, conversion in `doExport`). Export now always calls `exportProject(project, assets, ...)` (mediabunny).
- Deleted: `components/editor/openvideo-conversion.ts`, `tests/openvideo-conversion.test.mjs`, `vendor/react-video-editor/` (17 files).
- Added `tests/no-openvideo.test.mjs` (3 tests): vendor dir and conversion module absent; no source file references
  `react-video-editor`, `readVideoEditorCore`, `openvideo-conversion`, the `editor-core.video-timeline` switch key or the
  convert functions; export still uses mediabunny on the editor project. Fails if the vendor dir/core switch returns.
- Stored `oceanleo.video.openvideo.v1` projects: the video site editor never loaded stored projects (only `initialAsset`;
  the schema string was used only by the deleted converter, which only produced it). The read path for stored rows is
  `oceanleo-ui/src/shell/video-editor/openvideo-reader.ts` (W07: read-only, lossy for keyframes/word captions/exact crop,
  no rewrite until the user converts). So no site-side read path was kept; nothing in the site rewrites stored rows.
- Left untouched: `tsconfig.json` `"exclude": ["node_modules","vendor"]` (harmless; not in my file list).

### /root/projects/website — commit 172e538
- `front/tests/site-editor.test.mjs`: case "website_finetuning from shared More..." retargeted. Deleted assertions on the
  deleted `workbench-embed.tsx`, `workbench-routes.ts` website embed entry and `website-embed-params.ts` (hosted-iframe
  behaviour, gone). Kept live assertions (material controller scoping, advanced-features mapping, site workbench
  preview/code/save). Test renamed accordingly.
- Comment-only: `front/packages/gallery-editor/src/plugin-command.ts` (dropped ChartRoute), `website-history.ts`
  (chart-history path reference replaced; "与 GridRouteHistory 一致").

## Verification
- video: `node --experimental-strip-types --test tests/no-openvideo.test.mjs` 3/3 pass.
- video: `run-heavy -- npx tsc --noEmit` clean.
- website/front: `node --experimental-strip-types --test tests/site-editor.test.mjs` 11/12; the one failure
  ("shell nav pages render the shared surfaces instead of redirecting", app/explore/page.tsx redirects) is in code I did not
  touch and unrelated to this wave. The retargeted case passes. gallery-editor comment edits not typechecked (comments only).

## Step 3 (consumer contract tests): NOT completed against W15
`verdicts/W15-delivery.md` did not exist when I finished, so this is a baseline only and must be re-run after W15 lands.
Baseline (run-light, each repo's own test form; no file edits made for these):
- edu, study, novel, script `tests/artifact-surface.test.mjs`: 9/12/13/12 pass, 0 fail.
- word-ai/frontend `tests/artifact-surface.test.mjs`: 12/12.
- image `material-convergence.test.tsx`: 4/4. aihuman-studio and converter-suite `artifact-integration-rendered`: 6/6, 5/5.
  ppt-maker/frontend `home-compile-boundary`: 3/3.
- video `material-convergence.test.tsx`: 4 pass, 3 fail (`window.dispatchEvent is not a function` thrown from the pinned
  installed `@oceanleo/ui` auth client under the test harness). Not a stale chart/editor expectation; I did not edit it.
- design `artifact-context.test.mjs`: cannot run, `Cannot find module 'fflate'` (dependency missing in design node_modules;
  no installs allowed).

## Cross-owner / parent requests
- Re-run step 3 after W15 (or have parent do so). Note the consumers' tests mostly read their pinned installed ui copy
  under node_modules, so they do not see the local wave unless the slot resolves to the local package.
- design needs `fflate` installed to run its test; video material-convergence failure needs a look at the pinned-ui
  `window` stub (harness/dep issue).
- No package.json/lockfile change requested. Not bumped/pushed/deployed.

## Limitations
- Video site has no stored-project loader, so the lossy stored-OpenVideo read path lives only in the ui reader.
- Step 3 incomplete as described.

## Step 3 re-run after W15 (ui c190e581)
Which ui each test read (checked by `readlink -f node_modules/@oceanleo/ui`). None of the test files supports an override
(only supabase env keys), and I may not edit package.json/node_modules, so pinned copies stay pinned.
| Repo | ui copy read | Result |
|---|---|---|
| edu, study, novel, script artifact-surface | pinned tarball (pnpm store, hash 2372fca...) | 9 / 12 / 13 / 12 pass |
| word-ai/frontend artifact-surface | pinned 2372fca... | 12/12 |
| image material-convergence | pinned 2372fca... | 4/4 |
| video material-convergence | pinned 0d96502... | 4 pass, 3 fail (`window.dispatchEvent is not a function` in pinned ui auth client; not wave-related, unedited) |
| aihuman-studio/frontend, converter-suite/frontend artifact-integration-rendered | pinned 2372fca... | 6/6, 5/5 |
| ppt-maker/frontend home-compile-boundary | pinned 2372fca... | 3/3 |
| design artifact-context | LOCAL (`node_modules/@oceanleo/ui` -> /root/projects/oceanleo-ui) | 5/5 after fix (run with `NODE_PATH=/root/projects/oceanleo-ui/node_modules` for `fflate`; env only) |

Fix (design commit, test only): cross-type routing test iterated all `ARTIFACT_TYPES` and required an editor capability for
`chart`; W15 removed the chart row, `chart` is now read-only with `available: false`. The test now asserts that for chart and
continues. Only stale expectation found. Caveat: the pinned-copy results are pre-wave contracts, so green there does not prove
compatibility with c190e581; they will be re-evaluated when each consumer is bumped (parent's job). Without NODE_PATH, design
fails to resolve `fflate` (environment gap).
