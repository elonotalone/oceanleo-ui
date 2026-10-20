# Dispatch contract — editor repair 2026-10-21

Date: 2026-10-21
Playbook: `docs/architecture/big-project-playbook.md`

Operator ordered the defects below finished thoroughly on LeoDev. Subagents authorized. Parent model `cursor-grok-4.6-xhigh`.

## Goal function check

- [x] Parent product implementation/acceptance minimized
- [x] Every disjoint substantial hot-file cluster has its own owner
- [x] No owner padded with inventory

## Confirmed defects → owners

| ID | User-visible defect | Primary files (exclusive) | Owner |
|---|---|---|---|
| 1 | Markdown library item opens blank in Umo; preview 410; save sends Word | rich-doc-*, RichDoc*Route, richdoc-pro-source, library-viewers 410 path, umo-hosted onSave | W1 |
| 2 | Autosave / “正在载入图像画布” without the person editing — all editors | advanced-persistence-controller, workbench, user-edit gate, selection-transactions | W2 |
| 3 | Image: XY on edit bar; 结构/皮肤; listed AI tools; loading overlay on save | image-editor/**, ImageRoute.tsx | W3 |
| 4 | Download icon in a filled circle, unlike share/favorite | AdvancedWorkspaceActionBar, PluginChromeFrame download actions | W4 |
| V | Independent acceptance of 1–4 | tests/editor-repair-20261021-acceptance*.mjs, acceptance-final.md | V1 |

## Architecture (do not reopen)

- Document save media type = admitted source format of the open item (`md` → `text/markdown`). Gateway MIME gate stays closed.
- Autosave requires an explicit user-edit generation > 0 at the persistence controller. Load-time `dirty`/`revision` is not enough.
- 结构/皮肤 is a dead switch (`designMode` is not consumed by the canvas). Delete the control; do not invent a working structure/skin product in this wave.

## Implementation owners

### W1 Document open/save

See `tasks/W1.md`.

### W2 Autosave gate

See `tasks/W2.md`.

### W3 Image chrome and AI removal

See `tasks/W3.md`.

### W4 Download icon

See `tasks/W4.md`.

## Independent acceptance

### V1

See `tasks/V1.md`. Wait marker: `deliveries/W1.md` … `W4.md` exist and are non-empty. No product `src/` edits. Landed: verdict complete on W1–W4.

## Remaining wave (after W1–W4)

W2 left a documented gap: editors that never call `recordUserMutation` never autosave after a real edit. Operator rule still binds: every editor.

| ID | User-visible defect | Primary files (exclusive) | Owner |
|---|---|---|---|
| 5 | Grid / native deck / hosted PPT edits never autosave | GridUniverStage, use-deck-editor, DeckHostedRoute | W5 |
| 6 | Video / audio / PDF / chart / 3D edits never autosave | video-editor, VideoCanvasStage, audio mutations, pdf engine, chart workbench, model3d workbench | W6 |
| 7 | Design canvas / game / embedded edits never autosave | use-local-design-canvas, GameCodeStage, EmbeddedRoute | W7 |
| V2 | Independent acceptance of 5–7 | tests/editor-repair-20261021-acceptance-remaining-autosave.mjs, acceptance-remaining.md | V2 |

Website local stays `autoSave: false`. Do not change it.

See `tasks/W5.md`, `tasks/W6.md`, `tasks/W7.md`, `tasks/V2.md`.

## Parent allowlist

Dispatch contract; launch/resume; cross-owner arbitration after delivery; leftover grep-test rewrites; ImageRoute `guardPluginSurface` restore after W3 deleted the AI `runAi` viewOnly return; generated CSS; `pnpm typecheck` / `api:check` / `architecture:check`; LeoDev freshness; twin pin `--only oceanleo` + portal `main` after verification. No product implementation while owners are live.

## IO budget

- Task books first wave: N = 5 (W1 W2 W3 W4 V1) — landed
- Task books remaining: N = 4 (W5 W6 W7 V2)
- Concurrent remaining owners: 4
- Full-tree-scan directives in books: 0
- `_COMMON.md` full-tree-scan directives: 0
- Density = 0

## Launch self-check

- [x] All W* and V* launched in one parent message (first wave)
- [x] Model `cursor-grok-4.6-xhigh` named on every child
- [x] Task books committed before dispatch
- [ ] Remaining W5 W6 W7 V2 launched in one parent message after their task books are committed
