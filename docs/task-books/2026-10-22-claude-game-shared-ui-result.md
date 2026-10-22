# claude_game_ui_1022 result (2026-10-22)

Nothing committed, installed, rebuilt or deployed. No browser used.

## Behaviour per requirement

1. Play in place (`GamePlayDetail`, `src/shell/material-detail-slot.tsx`).
   - A host is registered and the item is a visible playable game: cover + 「开始游玩」 (button). A click mounts the host in the same panel with the item's current `artifactId` / `revisionId` (no `source`). Toolbar: 返回 (back to cover), 重新开始 (`reloadKey + 1`), 全屏 (fullscreen on the play container; refused or unsupported shows 当前环境无法进入全屏。). Runtime errors from the host show in an alert line.
   - No host (the other family sites): previous behaviour, 「开始游玩」 is the `artifactPlayHref` link; no href gives the honest message.
   - `library-viewers.tsx`: games always render `GamePlayDetail` (the embed branch is removed). Material detail slot resolves the current item via `getCurrentArtifactItem` as before.
   - Explore: `ExplorePlayableFeed` / `explore-shelf-dispatch` already hand the click to a host-injected `onPlay` / `navigate`; I did not change them. For in-place play the portal should route `onPlay` to the Library detail (which now plays in place).
2. Editor.
   - New `src/shell/game-editor/game-edit-access.ts`: `gameEditAccess` (own / fork / view-only) and `ensureOwnGameCopy` (uses `forkArtifact`).
   - Edit tab (`GameRoute.tsx`): prompt iteration forks first when the item is not the user's own, records the copy, iterates on it. When the runner returns `artifact` it is adopted (`artifactProjectionToLibraryItem` from `library-data`, which fixed the typecheck error), `recordSavedItem` is called, the host switches to the new revision, `dirty` is cleared, and there is no second save. The next iteration uses the new revision. Without `artifact` it keeps the old "generated, save later" path. View-only: iterate button disabled and a plain explanation is shown. A dirty Code draft blocks iteration and save from the Edit tab with a clear message (「代码页还有未保存的修改，请先保存…」). The Edit stage reads `head` state (not the stale `item` prop) for host identity.
   - Code tab (`GameCodeStage.tsx`): the host gets a `source` snapshot that changes only on load of a dirty stash, 运行 or 重载, and returns to `undefined` (saved revision) after save. Typing never changes the snapshot or remounts the host. Save uses `currentItem` / `head` for commit identity, cover and `previousRevisionId`, and forks first if the item is not the user's own (typing alone does not fork). A banner says "your changes save as your own copy" or "play-only". View-only disables the textarea and refuses save. No-source items show 「这个游戏没有可编辑的源码，目前只能试玩…」 and the saved version is still playable.
   - A stashed document with null params now falls back to `item.meta.paramDeclarations` (this fixed an order-dependent failure in `game-core-swap`).
   - Developer text removed from user-visible strings (`registerGamePreviewHost`, 共享包, preview rendition, editor manifest, revision wording). No host shows `tt("当前站点暂不支持试玩，请在 OceanLeo 主站打开")`.
3. `preview-host.ts` doc comment updated: `source` semantics, `srcDoc` in an opaque-origin sandbox without `allow-same-origin` (2026-10-16), and `envelopeUrl` never an iframe src.
4. i18n: new `src/i18n/ui/messages/game-play-copy.ts` (16 locales, 2 keys) registered in `shell-overhaul-copy.ts`. The tt coverage test shows no gaps from my files. It still fails on other owners' keys (Inbox, ConversationView, PluginChromeFrame, and others).
5. Tests: new `tests/game-main-site-1022.test.mjs`, 14 mounted-DOM tests with a fake host (list in the commands below).

## Changed files

- `src/shell/material-detail-slot.tsx`
- `src/shell/library-viewers.tsx`
- `src/shell/advanced-routes/GameRoute.tsx`
- `src/shell/game-editor/GameCodeStage.tsx`
- `src/shell/game-editor/preview-host.ts`
- `src/shell/game-editor/game-edit-access.ts` (new)
- `src/i18n/ui/messages/game-play-copy.ts` (new)
- `src/i18n/ui/messages/shell-overhaul-copy.ts` (2 lines)
- `tests/game-main-site-1022.test.mjs` (new)

No Explore files changed. `eas-w14-copy.ts`, the autosave controllers and `richdoc-pro-source.ts` show as modified in the tree; those belong to other owners.

## Contract notes for the portal owner

- `GamePreviewHostProps.source`: a stable string. A new value means restart with it. `undefined` means play the saved `artifactId` / `revisionId`. `reloadKey` changes mean remount or restart (the play toolbar's 重新开始, and the Edit tab after an iteration lands).
- The host must treat `artifactId` / `revisionId` as authoritative for saved play. They change after fork and after save. `envelopeUrl` is compatibility only and must not be an iframe src.
- The runner must return `{ ok: true, document, artifact }`, where `artifact` is the full normalized `ArtifactProjection` of the committed revision. The editor adopts it with no second save. `artifact.owner.originSiteKey` is required by the converter. Without `artifact`, the editor falls back to the unsaved path.
- The runner is called with the head revision after any fork (`artifactId` / `revisionId` of the user's own copy).
- `GamePlayDetail` only mounts the host when `isPlayableGameLibraryItem(item)` is true (visible, durable, game).
- `forkArtifact` needs `access.canFork`. Items with neither `canEdit` nor `canFork` are play-only.

## Commands

- Light runs of `agent-io-guard.sh run-light` (≤4 files each):
  - `material-detail-slot`, `game-core-swap`, `W6-r4-source-lifecycle`, `game-artifact-type-contract`: 40 pass, 0 fail.
  - `game-main-site-1022`, `eas-w20-game-video-canvas`, `advanced-workbench-reachability`, `p7-media-rest`: 39 pass, 0 fail (`game-main-site-1022` alone: 14 pass).
  - `advanced-workbench`, `advanced-adapter-contract`, `library-ppt-preview-adapter`, plus `g3-portal-typed-editor`: 37 pass, 1 fail. `g3-portal-typed-editor` hits a module-bench circular-import error through `MyLibrary`, not through my files.
  - `collab-game-readonly`, `W6-r2-source-lifecycle`, `game-ide-import-filename`, `W7-20261021-game-person-edit`: 13 pass, 4 fail. All 4 failures are not caused by my edits:
    - `W7` (3 tests): `userEditItemKey` keys by `artifactId || id`, but the test reads by `item.key`.
    - `collab-game-readonly` (1 test): its regexp expects `guardPluginSurface(createGameAgentSurface(agentPort), collabReadOnly)`. HEAD already has `guardPluginSurface({` there.
- `i18n-tt-key-coverage`: still fails for other owners' keys; none from my files.
- `pnpm typecheck` (`run-heavy`): `tsc --noEmit` finished with no errors.

## Residual risks

- Autosave could call the Code stage `flush` for a fork-able item, forking on the first autosave. The banner tells the user. The autosave owner decides whether autosave should wait.
- The fork happens at first save or iteration, not at the moment the editor opens. Local typing in a non-owned item stays in the draft until then.
- Fullscreen is only on the Library detail play container; the editors do not have it.
- Real-host behaviour (loading and error states, source restart) is untested here; tests use a fake host.
- `library-viewers.tsx` still imports `gamePlayEmbedHref` (now unused there).
