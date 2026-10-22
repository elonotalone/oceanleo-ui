# W04 delivery — rich doc single native Tiptap mode

## What changed
- `src/shell/advanced-routes/RichDocRoute.tsx`: now the plain native route (former `RichDocLegacyRoute`). Removed `resolveEditorCore` dispatch, lazy `RichDocHostedRoute`, `PluginModeSwitchGate`, `usePluginMode`, `useModeSwitchReady`, handoff/pro-saved-revision binding, `mode`/`pages: { proLabel: "Umo" }` adapter fields. Kept `convertUmoToRichDoc` for restoring old recovery drafts.
- Deleted (git rm): `advanced-routes/RichDocHostedRoute.tsx`, `advanced-routes/richdoc-pro-source.ts`, `doc-editors/rich-doc-hosted-embed.ts`, `doc-editors/RichDocHostedContextToolbar.tsx`.
- `doc-editors/rich-doc-umo-migration.ts`: pruned to the read direction only (deleted `convertRichDocToUmo`, `openRichDocReadOnly`, `needsOneClickConvert`, `UmoDocument`, related types). `inspectRichDocDocument`, `convertUmoToRichDoc`, `TiptapNode/Mark` kept (wechat export + recovery use them).
- `non-richdoc-source-gate.ts` is NOT richdoc-only (used by Pdf/Game/Image/Model3D/Audio/Website routes): left untouched.
- Added `tests/rich-doc-single-mode.test.mjs` (regression: hosted modules gone; RichDocRoute has no Hosted import / mode switch / pro page / iframe; no rich-doc source file renders an iframe; umo.tiptap.v1 and tiptap-json@1 stored shells open via `parseRichDocNativeJson`).

## Stored documents
The Umo face saved `tiptap-json@1` projects (`persistUmoPayload`), the same schema the native editor writes, so they open unchanged. `umo.tiptap.v1` shells are still unwrapped by `rich-doc-model.ts` (`unwrapNativeRichDocJson`, untouched). Nothing is rewritten silently; no converter needed.

## Tests
Deleted (only asserted the hosted/Umo/pro face): `rich-doc-core-swap`, `rich-doc-hosted-pro-toolbar`, `rich-doc-hosted-review` (also read /root/projects/umo-hosted sources), `W1-richdoc-hosted-selection`, `W5-r3-hosted-selection-hold`, `e9-hosted-draft-runtime`, `e7-other-richdoc-unmount`, `eas-w18-richdoc-handoff`, helpers `e9-richdoc-harness.mjs`, `editor-repair-20261021-acceptance-richdoc.mjs`.
Edited to drop hosted cases (native assertions kept): `W1-richdoc-source-import`, `W1-richdoc-image-empty-admission`, `W1-r4-typecheck-source`, `library-richdoc-project-reopen`, `W1-20261021-open-save.mjs`, `library-automatic-save-1022`, `rich-doc-umo-migration` (rewritten to read path), `p4-working-document` (removed RichDoc pro case + richHosted refs). `collab-richdoc-review`: one pre-existing stale regex (ignored the `save:` arg in the command surface) loosened.

## Verification (all green)
Runner: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>`
rich-doc-single-mode 4/4, rich-doc-umo-migration 5/5, rich-doc-wechat-export 6/6, W1-richdoc-source-import 6/6, W1-richdoc-image-empty-admission 5/5, W1-r4-typecheck-source 1/1, library-richdoc-project-reopen 2/2, library-richdoc-runtime, W1-20261021-open-save 7/7, library-automatic-save-1022 13/13, collab-richdoc-adapter 10/10, collab-richdoc-review 23/23, richdoc-{comments,docx-comments,find-replace,table,track-changes,typography}, replay-frames-richdoc, editor-repair-acceptance-richdoc-image, e9-draft-gates all pass.
`run-heavy -- npx tsc --noEmit -p .`: 8 errors, none in W04 files (7 in `grid-univer/xlsx-export.ts`, 1 in `VideoTimelineRoute.tsx`, other owners).
`p4-working-document` fails 2 tests because `DeckHostedRoute.tsx` was deleted by W05 (not W04).

## Cross-owner requests
- Still referencing deleted W04 modules (not mine): `tests/b16-read-failure-no-blank.test.mjs`, `tests/advanced-workbench-reachability.test.mjs` (line ~624 regex), `tests/native-editors-guard.test.mjs`; earlier-seen `w10-r4-editor-html-hosted`, `hosted-editor-iframe-sandbox-render`, `hosted-family-embed-origin`, `w10-hosted-local-origin`, `w10-loopback-embed-trust` read the deleted RichDocHosted files (may already be handled by W01; re-grep at integration).
- W01: `editor-core-flags.ts` (`EDITOR_CORE_SPECS.richdoc` Umo), `hosted-editor-origins.ts`/`hosted-local-origin.ts` docs.oceanleo.app entry, `registry.ts` Umo note, `plugin-mode-store.ts` comment, `quick-actions/catalog.ts` umo-hosted comment.
- Parent: no public-barrel exports reference the deleted modules (grep found none); no package.json changes needed (Umo was served from a separate repo; no dep removed).

## Remaining limitations
- `convertNode` in `rich-doc-umo-migration.ts` still carries an unused `"to-umo"` direction (shared walker); not pruned to limit risk.
- `/root/projects/umo-hosted` repo/deploy is outside this repo and untouched.
