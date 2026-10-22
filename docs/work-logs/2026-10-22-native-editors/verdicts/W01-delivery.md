# W01 delivery — shell core: Pro allowlist, routing, registries, chart removal, shell-iframe removal

Owner: W01 (Sonnet 5.5, medium). Repo: oceanleo-ui. Main branch only, no push/deploy/browser.
This report is a claim; the parent verifies (commands below).

## What changed

### 1. Pro-page allowlist (single source)
- `src/shell/plugin-chrome/plugin-pages.ts`: new `PRO_PAGE_EDITORS = ["grid", "pdf", "website"]` (frozen) and `hasProPage(id)`.
  `buildPluginPages({ pluginId })` emits the `pro` page only for those ids; no / unknown id fails closed (edit page only).
  The static aux-page registry (`plugin-page-registry.ts`, website/game "code/dashboard/..." placeholders that only the deleted sub-site iframe filled) is deleted; aux pages now come only from `adapter.pages.aux`.
- `plugin-mode-store.ts`: `currentPluginMode()` returns `normal` for non-Pro editors even if localStorage says `pro`; `setPluginMode(..., "pro")` is a no-op for them.
- `plugin-page-store.ts`: `setPluginPage(id, "pro")` falls back to the edit page for non-Pro editors.
- `plugin-mode.tsx`: `PluginModeToggle` renders nothing for non-Pro editors.
- `InlineAdvancedWorkbenchHeader.tsx`, `inline-advanced-shell-parts.tsx`: pass the plugin id into `buildPluginPages`.
- Grid label stays "Univer"; pdf / website unchanged.

### 2. Chart editor deleted end to end
Deleted: `chart-editor/` (19 files), `advanced-routes/ChartRoute.tsx`, `collab/adapters/chart.ts`, replay frame `replay/work/frames/chart.tsx` (replays of old chart sessions use the generic fallback frame; `FRAME_LOADERS` is now `Partial<>`), theme id `chart-editor`, preload/route-loader rows, `use-advanced-autosave` special case, `w19-handoff-store` / `collab-editor-kinds` rows, `advanced-drafts` blank chart draft (`chart_editing` removed from `ADVANCED_PLUGIN_FEATURE_IDS`).
- Registry: `chart-editor@1` stays only as a tombstone row with `routeType: "none"` because the server-contract matrix in `artifact-contract.ts` (not mine) still lists it and `workbench-capability-registry` throws on drift. Effect: `artifactTypeHasRoutableEditor("chart") === false`.
- A chart item (`content_type: chart`, `chart-editor` manifest, or durable `artifactType: chart`) resolves to `{ available: false, route: none }` with the reason "图表编辑器已下线，这份图表目前只读…" and opens in `UnsupportedRoute` (read-only viewer + that sentence as a stage notice). No crash, no blank overwrite.

### 3. Hosted-editor plumbing removed
- Deleted: `hosted-editor-origins.ts`, `hosted-local-origin.ts`, `client-local-editors.ts`. `use-prefer-local-editors.ts` is now a constant `true` stub (see limitations).
- `editor-sandbox-origin.ts`: removed `HOSTED_EDITOR_*` constants/`isHostedEditorEmbedBase`, the injected `local-hosted:*` loopback trust, and emptied `EMBED_EDITOR_ROUTES` so `TRUSTED_EMBED_EDITOR_BASES` / `_ORIGINS` are `[]` (nothing is a trusted sub-site embed any more). `editor-protocol.ts` / `family-embed-origin.ts` lost the `isHostedEditorOrigin` / `isInjectedLocalHostedEmbedBase` branches. Every change tightens trust; nothing was loosened. `isNativeClientPageOrigin`, `UNTRUSTED_*`, `COVER_FRAME_SANDBOX`, PDF exemption, interactive-viewer rules and the MCP-app trust (`mcp-apps/protocol.ts`, uses `hostedEditorDomain` from `contracts/domain-family`, untouched) are unchanged.
- `editor-core-flags.ts`: removed `chart-editor` and `design-canvas` rows; deck / video-timeline / threed no longer claim a hosted core (`nextCore: null`), richdoc = Tiptap native, audio = wavesurfer.js native.
- `w10-editor-mounts.ts`: rows for deck, umo-hosted, audiomass-hosted, three-editor, design-canvas, the hosted-frame mount kind and `w10LocalHostedCapability` removed (rows left: website, video-canvas, video-timeline).
- `client-editor-adapters/registry.ts`: chart + design-canvas rows removed, deck / audio / threed / timeline reasons rewritten.
- `editor-preload.ts`: hosted-origin preconnect removed; site-home routes updated (website, design -> image).

