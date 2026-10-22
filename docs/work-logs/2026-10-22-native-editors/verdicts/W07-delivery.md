# W07 delivery - video timeline + video canvas single mode

## What changed
- Deleted (git rm): `src/shell/video-editor/vendor/react-video-editor/` (all), `video-editor/designcombo/` (all),
  `VideoDesigncomboStage.tsx`, `designcombo-save-preview.ts`.
- Added `src/shell/video-editor/openvideo-reader.ts`: read-only reader for projects stored by the retired pro face
  (`editor_project_schema = oceanleo.video.openvideo.v1`). Maps to our `TimelineDoc`; reports unsupported features
  (keyframe animations, word-level captions, crop window) in `dropped`.
- `advanced-routes/VideoTimelineRoute.tsx`: single mode. No usePluginMode / PluginModeSwitchGate / resolveEditorCore /
  w19 handoff / next/dynamic / mode / pro page. Stored openvideo projects open read-only (not in collab room, no autosave,
  flush is a no-op) with a notice; the action "转换为可编辑时间线" enables editing; saving then writes the normal
  `oceanleo.timeline.v1` as a NEW version. The stored file is never rewritten on open.
- `workflow-carrier/VideoCanvasStage.tsx`: removed the `mode` (pro "coming soon") and `pages.proUnavailableReason`
  stub and `WORKFLOW_PRO_UNAVAILABLE`. `VideoCanvasRoute.tsx` needed no change.

## Commits
- `native-editors(W07): video timeline single mode; ...` (main), plus a follow-up fixing a missing `useRef` import and tests.

## Tests
- Deleted (assert only removed behavior): `video-designcombo-{conversion,facade,l4-chips,license,missing-params,wiring}.test.mjs`,
  `e4-video-pro-save.test.mjs`, `w10-video-timeline-license.test.mjs`; removed the "pro video commands" test in
  `active-file-media-context.test.mjs`. NOTE: that commit also carried another owner's pending removal of chart tests in the same file.
- Added `tests/video-single-mode.test.mjs` (regression: vendor/designcombo gone, no importer, no usePluginMode/pro branch
  in video cluster, reader reads stored project without mutating it, stored route read-only until convert).
- Updated `w10-video-timeline-legacy`, `w10-video-canvas-local` (stale capture regex), `workflow-react-flow-only`
  (no EmbeddedRoute read; no pro button; stale dispatch assertion removed; next/dynamic stub for local canvas).
- Run (run-heavy, 70/70): video-single-mode, w10-video-timeline-legacy, video-editor-v8, video-collab-remote, collab-media-routes,
  d17-video-reentry, active-file-media-context, timeline-capability-engine, video-timeline-carrier-contract.
- Run (run-light, each green): workflow-react-flow-only (10), w10-video-canvas-local (2), video-single-mode (5), w10-video-timeline-legacy (2).
- tsc (run-heavy): only error in my files was missing `useRef` in VideoTimelineRoute (fixed). I did not get a clean re-run after the fix
  and the VideoCanvasStage edit because the heavy slot was occupied by other jobs; parent please re-run.

## Cross-owner requests / tests I do not own that import deleted modules
- `tests/e10-media-pro-save.test.mjs`, `tests/p5-video-chart-pipeline.test.mjs`, `tests/W6-20261021-video.mjs`,
  `tests/editor-repair-20261021-acceptance-remaining-autosave.mjs` import `VideoDesigncomboStage` / `designcombo/schema`: delete or rewrite video parts.
- `tests/eas-w19-five-editors-handoff.test.mjs`, `tests/advanced-editor-v7.test.mjs`, `tests/w13-advanced-editor-resilience.test.mjs`,
  `tests/advanced-workbench*.test.mjs` may reference the video pro/gate wiring; check.
- W01: `src/shell/editor-core-flags.ts` (`video-timeline` nextCore "designcombo/react-video-editor") and
  `src/client-editor-adapters/registry.ts` (reason "Full designcombo package is not a ui dependency") still name designcombo; remove.
  `w19-handoff-store` video-timeline entries and `plugin-pages` video rows are W01's.
- Barrels: `src/index.ts` / `src/shell/index.ts` export nothing from deleted modules as far as I saw (video-editor/index.ts unchanged); parent run `npm run api:check`.

## package.json
- None requested (no dependency referenced the vendor).

## Limitations
- `VideoCanvasStage` still contains the hosted video-site path (`EmbedEditorPane`, `liveCanvasBase`, detect/collab/lock modes). It is not
  a pro mode, but it is a shell-website canvas on the web path. Removing it is a larger refactor of the stage (1.4k lines, hosted-save protocol);
  I left it and recommend W01/parent decide. Local React Flow is used when `preferLocal`.
- Conversion from the stored openvideo format is lossy for keyframes, word-level captions, exact crop (listed to the user in the notice).
- After "convert" the doc is not dirty until the user edits; a save with no edits does nothing.
