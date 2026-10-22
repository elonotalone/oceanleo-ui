# Main-site game play/edit — shared UI owner `claude_game_ui_1022`

Parent: Claude Code session continuing a Codex session that died on quota
(operator 2026-10-22). Model: Claude Sonnet 5.5, medium effort, no fast mode —
operator's explicit choice. Parent owns integration, the full typecheck and
every commit. Do not commit, push, install, rebuild, deploy, or use a browser.
Main-only shared worktree: other owners edit other files of this repo at the
same time; never `git checkout`/`stash`/`reset`; never revert files you do not
own.

Read first: `/opt/cursor-workspaces/oceandino/AGENTS.md`,
`/root/.oceanleo-workstation/INSTRUCTIONS.md`, packs
`/root/.cursor/rules/oceanleo.mdc` and `/root/.cursor/rules/untrusted-content.mdc`;
run `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`. Read
`/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-library-game-play.md`
and the sibling book `2026-10-22-claude-game-portal-runtime.md` (the portal
host owner you integrate with).

## Operator goal (authoritative)

Main site = portal (`/root/projects/oceanleo`, LeoDev slot
`https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/`, which links this
local package with hot reload). Games must be playable and editable there:

- 游玩: clicking play runs the game in place, with restart, fullscreen, back.
- 编辑: the editor opens on the main site; the user can modify and test-play.
- After saving, play opens the saved version; editing someone else's template
  saves to the user's own copy (fork).
- Only-play permission or missing editable source → explain clearly; never
  open a dead editor.
- The bottom-right "1 changes still not saved" toast is NOT yours (autosave
  owner).

Screenshots (operator, LeoDev): Library detail of game
`8f812a82-6af1-438e-bf85-b8655bf4e6de` 「编辑器示例 • 游戏 — 海岸井字棋」 shows a
cover and 「开始游玩」 that opens `game.oceanleo.com` in a new tab; the editor
(Edit / Pro edit / Code tabs) shows a black stage with
「可玩预览需要宿主站注册沙箱容器（registerGamePreviewHost）。共享包不会自行渲染游戏 iframe…」.

## Contract with the portal host (do not change without the parent)

- `GamePreviewHostProps` in `src/shell/game-editor/preview-host.ts` gains
  optional `source?: string` (already added): the unsaved draft HTML document,
  passed as data. When absent, the host plays the saved `artifactId` /
  `revisionId`. The editor must pass a **snapshot** that only changes on
  run / reload (never per keystroke); a new `source` value means "restart
  with this". `envelopeUrl` stays for compatibility and must never be used as
  an iframe src.
- `GameIterationResult` in `src/shell/advanced-routes/GameRoute.tsx`:
  `{ ok: true; document; artifact?: ArtifactProjection } | { ok: false; error }`.
  The portal runner (`/root/projects/oceanleo/app/_components/game-iteration-client.ts`)
  calls the real backend iterate endpoint, which commits a new revision and
  returns it as `artifact`; the editor must adopt it (no second save).

## Current state (previous owner, interrupted, untested)

Uncommitted edits by the previous Codex owner in your files — review
critically, keep/fix/replace, then test:
- `material-detail-slot.tsx`: `GamePlayDetail` now mounts the registered host
  in place (back / restart / fullscreen) and disables play when no host.
- `library-viewers.tsx`: games always render `GamePlayDetail` (embed branch
  removed).
- `GameRoute.tsx`: `sourceDirty`, `currentItem` ref, adoption of
  `result.artifact`, guard for non-editable heads, `source` passed to host.
  **Typecheck currently fails here**: `artifactProjectionToLibraryItem` is
  not exported by `../artifact-contract` — find the right existing converter.
- `GameCodeStage.tsx`: `currentItem` ref for save identity, `sourceDirty`
  stash, preview gets `source`, editor disabled until source is ready.

## Deliver