### 4. EmbeddedRoute shell-iframe removed; routing
- Deleted `advanced-routes/EmbeddedRoute.tsx` (and its helpers `website-host-edit-bar.ts`, `collab/adapters/use-vector-collab.ts`, `VectorCollabChrome.tsx`).
- `EditorRoute` type: `embed` and `grid.adapter` removed; new `website` and `video-canvas` route types. Routing now: website -> `WebsiteLocalRoute` (lazy route registered in `AdvancedContentWorkbench`), video canvas -> `VideoCanvasRoute`, design canvas / `canvas` / design template doc -> route `image` (`ImageRoute`; adapter id stays `design-canvas`, registry `routeType: "image"`), toolbarOwnership of these is now `shared`.
- Stored data is never rewritten: legacy `advanced_editor_route: "embed"` pins and `editor_route: "embed"` session snapshots are aliased at read time (`workbench-routes.ts`, `advanced-session.ts` `LEGACY_EMBED_ALIAS_ROUTES`; old app ids `advanced:v2:embed:*` are still accepted). New draft writes use `website` / `image` / `video-canvas`.
- `non-richdoc-source-gate.ts` / `stored-editor-project.ts`: `localRemoteEditorWorkbenchChoice` ("hosted-embed") removed.
- Theme ids: `chart-editor` and `design-canvas` removed from `PluginThemeId`; `pluginThemeIdForAdapter("design-canvas")` aliases to `image`.

