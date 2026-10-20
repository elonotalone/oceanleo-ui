# V1 acceptance — editor repair 2026-10-20

Independent behavioral acceptance. No product source edits. No browser, Playwright, screenshots, production, dep installs, or service changes.

Measured on oceanleo-ui `11271d9d` plus **uncommitted W3 chrome** (`AdvancedWorkspaceActionBar`, `PluginGlobalRow`, `InlineAdvancedWorkbenchShell`, `editor-item-social-chrome`, `inline-editor-mine-panel`, related icons/collab/header/frame). W1 `0ce86530` / `91eb28b4`, W2 `d97ef932`, W4 `70380329`, W5 `c1914a55`, W6 `59e9e746` are on local `main`.

Integrity / CAS / origin / permission checks were not loosened. This file does not mark pass from source-string greps.

## Operator defects → owners

| # | Screenshot / symptom | Owner | Landed? | V1 coverage |
|---|---|---|---|---|
| 1 | Preview has body; Edit/Umo blank (`21c1e4d9-…`) | W1 | yes `0ce86530` | `editor-repair-acceptance-source-load.test.mjs` richdoc |
| 2 | Autosave `保存被拒绝（integrity-failed）` | W2 | yes `d97ef932` (+ gateway `3ace4e8f`) | `editor-repair-acceptance-save-integrity.test.mjs` |
| 3 | Shared edit bar commands | W5 | yes `c1914a55` | `editor-repair-acceptance-edit-bar.test.mjs` |
| 4 | Icon-only row + share/favorite | W3 | **uncommitted, no delivery** | `editor-repair-acceptance-chrome.test.mjs` |
| 5 | 我的库 without SplitWorkspace | W3 | same | same, standalone shell |
| 6 | Left AI composer mid-column | W4 | yes `70380329` | `editor-repair-acceptance-chat-layout.test.mjs` |
| 7 | Other 12 plugins blank-open / save mapping | W6 | yes `59e9e746` | plugin-matrix + source-load non-richdoc |

## Verification matrix (13 plugins)

Ids from `PLUGIN_THEME_SPECS` / `TRUSTED_EDITOR_REGISTRY`: richdoc, grid, chart-editor@1, deck, image, pdf, audio, video-timeline, threed, game, design-canvas, website, video-canvas.

| Adapter | Theme / round-trip / save contract / ≠ office | Source fail-closed (V1 or W6) |
|---|---|---|
| richdoc | pass | pass — markdown/html/text hydrate; sourceless stays `source: "empty"` |
| grid | pass | pass — durable missing source throws, not `[emptyGridSheet()]` |
| chart-editor@1 | pass | pass — inline option hydrates; missing source `ChartSourceError` |
| deck | pass | pass — `deckProjectUrlFor` empty |
| image | pass | pass — empty project JSON rejected |
| pdf | pass | pass — `allowBlank: false` |
| audio | pass | W6 admission 7/7; V1 does not duplicate route audit |
| video-timeline | pass | W6 |
| threed | pass | W6 |
| game | pass | W6 |
| design-canvas | pass | W6 |
| website | pass | W6 |
| video-canvas | pass | W6 (route pass-through; persist lives in unowned workflow-carrier) |

Website fixture is a blank draft (`!url && !previewUrl`). Game sets `advanced_editor_route: "game"`.

## V1 owned suite

Loader:

```
node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types \
  --experimental-loader ./tests/ts-extension-loader.mjs \
  --test --test-concurrency=1 --test-timeout=180000
```

`run-light` classifies six files together as heavy; ran as two batches of three.

| File | Tests | Result |
|---|---|---|
| `tests/editor-repair-acceptance-plugin-matrix.test.mjs` | 3 | 3 pass |
| `tests/editor-repair-acceptance-source-load.test.mjs` | 7 | 7 pass |
| `tests/editor-repair-acceptance-save-integrity.test.mjs` | 3 | 3 pass |
| `tests/editor-repair-acceptance-edit-bar.test.mjs` | 4 | 4 pass |
| `tests/editor-repair-acceptance-chrome.test.mjs` | 2 | 2 pass **on uncommitted W3 tree** |
| `tests/editor-repair-acceptance-chat-layout.test.mjs` | 2 | 2 pass |
| **Total** | **21** | **21 pass on this worktree** |

Chrome greens require W3's uncommitted files. Parent rerun on a tree without those files will go red on the two chrome tests until W3 commits.

## Focused owner regressions (same loader)

| Suite | Result |
|---|---|
| `tests/W1-richdoc-source-import.test.mjs` | 8/8 pass |
| `tests/W2-revision-integrity.test.mjs` + persistence-retry + plugin-store-artifact-cas + session-record-saved-item | 13/13 pass |
| `tests/W3-editor-chrome-library-share-favorite.test.mjs` | 4 tests passed, then **file timed out at 180000ms** (`testTimeoutFailure`, 1 cancelled) |
| `tests/W4-conversation-anchor.test.mjs` | 5/5 pass |
| `tests/W5-edit-bar-command-dispatch.test.mjs` + `tests/W5-edit-bar-command-effects.test.mjs` | 12/12 pass |
| `tests/W6-non-richdoc-source-lifecycle.test.mjs` | 7/7 pass |
| `tests/w2-editor-save-contract.test.mjs` (pre-existing, run with W6) | included in 33/33 combined batch |

