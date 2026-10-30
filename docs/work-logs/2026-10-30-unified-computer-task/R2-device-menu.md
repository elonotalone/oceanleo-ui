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

Done (R2, 2026-10-30). Breakpoint reached: files committed, focused tests green.

### Files
- `src/shell/cloud-computer/ComputerDock.tsx`: one component for draft and bound tasks; W3 additions gone (`nativeComputer` text list, "用此电脑执行 OceanLeo 任务", "· 已安装/未安装/状态未知" suffixes, `openNative`, `createComputerTaskSession`, `inline`/`InlineComputerPicker`). The pre-W trigger and two-column popover are the baseline; the drill-down sits in the right column.
- `src/shell/cloud-computer/ConversationBar.tsx` (new): `ConversationBar` + `ConversationSettingsButton` (the one gear, used by LeoComposer too).
- `src/shell/LeoComposer.tsx`: removed `computerDockSlot`, `hideComputerDockControl`, `draftExecutionTarget`; added the conversation props.
- Tests: `tests/conversation-dock.test.mjs` (new), `tests/cloud-computer-dock.test.mjs`, `tests/cloud-computer-dock-remembered-name.test.mjs`, `tests/eas-w06-dock-and-links.test.mjs`, `tests/sko-w15-composer-slash.test.mjs`, `tests/execution-target.test.mjs`. `tests/d10-computer-dock-hydration.test.mjs` needed no change.

### Signatures
```ts
// ComputerDock.tsx
export type ComputerDockProps = {
  client?: CloudComputerClient; computers?: Computer[];
  onTargetChange?: (target: ExecutionTarget) => void;
  boundTarget?: ExecutionTarget | null;            // undefined draft, null loading
  conversation?: ConversationTarget;               // omitted = dock's own last pick
  onConversationChange?: (c: ConversationTarget) => void; // given => computer drill-down
  taskSessions?: ComputerTaskSession[];
  onBeforeNavigate?: () => void | Promise<void>;   // before 管理设备 only
};
export function ComputerDock(props: ComputerDockProps): JSX.Element;
export function TargetGlyph({ cloud }: { cloud?: boolean }): JSX.Element;

// ConversationBar.tsx
export type ConversationBarProps = { conversation: ConversationTarget; onConversationChange: (c: ConversationTarget) => void;
  taskSessions?: ComputerTaskSession[]; boundTarget?: ExecutionTarget | null; onOpenSettings?: () => void; settingsOpen?: boolean;
  client?: CloudComputerClient; computers?: Computer[] };
export function ConversationBar(props: ConversationBarProps): JSX.Element;
export function ConversationSettingsButton({ onOpenSettings, settingsOpen }: { onOpenSettings: () => void; settingsOpen?: boolean }): JSX.Element;

// LeoComposer.tsx: LeoComposerProps adds
conversation?: ConversationTarget; onConversationChange?: (c: ConversationTarget) => void;
taskSessions?: ComputerTaskSession[]; modelPickerSlot?: ReactNode; onOpenSettings?: () => void; settingsOpen?: boolean;
// kept: onBeforeComputerNavigate?: () => void | Promise<void>  (portal home-content.tsx still passes it)
// ComposerSubmitContext adds: conversation?: ConversationTarget
```