#### Stored formats that now open read-only (never an iframe, never a silent rewrite)
| Stored item | Result |
|---|---|
| chart (any form) | `UnsupportedRoute`, read-only, reason shown; no converter (chart data is not convertible without the deleted editor) |
| `vector_image` artifacts (SVG, used to open in the design sub-site iframe) | read-only with reason "矢量图（SVG）暂不支持在线编辑…"; no converter. W08 can lift this if ImageRoute gains SVG editing |
| website items whose source is not `website-source@1` (html sites, unreadable source) | `WebsiteLocalRoute` refuses to open with an explicit error and does not substitute a blank document (`planWebsiteLocalSource` behaviour, W09's file) |
| legacy `oceanleo.workflow.v1` video-canvas source | handled by `VideoCanvasRoute` (W07); the old iframe save-rejection guard went with EmbeddedRoute |
| design canvas / composite_image | `ImageRoute` (W08 owns opening `oceanleo.design-document.v1`) |

### 5. Guard test
`tests/native-editors-guard.test.mjs` (7 tests): (a) allowlist exactly grid/pdf/website and no pro page for any other id incl. unknown/empty; stale persisted pro ignored for non-Pro editors; (b) no `<iframe` / `createElement("iframe")` in the seven editor directories (allowlist empty: no genuine UGC sandbox lives there; GameRoute only hands off to the sandbox host in `game-editor/`); (c) no import of removed modules anywhere under `src/` (AudioHostedFrame, Model3DHostedFrame, RichDocHostedRoute, DeckHostedRoute, ChartRoute, chart-editor/, EmbeddedRoute, react-video-editor, waveform-playlist, hosted-editor-origins, hosted-local-origin, client-local-editors); (d) routing never yields an embed route and chart is read-only with a reason; (e) editor dirs do not use `EmbedEditorPane` / `workbench-embed`.
**Test (e) is red on purpose until W07 lands** (see limitations): `VideoCanvasRoute.tsx` and `VideoCanvasStage.tsx` still reference `EmbedEditorPane`.

## Commits
- `fed0b268` native-editors(W01): Pro page allowlist, chart editor removal, shell-iframe removal, native routing
- `1b8b308e` native-editors(W01): read-only artifact types, workflow routes to video canvas, cross-editor test fixes
- this delivery file (final commit, see `git log --grep "native-editors(W01)"`).

## Verification (run by me, light runner)
Command per file: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- Typecheck: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .` -> 0 errors (whole project, run after commit `1b8b308e`, with the other owners' uncommitted work in the tree).
- Security gate (`bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh`, run twice): final run 24 PASS, 2 FAIL. The oceanleo-ui sandbox/origin step ("untrusted embed sandbox + origin") is PASS. Remaining FAILs are not in files I own: (1) render-surface scan "NEW / UNDECLARED FINDINGS: none", only ALLOWLIST DRIFT in the oceandino repo (cross-owner request 1); (2) UC-reference check: after my fix of `hosted-editor-contract-v2.test.mjs:536` the only left cases are W06's `untrusted-content-pdf-frame-host.test.mjs:55` and `:80` (cross-owner request 7).
- Guard test: `tests/native-editors-guard.test.mjs` 6/7 green; the red one is test (e) by design (W07).
- Focused cross-editor tests green: native-editors-guard (6/7), hosted-editor-iframe-sandbox-render, untrusted-content-sandbox-origin, domain-family-ws, family-embed-origin, hosted-editor-contract-v2, editor-core-flags-and-mode, eas-w16-static-plugin-pages, advanced-workbench-reachability, plugin-theme-registry, editor-repair-acceptance-plugin-matrix, w10-editor-mounts, artifact-routable-editor, collab-pro-lock, advanced-session, advanced-editor-routing, plugin-chrome-page-row, advanced-plugin-open, and the other files listed under "Test triage".
- Baseline comparison: I extracted `HEAD` before my commit (`git archive`) and ran the same files to separate pre-existing failures from mine.

## Test triage
Deleted (they only asserted deleted behaviour): all `chart-*.test.mjs` (9), `collab-chart-adapter`, `replay-frames-chart`, `collab-vector-guard`, `d4-design-handshake-origin`, `eas-w16-embedded-no-update-loop`, `hosted-family-embed-origin`, `w10-hosted-local-origin`, `w10-loopback-embed-trust`, `w10-r4-editor-html-hosted`, `w10-prefer-local-editors`, `p5-video-chart-pipeline`, `e10-media-pro-save` (audio/3d/video/chart Pro stages, all deleted; was already red at HEAD), `W7-20261021-embedded-person-edit.mjs`.
Rewritten / trimmed to the single-mode / no-iframe behaviour: advanced-workbench, advanced-workbench-reachability, advanced-editor-v7/v9, advanced-editor-routing, advanced-adapter-contract, advanced-project-autosave, artifact-surface-rendered (vector/chart read-only, website/workflow routes), collab-acceptance-convergence, collab-visual-readonly, domain-family-ws, editor-core-flags-and-mode (11 cores; Pro tab only for the allowlist), eas-w16-static-plugin-pages, eas-w19-five-editors-handoff (pdf only), embedded-protocol-v8 (protocol validators kept, EmbeddedRoute assertions removed), family-embed-origin, hosted-editor-contract-v2, loopback-trust-source-set, plugin-theme-registry, w10-editor-mounts, w10-website-local, website-source-carrier, website-editor-w11, visual-family-commands and ~15 smaller edits (names in the commit).
Security tests: `untrusted-content-sandbox-origin`, `hosted-editor-iframe-sandbox-render` (kept at that path because `oceanleo-security-gate.sh` runs it; rewritten to negative UC-3/UC-6 assertions: former hosted origins, injected loopback origins and UGC domains get no trust and no scripted same-origin sandbox), `family-embed-origin`, `hosted-editor-contract-v2`, `domain-family-ws`, `loopback-trust-source-set` were updated to assert the narrower trust; every deleted positive assertion has a negative counterpart.
Failures that are **pre-existing at HEAD, not caused by this work** (same counts on the extracted HEAD): `collab-acceptance-convergence` ([只读/16] grid), `artifact-surface-rendered` x3 (My Library copy), `advanced-workbench` #15 (DeckRoute regex), `loopback-trust-source-set` #5 (bay + image-command-surface localhost hits), `g2-selection-toolbar-render` (IconButton stub), `g3-portal-typed-editor` (module-bench cycle), `route-context-editors` x2, `effect-tt-dependency`, `i18n-tt-key-coverage`, `edit-bar-gesture-coverage` x2, `workflow-react-flow-only` x1, `w13-advanced-editor-resilience` (pdf/timeline cases), `W6-20261021-chart-model3d.mjs` 3D case.

## Cross-owner requests
1. **oceandino repo (parent)**: `scripts/oceanleo-untrusted-render-allowlist.json` has 5 stale entries that make the cross-repo render scan fail with "ALLOWLIST DRIFT": `DeckHostedRoute.tsx`, `RichDocHostedRoute.tsx`, `AudioHostedFrame.tsx`, `Model3DHostedFrame.tsx` (UC-3-IFRAME-DYNAMIC-SANDBOX) and `library-viewers.tsx` (UC-3-IFRAME-NO-SANDBOX, PDF exemption; W06). Delete them.
2. **W07 / parent**: `workflow-carrier/VideoCanvasStage.tsx` still imports `EmbedEditorPane` / `embedEditorBase` (dead branch: `usePreferLocalRemoteEditor` is constant `true`, `embedEditorBase` returns `""`, trusted-base table is empty). Remove that branch, then delete `workbench-embed.tsx`, `workbench-embed-base.ts`, `workbench-embed-types.ts`, `use-embed-editor-messages.ts`, `website-embed-params.ts`, `use-prefer-local-editors.ts`, the embed builders in `editor-protocol*.ts` and the sandbox rows for them, and fix `tests/video-canvas-stage-autosave-runtime` / `workflow-native-stage-runtime` (they stub `usePreferLocalRemoteEditor() -> false`). Then `native-editors-guard` test (e) goes green. The `untrusted-content-sandbox-origin` expected iframe-surface table (`workbench-embed.tsx` count) must be updated in the same change.
3. **parent**: `src/shell/artifact-contract.ts` still declares adapter `chart-editor@1` / feature `chart_editing` (mirror of the server contract, plus `advanced-features.ts`, `library-editor-category.ts`, `visual-formats.ts` rows). Remove once the server contract drops chart editing; the registry tombstone can then go too. `mcp-apps/protocol.ts` has a comment pointing at the deleted `hosted-editor-origins.ts` (harmless).
4. **W08**: `ImageRoute` is now the target for kind `canvas` / `design-canvas` / `composite_image`; if it cannot open `oceanleo.design-document.v1` the item must be read-only there (I did not add a fallback).
5. **W09**: `WebsiteLocalRoute` is the only website route now; a durable website whose source is not `website-source@1` must open read-only with an error (it does today via `planWebsiteLocalSource`).
6. **parent (i18n)**: `src/i18n/ui/messages/work-replay-copy.ts` still holds 13 chart replay-note templates ("创建了图表", "新增了系列「{name}」", …) and `collab-visual-copy.ts` has chart keys. I did not touch i18n; `tests/work-replay-notes.test.mjs` carries a `DELETED_CHART_NOTE_TEMPLATES` exemption set — delete the set when the keys are removed.
7. **W06**: `tests/untrusted-content-pdf-frame-host.test.mjs:55` and `:80` have no `UC-n` reference (gate step "security assertions cite their rule").
8. **W07**: `tests/video-canvas-stage-autosave-runtime.test.mjs` and `workflow-native-stage-runtime.test.mjs` stub `usePreferLocalRemoteEditor()` as `false`; `workflow-react-flow-only` #9 and `W6-20261021-chart-model3d.mjs` 3D case were already red at HEAD.
9. Public barrels: nothing to remove (`src/index.ts`, `src/shell/index.ts` do not reference any deleted module); still run `npm run api:check`.

## package.json
- No change requested for my cluster. `echarts` / `@antv/ava` are no longer imported by product code from my side: parent should grep before removing (echarts may still be used by `quick-actions`/dashboards elsewhere; I did not check outside `src/shell`).

## Honest limitations
- `workbench-embed.tsx` + friends still exist (needed by W07's `VideoCanvasStage` dead branch); the sub-site iframe can no longer mount (trust table empty, `embedEditorBase` returns `""`, `usePreferLocalRemoteEditor` is `true`), but the code is not deleted until W07 lands. Guard test (e) stays red until then.
- No browser check (red line). Routing was verified with unit tests and module-bench mounts of `AdvancedContentWorkbench` (`advanced-workbench-reachability`), not in a real page.
- `vector_image` and charts are read-only without a converter; this is a product regression for people who edited SVGs in the design sub-site, taken from the operator decision (no shell-website editors) rather than a technical limit.
- Security gate: run before touching sandbox/origin code and re-run after; see the result line in the next section.
