# W14 delivery - workbench / editor tests after single-mode + deletions

Owner W14 (Sonnet 5.5, medium). Repo oceanleo-ui, main, no push. Only files under `tests/` and this evidence dir were edited; no `src/` change. This report is a claim; the parent verifies.

## Per-file record

| File | Was | What I did | Now |
|---|---|---|---|
| `advanced-workbench.test.mjs` | 4 red | #9/#10/#16 read deleted `workbench-embed.tsx`, `use-embed-editor-messages.ts`, `website-embed-params.ts`. Dropped the embed-host asserts (code is gone); kept shell/library-panel/protocol asserts (`set-host-layout`, `EDITOR_PROTOCOL`, `record.instanceId !== instanceId`, family-host check) and the website-starter route gate in `workbench-routes.ts`. Added: the three embed files must not exist. #15: DeckRoute no longer has `useProSavedRevision`/`workingItem`; asserts now say it must not (single mode), `useOfficeArtifactSource(item)` still required. | 20/0 |
| `advanced-canva-interactions.test.mjs` | 2 red | removed `workbench-embed.tsx` from the theme-token and 600-line lists | 4/0 |
| `advanced-editor-v7.test.mjs` | 1 red | autosave-icon test: removed the embed-pane asserts (file deleted); action bar + routes asserts kept | 9/0 |
| `advanced-project-autosave.test.mjs` | 2 red | Grid save/export now use `buildGridXlsxFromUniverSnapshot`; retargeted both asserts and the saved-file shape (`new File([built.blob], ...xlsx`) | 5/0 |
| `p4-working-document.test.mjs` | 2 red | `DeckHostedRoute` deleted: schema assert now on `use-deck-editor.ts`; file-must-not-exist assert; applyMode scan list without it | 4/0 |
| `b16-read-failure-no-blank.test.mjs` | 2 red | deck failure: route must render `EditorSourceFailurePanel` on `sourceFailed` and gate dirty/autosave on it; "hosted editors reject persistence" rewritten against the native Deck/RichDoc routes (`ready:` / capture null until source loaded), hosted route files must not exist | 4/0 |
| `edit-bar-gesture-coverage.test.mjs` | 2 red | Registry now has 12 routable editors, all `toolbarOwnership: "shared"`, none "native". Counts 13->12, native list must be empty; registry reader ignores `routeType: "none"` tombstones (chart row; uncommitted removal in tree does not change the count); `THEME_SPEC_PENDING = ["design-canvas"]` (folded into image, theme alias at read time); baseline commit moved to `6bee8857`, number and commit changed together as the file demands. Real-render cases kept. | 27/0 |
| `w13-advanced-editor-resilience.test.mjs` | 2 red | PDF: pdf.js `page.cleanup()` replaced by the PDFium equivalent (`toPromise(); if (disposed) return; paintImageData`, cleanup sets `disposed`). Video: the "stored item without URL fails, not blank" rule moved to `video-timeline-source.ts`; assert retargeted there including the error constant. | 5/0 |
| `p7-media-rest.test.mjs` | file crash | Deleted the audio/3D hosted-Pro mount harness (stages `AudioPlaylistStage`, `Model3DNextStage` and the iframe handshake are gone). Kept: working-schema asserts (audio, 3D, game, PDF no draftSchema), no leave-pro lock, game working-document test. Added: no `<iframe`/`usePluginMode`/`PluginModeSwitchGate` in Audio/3D/PDF routes; the two deleted stages must not exist. | 3/0 |
| `media-editors.test.mjs` | 2 red | PDF preview asserts retargeted to disposed-guard + no pdf.js. #4 (600-line limit) still red: see real findings. | 3/1 |
| `collab-acceptance-convergence.test.mjs` | 2 red | F06 path B (useEntityCollab/canvasInert) replaced: video canvas is lock-only (`useLockedEditCollab`), read-only comes from the lock, canvas disables drag/connect but must not disable pan/zoom. Grid [read-only/16]: the scan cut the `usePluginCommandSurface(...)` call at the first `);` inside it, so the grid's `readonly: editBlocked` was never seen (pre-existing); now scans to the call's own closing `\n  });`. Scan is not weaker: it inspects the full call, falls back to the old slice. | 33/0 |
| `w25-translate-wrapper-vars.test.mjs` | 4 red | removed the deleted `use-embed-editor-messages.ts` from the wrapper list | 5/0 |
| `w25-tests-out-of-repo-paths.test.mjs` | 2 red | removed the 7 dead `umo-hosted` registrations (their test is gone). #1 still red: see limitations. | 5/1 |
| `plugin-store-contract.test.mjs` | listed | already 30/0 at start; untouched | 30/0 |

