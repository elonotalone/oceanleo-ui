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

## Follow-up: hosted video-site canvas removed (parent decision)
- `VideoCanvasStage.tsx` rewritten (1489 -> ~520 lines): only the local `VideoCanvasLocalCanvas` (xyflow) renders. Removed: EmbedEditorPane
  branch, `liveCanvasBase`/`preferLocal`, detect/collab/lock modes, CanvasCollabLink + entity collab, recovery/capture/restore protocol,
  native agent-write bridge use, hosted save correlation, dependency-grant loading, remote history, `WorkflowCanvasStandIn`.
  Kept: graph load/hydrate, local undo/redo history, autosave/flush with save receipts, recovery draft, plugin command surface
  (`workflow.add-node`), editing lock collab (`useLockedEditCollab`, one editor at a time), read-only projection handling.
  Behavior change to note: the web path previously went through field-level entity collab only for the hosted frame; local canvas always
  used the lock collab, which is unchanged.
- Deleted src: `workbench-embed.tsx`, `workbench-embed-base.ts`, `workbench-embed-types.ts`, `use-embed-editor-messages.ts`,
  `website-embed-params.ts` (only imported by the pane), `use-prefer-local-editors.ts`, `workflow-carrier/video-canvas-dependencies.ts`,
  `video-canvas-dependency-runtime.{mjs,d.mts}`, `video-canvas-save-receipt.ts`. `EmbedChrome` kept (workspace sub-site shell).
  `editor-core-flags.ts` / `registry.ts` had no designcombo left (W01 cleaned); only a stale comment fixed.
- Deleted tests: `video-canvas-stage-autosave-runtime`, `workflow-native-stage-runtime`, `video-canvas-dependency-runtime`,
  `video-canvas-save-receipt`, `embed-save-failure-runtime` (all about the deleted hosted path). Rewritten: `collab-workflow-stage`,
  `collab-workflow-readonly`, `w10-video-canvas-local`, `workflow-native-agent-write` (dropped the hosted-stage source test).
- Verification: `native-editors-guard` 7/7 incl. case (e); 17 video/workflow test files, 94 pass 0 fail (run-heavy);
  `tsc --noEmit -p .`: no errors in my files; the only error is `image-editor/use-fabric-image-editor.ts(1440)` (W08).

## Remaining for parent (tests I do not own that read deleted files; they will fail with ENOENT/import errors)
`advanced-workbench`, `untrusted-content-sandbox-origin` (reads workbench-embed.tsx surfaces: removing that surface entry is a deletion of a
check for deleted code, not a loosening, but you should confirm), `website-editor-w11` and `embed-host-identity-source-validation`
(import `website-embed-params.ts`; W09 website may want its own copy if it still needs those params), `embedded-protocol-v8`,
`advanced-editor-v7`, `w2-editor-save-contract` (line ~896), `w25-translate-wrapper-vars`, `advanced-canva-interactions`,
`effect-tt-dependency`, `family-embed-origin`. Also `public-api.snapshot.json`/barrels: run `npm run api:check`.
- Dead-but-kept: `workflow-carrier/agent-write-bridge.ts` native-write parts (still imported for `validateLocalWorkflowAddNodeParams`) and
  `CanvasCollabLink` in `collab/adapters/workflow.ts` (still used by `replay/work/frames/workflow.tsx` and unit tests); prune later if wanted.
