# W03 delivery — 3D editor single mode

## What changed
- `src/shell/advanced-routes/Model3DRoute.tsx`: now renders only `Model3DModelRoute` (three.js workbench: orbit, material colour,
  framing, director/playblast, save/autosave/recovery, collab, agent command surface). Removed `resolveEditorCore("threed")` branch,
  `dynamic(Model3DNextStage)`, `Model3DLegacyRoute`/`PluginModeSwitchGate`, `usePluginMode`, `useModeSwitchReady`, `enterProRef`,
  w19 handoff (`useW19ProSavedRevision`, `stashW19EnterHandoff`, `resolveW19Handoff`), `adapter.mode`, `adapter.pages`.
- Deleted (git rm): `Model3DHostedFrame.tsx`, `model3d-hosted-embed.ts`, `Model3DNextStage.tsx` (model-viewer face + hosted Pro host),
  `Model3DNextToolbar.tsx`, `Model3DNextDirector.tsx`, `Model3DViewerStage.tsx` (only used by NextStage), `model3d-next-mode.ts`.
- Tests: deleted `model3d-next-wiring.test.mjs`, `d12-model3d-host-save.test.mjs` (both asserted only the hosted/Pro face);
  edited `model3d-next-core.test.mjs` (dropped next-mode import/assertion); added `tests/model3d-single-mode.test.mjs`
  (regression: hosted files stay deleted; no 3D file mentions Model3DHostedFrame / usePluginMode / mode gate / w19 handoff / iframe /
  3d.oceanleo.app / `mode === "pro"`; route has no flag, `mode`, `pages`; kept surfaces present).
- Not touched: `w19-handoff-store.ts`, `use-pro-face-save.ts` (shared with audio/pdf/video/chart routes; left per task).

## Verification
- `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<f>.test.mjs`
  green for: model3d-single-mode (4), model3d-next-core, collab-model3d-adapter, d19-model3d-names, model3d-carrier-contract,
  model3d-collab-remote, model3d-dependency-loading, model3d-director-capability, model3d-legacy-camera-view, model3d-persistence,
  model3d-playblast-dof, model3d-three-roundtrip, model3d-next-roundtrip, advanced-editor-v8-doc-grid-chart-model3d (0 failures).
- `run-heavy -- npx tsc --noEmit -p .`: only 3D-related error is `src/shell/w10-editor-mounts.ts(218)` (below).

## Cross-owner requests (breakage caused by the required deletions)
1. **W01** `src/shell/w10-editor-mounts.ts`: the `three-editor` mount entry (~l.205-223) lazy-imports deleted `Model3DHostedFrame`
   (tsc error TS2307). Remove that entry (and its tests).
2. **W01** tests importing deleted `model3d-hosted-embed.ts` / `Model3DHostedFrame.tsx`: `hosted-family-embed-origin`,
   `w10-loopback-embed-trust`, `w10-r4-editor-html-hosted`, `hosted-editor-iframe-sandbox-render`. Also hosted origin `3d` entries
   (`hosted-editor-origins`, `hosted-local-origin`) and `EDITOR_CORE_SPECS.threed` (`hosting: "hosted"`, nextCore "three.js editor") are now stale.
3. **W02/W07/W01** mixed tests that mount `Model3DNextStage`/stubs: `e10-media-pro-save`, `p7-media-rest`, `eas-w19-five-editors-handoff`
   (threed cases + source reads of Model3DNextStage.tsx) — drop the threed parts.
4. `w10-editor-mounts`/other registries: `threed` must not produce a Pro page (not in PRO_PAGE_EDITORS; W01).

## Deps
None requested. (`@google/model-viewer` is now unused by product code if no other owner uses it — parent to check before removing.)

## Remaining limitations
- Orphaned pure modules left because non-owned tests import them: `model3d-next-plan.ts`, `model3d-next-l4-chips.ts`,
  `model3d-next-conversion.ts`, `model3d-agent-source.ts` (tests: W6-r4-remaining-families, active-file-media-context, mine).
  No product code imports them now; parent may delete together with those tests. The quick-action chips the old NextStage registered
  (`rememberEditorChips("threed")`) are no longer registered by the route.
- The legacy "oceanleo.three-editor@2 read-only + convert" flow lived only in NextStage and is gone; stored projects open through the
  workbench's existing `model3d-project` recovery path (not re-verified in a browser; no browser per red lines).
- Full typecheck not judged beyond my files; no browser check.

- Follow-up: extracted scene restore/replace (restoreRecovery, applyRemoteScene/applyLocalScene, kept-selection effect) from `use-model3d-workbench.ts` (606 -> 527 lines) into `use-model3d-scene-restore.ts` (173 lines), behaviour unchanged. tsc clean for 3D files; `media-editors.test.mjs` #4 now fails only on `use-pdf-workbench.ts` (607 lines, W06's file). All 3D tests green.