## Non-suite scripts
- `W6-20261021-video.mjs`: could not load (compiled deleted `VideoDesigncomboStage.tsx`). Removed the designcombo import and its case; timeline + canvas cases kept. 3/0.
- `W5-deck/grid-person-edit`, `W6-audio/pdf/chart-model3d`, `W7-game-person-edit`: failed (also at the pre-wave tree). The `apply*` counters were right; the last assertion read `userMutationGeneration(item.key)` but the store is keyed by `userEditItemKey(item)` (artifact id, not revision key). Changed the lookups to `userEditItemKey(item)`; no expectation value changed. All pass. `W6-20261021-chart-model3d.mjs` is now 3D only (name kept, docs reference it).
- `editor-repair-20261021-acceptance-image.mjs`: fixture item had no `meta` (required; ImageRoute reads `meta.source_format`). Added `meta: {}`. 4/0.
- Others (W1, W3, W4 x2, editor-repair autosave/download/remaining-autosave, collab-grid-sim, collab-media-sim, workflow-native-roundtrip): load and pass, unchanged.
- `tests/w10-harness/*`: every relative import resolves, no deleted-module names. `r2-hosted-host.html` is used only by the hosted-core case in `w10-r2-ui-offline.test.mjs` (see cross-owner requests). `model3d-browser-smoke.mjs` is a browser page, not run.

## Commits (all `native-editors(W14):`, explicit paths)
Test fixes: workbench, canva+v7, autosave, p4+b16, edit-bar, w13+media-editors, p7, collab, w25-translate, w25-paths, W5/W6/W7 scripts, image acceptance. This delivery in the final commit. `git log --grep "native-editors(W14)"`.

## Verification
Per file: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>`. Final run of all 14 listed files and the 15 scripts above: all pass except the two reds below. tsc: only `tests/` changed and `tsconfig.json` includes `src/**` only, so no typecheck impact; I did not run it.

## Tests deleted / cases removed, and why
Embed-host asserts (EmbedEditorPane file deleted), the audio/3D Pro iframe mount harness (stages deleted), F06 useEntityCollab path (replaced), designcombo case, `use-embed-editor-messages.ts` wrapper row, seven dead umo-hosted registrations. Each has a negative counterpart where the deleted thing could return (file-must-not-exist, no `<iframe`/mode-switch in routes, no `useEntityCollab` in the canvas stage).

## Real findings (not hidden)
1. `tests/media-editors.test.mjs` #4: `src/shell/media-editors/use-model3d-workbench.ts` is 606 lines (limit < 600). W03's file; I did not split it. Fix: move ~10 lines to a helper (e.g. `model3d-workbench-helpers.ts`).
2. `tests/w25-tests-out-of-repo-paths.test.mjs` #1: 37 unregistered absolute-path literals, none from this wave (identical set at the pre-wave tree): `w10-*` tests and `tests/w10-harness/*` reading `/root/projects/oceanleo-app/...` and a Playwright chrome path, `cloud-computer-dialog-inbox`, `client-ui-host-*`, `active-file-priority`. Needs the owners of those tests to register (cross-repo, with reasons) or move fixtures; I did not register other people's paths without checking them.

## Cross-owner requests
- `tests/w10-r2-ui-offline.test.mjs` (not on my list; W01/parent): drives Playwright against `oceanleo-app` dist and the hosted cores deleted in this wave (`umo-hosted`, `audiomass-hosted`, `three-editor`, PPTist `local-hosted:*`). It should be deleted or pruned to the website/video cases, together with `tests/w10-harness/r2-hosted-host.html`. It also launches a browser if the full suite runs it.
- W03: line limit above.
- Parent: the chart tombstone removal in `workbench-capability-registry.ts` is uncommitted in the tree. `edit-bar-gesture-coverage` passes with or without it; `BASELINE_COMMIT` there is `6bee8857`.

## Process disclosure
I ran `tests/w10-r2-ui-offline.test.mjs` once to see its state; it started Playwright chromium (red line: no browser). It was killed by my 100 s timeout, no process remained (checked with pgrep). I did not run it again and no other browser, request or deploy was made.

## Deps changes requested for package.json
None.

## Limitations
Two files stay red for reasons outside my files (above). Test retargeting follows the current source shapes; if W03/W06/W08 refactor again the regexes (PDF disposed guard, video-timeline-source, Deck ready/capture) need the same update.

## Follow-up: w10-r2-ui-offline (parent request)
Deleted `tests/w10-r2-ui-offline.test.mjs` and the harness files only it used: `r2-hosted-host.html`, `r2-serve.mjs`, `r2-website.{html,tsx}`, `r2-video-canvas.{html,tsx}`, `r2-video-timeline.{html,tsx}`, `r2-chrome.css`, `vite.config.mjs`. All four of its tests launch Playwright chromium (via `launchBrowser`) against the `oceanleo-app` dist and the hosted PPTist/Umo/AudioMass/three.js cores; its website/video cases also need a browser, so nothing could be kept without one. Not run (no browser); the replaced browser coverage is gone, not moved. Kept (still used by `w10-design-canvas-offline.test.mjs`): `serve.mjs`, `design-canvas.html`, `design-canvas-session.mjs`, `design-document.blank.v1.json`. Checked with `node --check` on those and the remaining test, and a grep showing no other reference to the deleted files. This also removes some of the absolute-path offenders in `w25-tests-out-of-repo-paths` (the `w10-r2-ui-offline`, `vite.config.mjs`, `serve.mjs` ones that came from deleted files).