1. `GamePlayDetail` (Library / material detail): with a registered host →
   in-place play: cover + 「开始游玩」 → host mounted for the item's **current**
   saved revision, toolbar 返回 / 重新开始 / 全屏 (fullscreen on the play
   container; graceful message if refused), loading/error states. Without a
   registered host (the other ~35 family sites) → keep the previous behaviour
   (link to `artifactPlayHref`) so nothing regresses; if no href, the honest
   message. Find every main-site play entry point (Library detail, material
   detail slot, Explore playable feed in `explore-artifact-class.ts` and its
   renderers) and make them play in place when a host is registered.
2. Editor (`GameRoute.tsx` legacy Edit tab + `GameCodeStage.tsx` Code tab):
   - Opening 编辑 on an item the user cannot edit (public template / someone
     else's) must fork into the user's own copy through the existing contract
     (`forkArtifact` etc.; see `tests/W7-20261021-game-person-edit.mjs` and
     existing fork flows) before any modification, then edit/save the copy.
   - Edit tab prompt iteration: uses the registered runner; adopts the
     returned saved `artifact` (revision advances, `recordSavedItem`, no
     double save); the next iteration uses the new expected revision.
   - Code tab: edits source; 运行/重载 previews the current draft via the
     `source` snapshot; save commits a revision with the correct identity
     (`currentItem`), then previews the saved revision; source/provenance
     preserved; decide how a dirty Code draft interacts with Edit-tab
     iteration (block with a clear message or save first — keep it simple and
     truthful).
   - No editable source / view-only → clear explanation, Code tab not a dead
     end.
   - Remove developer-facing text (`registerGamePreviewHost`, 共享包…) from
     every user-visible string; when no host is registered show a user-facing
     line (e.g. 当前站点暂不支持试玩，请在 OceanLeo 主站打开) via `tt()`.
3. Update the doc comment in `preview-host.ts`: hosts assemble saved/draft
   documents into an opaque-origin `srcDoc` frame (sandbox without
   `allow-same-origin`, per the 2026-10-16 decision); the signed
   `envelopeUrl` must still never be an iframe src; `source` semantics.
4. i18n: new copy through `tt()`; check whether dictionary coverage tests
   require entries in `src/i18n/**` and add them.
5. Tests (new `tests/game-main-site-1022.test.mjs`, plus updates to existing
   game tests you affect): mounted DOM tests with a fake registered host —
   play mounts host with the right artifact/revision; restart bumps
   `reloadKey`; back returns to cover; no-host fallback link; Code run passes
   the draft snapshot and does not remount per keystroke; save advances
   revision identity; iteration adoption without a second save; fork before
   editing a non-owned item; honest no-source state.

## Ownership

Own: `src/shell/material-detail-slot.tsx`, the game branch of
`src/shell/library-viewers.tsx`, `src/shell/advanced-routes/GameRoute.tsx`,
`src/shell/game-editor/**`, Explore playable rendering files you need for
item 1 (list them in your result), their i18n keys, new
`tests/game-main-site-1022.test.mjs` and existing game tests.

Do not edit: `src/shell/index.ts` (ask the parent for export changes),
autosave/persistence/background controllers (`advanced-*-controller.ts`,
`use-advanced-autosave.ts`, `advanced-background-*`), `MyLibrary.tsx`,
`WorkspaceLibrary.tsx`, `library-current-identity.ts`, virtual list /
thumbnail / cover files, package manifests, generated CSS, any other repo.

## Commands

Focused tests (≤4 files per run or the guard calls it heavy):

```
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 <files>
```

Find existing tests that import your files (`rg -l 'GameRoute|GameCodeStage|material-detail-slot|GamePlayDetail|preview-host' tests`)
and run them. One typecheck at the end:
`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
(other owners' in-progress files may error — report only yours). No full suite.

## Result

Write `docs/task-books/2026-10-22-claude-game-shared-ui-result.md`: behaviour
per requirement, changed files, contract notes for the portal owner, commands
with pass/fail counts, residual risks. Your final message repeats the
essentials.