### Decisions
- Drill-down happens only when the host passes `onConversationChange`. Hosts that don't (subsites, the portal home today) keep the pre-W picker: clicking a computer selects it as the OceanLeo target. This way nobody gets rows that do nothing.
- Levels: computer list → `‹ <computer>` with OceanLeo / Codex / Claude Code / Cursor / Hermes / 终端 → `‹ <Program>` with 对话 (first) / 命令行 (with a muted hint). Back rows carry `data-dock-back` and get focus when the level changes. Escape and focus trapping are unchanged (AnchoredPopover).
- Status on the right side, only when something is wrong: 离线 (computer not ready), 未安装 (`listCliPrograms` row `installed:false`), 需要登录 (`logged_in === false` or `auth === "none"`; REST `cli/programs` does not send sign-in state today, so this shows only once the gateway adds it). The green dot means ready and installed; grey means offline or unknown.
- Offline computer: the agent and terminal rows can still be picked (to see saved history). The OceanLeo row is disabled because an offline computer can't run the task.
- Existing conversations: ✓ marks the one shown now. A small grey dot (`data-dock-exists`, aria-label 本任务已有) marks ones this task already has. When a pick matches an existing session, its `sessionId` is filled from `taskSessions`, using the most recent `updated_at`; otherwise `sessionId` is left out and the host creates one.
- Bound task: the trigger opens the same popover. Other cloud, computer and local targets are disabled, with the title 要换执行位置，请新建任务. The bound target's row stays enabled and switches back to the task's OceanLeo conversation (dot while another conversation is shown). Agents and terminal on any connected computer can be picked. The draft's remembered target is never read or written; `onTargetChange` is never called.
- Trigger: oceanleo uses the old label logic (云端 / name + local-off / mode / scope badges; when bound, name + scope, and the title says a new task is needed). Native: `elon · Codex`, `elon · Codex · 命令行`, `elon · 终端`, with the device glyph.
- When the dock opens on a native or terminal conversation, it starts at that computer's list.
- LeoComposer: if `conversation` isn't passed, it remembers the last pick itself, so `context.conversation` is still correct. A native or terminal conversation can send while `boundExecutionTarget === null`; the OceanLeo send still waits. After a native send the dock is not remounted (only draft OceanLeo sends reset the GUI scope as before). `modelPickerSlot !== undefined` replaces `ModelGroupPicker`, and `null` hides it.
- Gear: a round icon button with an svg cog, in the same style as the attach button (`h-7 w-7 rounded-full border`, pressed = `bg-neutral-100`). It has `aria-pressed={settingsOpen}` and `aria-label=tt("设置")`, sits right after the dock, and shows only for native or terminal conversations when `onOpenSettings` is given.
- ConversationBar uses the bottom-toolbar classes `flex items-center justify-between px-4 pb-3.5` and adds `pt-3`, because it is a standalone row under the terminal, not under the editor.
- 管理设备 is still the dock's only navigation. It awaits `onBeforeNavigate` first (failures don't block it).

### Tests (all `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`)
- conversation-dock 11/11, cloud-computer-dock 22/22, cloud-computer-dock-remembered-name 6/6, eas-w06-dock-and-links 4/4 (this file had not run at HEAD because of missing `auth/client`/`cloud-agent-api`/`ButtonSpinner` stubs; it is fixed now, and its stale empty-dock and `/settings/devices` assertions are rewritten to the current dock and `/devices`), sko-w15-composer-slash 19/19, execution-target 7/7, d10-computer-dock-hydration 3/3. Collateral checks: anchored-popover 12/12, composer-plugins-popover 4/4, mobile-native-attach 25/25, leo-assistant-and-composer-controls 4/4.
- `device-experience-i18n` is 1/2. Its only failure is the 4 New strings below having no `en` entries yet (parent-owned i18n). `g1-wave-tap-targets` test 2 was already failing (it asserts an old `data-oceanleo-cc-dock-empty` dock and lacks a domain stub); it is not in R2's list and was left alone.
- `git diff --check` clean. `run-heavy -- npx tsc --noEmit` on the shared working tree (siblings' uncommitted work included) printed no errors.

### New strings (tt, zh source; parent adds to i18n)
- `需要登录`
- `本任务已有`
- `要换执行位置，请新建任务`
- `在这台电脑的命令行里继续，记录和对话分开`
(Reused existing keys: 对话, 命令行, 终端, 返回, 设置, 离线, 未安装, 已选择.)

### Requests
- R3 / parent: AgentChat should pass `conversation`, `onConversationChange`, `taskSessions`, `modelPickerSlot={thread.modelPicker}`, `onOpenSettings`, `settingsOpen` to LeoComposer and route sends by `context.conversation`. The removed props `computerDockSlot`, `hideComputerDockControl`, `draftExecutionTarget` must be gone from AgentChat; old `ComputerTaskWorkspace` used `ComputerDock inline`, which no longer exists. Use `ConversationBar` under CLI/terminal surfaces.
- Parent (portal `/root/projects/oceanleo/app/_components/home-content.tsx`, which no child owns): for "home → elon · Codex → send", home has to pass `onConversationChange` to its LeoComposer and, on submit with a native `context.conversation`, create the managed session and navigate. CLI/终端 should create and navigate as soon as they are picked. Until that lands, home keeps the plain pre-W picker. `onBeforeComputerNavigate` is still accepted and now runs before 管理设备.
- Gateway (optional): add `logged_in`/`auth` to `GET /v1/computers/{id}/cli/programs` rows so 需要登录 can show in the menu. The dock already reads these fields.
