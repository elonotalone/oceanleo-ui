# R2 — Device control in the composer: device → agent / terminal → 对话 / 命令行

Read `R0-redo-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`.

## Goal

The only switching UI is the existing `ComputerDock` in `LeoComposer`'s bottom bar, extended with a drill-down in its existing popover style. Restore what W3 broke.

## Build

1. `ComputerDock.tsx`
   - Look at the pre-W version: `git show 94f631a7~1:src/shell/cloud-computer/ComputerDock.tsx`. That trigger and two-column popover are the visual baseline. Remove the W3 additions that don't match (the `nativeComputer` text list with "用此电脑执行 OceanLeo 任务", "· 已安装/未安装/状态未知" suffixes, `openNative` creating sessions/navigating). The dock must not call `createComputerTaskSession` or navigate; it only emits `onConversationChange`.
   - Drill-down inside the right column: clicking a connected computer (云端 group) shows a header row "‹ <computer name>" (back) and rows: **OceanLeo** (selecting = existing `choose({kind:"computer",…})` → `onConversationChange({kind:"oceanleo", target})`), **Codex, Claude Code, Cursor, Hermes** (status shown like existing rows: small dot + right-side muted text only when not ready: 未安装 / 需要登录 / 离线; use `listCliPrograms` / program status already used), **终端**. Clicking an agent row shows a third level "‹ Codex" with **对话** and **命令行** rows (对话 first; a short muted hint under 命令行: "在电脑上的命令行里继续，和对话是两段独立记录" or better wording, plain language). Each emits the corresponding `ConversationTarget`. Rows for conversations that already exist in this task (`taskSessions`) show "✓" when current and a small dot when it exists; picking reuses (`sessionId` filled from `taskSessions`).
   - Offline computer: rows still selectable (view saved history), right muted "离线".
   - Bound task (`boundTarget` not undefined): previously the dock rendered a read-only label. Now: the trigger opens the same popover; the OceanLeo conversation keeps its bound execution target (shown ✓, cannot be changed — other cloud/device targets disabled with a title explaining a new task is needed), but computers → agents/terminal remain selectable (adds a native conversation to this task). Draft (`boundTarget === undefined`) keeps existing remembered-target behavior.
   - Trigger label from `conversation`: oceanleo → existing label logic (云端 / device name + mode badges); native chat → `<computer> · <Program>`; cli → `<computer> · <Program> · 命令行`; terminal → `<computer> · 终端`. Glyph: device glyph for native/terminal.
   - Keyboard: existing `AnchoredPopover` focus behavior, back rows focusable, Escape closes.
2. `ConversationBar.tsx` (new): the composer-bottom-bar look (copy the exact container/padding classes of LeoComposer's bottom toolbar row) holding `<ComputerDock …/>` and the settings gear; used by the host below terminal/CLI surfaces.
3. `LeoComposer.tsx`
   - Remove `computerDockSlot`, `hideComputerDockControl`, `draftExecutionTarget` (and `onBeforeComputerNavigate` unless still used by someone — grep `/root/projects/oceanleo` and this repo).
   - Add `conversation`, `onConversationChange`, `taskSessions`, `modelPickerSlot`, `onOpenSettings`, `settingsOpen`. Pass through to `ComputerDock`. When `modelPickerSlot` is provided render it in place of `ModelGroupPicker`. Gear: icon button (svg cog in the style of the other bottom-bar icon buttons, `aria-pressed={settingsOpen}`, label tt("设置")) right after the dock, only when `conversation.kind !== "oceanleo"`.
   - `onSubmit` context: keep `executionTarget` for oceanleo; add `conversation` to the context object so the host routes native sends.
4. Every existing caller of ComputerDock/LeoComposer in this repo and `/root/projects/oceanleo` (grep) keeps compiling; do not edit AgentChat (R3) — R3 will switch AgentChat to the new props; until then AgentChat may fail typecheck because of removed props: that is expected; note it in your book.

## Tests

Update `tests/cloud-computer-dock.test.mjs`, `tests/d10-computer-dock-hydration.test.mjs`, `tests/cloud-computer-dock-remembered-name.test.mjs`, `tests/eas-w06-dock-and-links.test.mjs`, `tests/sko-w15-composer-slash.test.mjs`, `tests/execution-target.test.mjs` to the new behavior (remove assertions for the W3 hack props). New `tests/conversation-dock.test.mjs` (DOM, no browser): drill computer → agent → 对话 emits native chat target; 命令行 emits cli; 终端 emits terminal; OceanLeo emits oceanleo computer target; existing session reused (sessionId); bound task keeps OceanLeo target locked but allows native; label text per conversation; gear only for native/terminal and calls `onOpenSettings`; `modelPickerSlot` replaces ModelGroupPicker; selection never calls any create/navigate API.

## Done when

Focused tests pass, `git diff --check` clean, committed (own paths), Checkpoint filled with New strings and Requests.

## Checkpoint

Not started.