Gateway `backend/tests/test_w2_revision_wire_integrity.py` was **not** re-run here (W2 already recorded it; V1 does not mutate oceanleo services).

## Exact failures

### 1. `pnpm typecheck` (`run-heavy`) — fail, exit 2

Current tree:

```
src/shell/AdvancedContentWorkbench.tsx(641,63): error TS2345: mergeFromLatest '(latestSnapshot: unknown) => unknown' not assignable to '(latestSnapshot: unknown) => Record<string, unknown>'.
src/shell/AdvancedContentWorkbench.tsx(669,67): error TS2345: same mergeFromLatest mismatch.
src/shell/advanced-routes/GameRoute.tsx(397,14): error TS2339: Property 'error' does not exist on type 'NonRichdocSourceAdmission' ({ ok: true } branch).
src/shell/advanced-routes/richdoc-pro-source.ts(359,14): error TS2783: 'ok' is specified more than once.
src/shell/doc-editors/rich-doc-model.ts(78,15): error TS2339: Property 'isSupported' does not exist on the sanitizer import union.
src/shell/office-editor/office-source-cache.ts(28,53): error TS2345: `string | undefined` passed to `isArtifactSourceTreeUrl(string)`.
```

Owners: W2 (AdvancedContentWorkbench), W6 (GameRoute), W1 (richdoc-pro-source, rich-doc-model, office-source-cache). V1 did not edit them.

### 2. Generated CSS missing W4 host-stretch utilities — parent-owned

`AGENT_CONVERSATION_HOST_STRETCH_CLASS` is `[&:has([data-agent-conversation])>*]:flex|h-full|min-h-0|flex-1|flex-col`. `src/theme/ui.css` has **no** `data-agent-conversation` rules. React `className` tests are green. The screenshot path through `PluginThemeScope` / fragment wrappers still needs generated CSS.

### 3. W3 not delivered / not committed

No `deliveries/W3.md`. Product chrome remains unstaged. V1 chrome acceptance is green only while those files stay in the worktree. W3's own suite timed out at 180s after four passing cases.

Share/favorite are rendered inside the existing `download` slot because parent-owned `GLOBAL_ROW_SLOTS` (`src/shell/plugin-chrome/plugin-pages.ts`) is `back | library | save-state | download | theme | maximize | collab`.

### 4. W6 parent follow-ups (not V1 reds)

From `deliveries/W6.md`: unowned `use-fabric-image-editor.save` still clears `sceneDiagnostic` then snapshots; unowned `use-local-design-canvas` still blanks on parse catch; video-canvas persist lives in workflow-carrier; game edit page has no command surface.

## What is already holding

- 13 plugins remain routable with load/mutate/save/reopen and a non-empty save contract. Legacy `office` is not selected.
- Existing document bytes hydrate; sourceless durable docs/grids/charts/pdfs/images fail closed instead of a saveable blank.
- Save contracts refuse missing full/http/view-only payloads. `createArtifactRevision` keeps 409 integrity-failed as `ok: false`. `withRecovery` keeps the dirty draft after CAS conflict. Empty digest is not sent (W2).
- Edit-bar dispatcher keeps last selection after blur, rejects stale ids, preserves pointerdown, maps Ctrl+Z, fires document-segment actions. Representative Fabric bold/font-size/undo hold in W5 tests.
- On the W3 worktree: library buttons are icon-only with accessible names; 我的库 opens `mine` (standalone via `openTransientPanel`); share/favorite bind `artifactId`/`revisionId`.
- `FunctionAgentChat` agent tab is `flex h-full min-h-0 flex-col`; transcript `flex-1 min-h-0 overflow-y-auto`; composer dock last + `shrink-0`. Plugin chrome aside is a flex column with `min-h-0 flex-1` body.

## Parent-only (V1 breakpoint)

1. Regenerate `src/theme/ui.css` so W4 `:has([data-agent-conversation])` stretch utilities exist. Children must not edit generated CSS.
2. Full typecheck after W1/W2/W6 fix the six `tsc` errors above. V1 must not edit those files.
3. Land W3 chrome (or parent rerun will fail V1 chrome tests). Optional: add `share` / `favorite` to `GLOBAL_ROW_SLOTS` if download-slot placement is not the chrome contract.
4. W6 unowned image/design/video-canvas persist hooks if parent wants those adapters unable to blank internally.
5. LeoDev freshness / twin sync after typecheck is green. No 上线. No production. No push by V1.

Parent independently reruns required checks per kernel.
