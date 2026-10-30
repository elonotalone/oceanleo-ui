# R — Redo: one UI system for computer conversations (2026-10-30 PM)

Operator verdict on the W1–W5 result: "完完全全错误". The main task page grew a SECOND UI system. Operator rule: **one UI system only.** Operator approved the analysis and said "请彻底做好"; no browser/screenshots (static + HTTP + DOM tests only). LeoDev + local commits only. No push of oceanleo-ui/portal, no bump, no twin/production.

## What was wrong (do not repeat)

1. `ComputerTaskWorkspace` put a strip of unstyled text buttons ABOVE the chat (`Cloud · This task's permissions…`, `Device · Cloud OceanLeo ▾`, `Cloud OceanLeo`, `elon · Claude Code · Conversation`, 对话/命令行/终端/⚙会话设置). The original page has no such strip. DELETE it.
2. Native Codex/Claude conversations rendered with the Computers-page components (`agent-dialog/MessageList.tsx`, `agent-dialog/Composer.tsx`, `server-page/tone.ts` zinc palette) instead of the main page's stream (`AgentTranscriptBubble` + `AgentProgress` via `buildAgentRenderItems`) and `LeoComposer`. Different input box, different messages. The offline archive had a THIRD bare renderer.
3. The composer's real Device control (`ComputerDock` trigger with glyph/name/status) was replaced by a plain text "设备" button whose popover anchored to the top strip.
4. Settings pane = bare text title + text "关闭"; right pane label hard-coded untranslated "设置".
5. A `mode="computer"` task showed "Cloud"; `?computerSession=cloud` on a native task produced an empty page with "Open new cloud task".
6. Internal words leaked to users: 图形 / 独立 CLI / Conversation / 云端记录正在同步 / 查看云端保存的对话 underline link.

## Target experience (the only design)

- The task page is the ORIGINAL AgentChat page: same message stream, same `LeoComposer`, same right `SplitWorkspace` pane. Nothing new above the messages.
- The **Device control stays in LeoComposer's bottom bar** (the existing `ComputerDock` trigger and its existing two-column popover style: `rounded-2xl border-neutral-200 shadow-xl`, `row` = `rounded-xl px-3 py-2.5 text-[13px] hover:bg-neutral-100`). Drill-down inside that same popover: 云端 / 本地电脑 groups as before; a connected computer row opens that computer's list: **OceanLeo** (= existing `{kind:"computer"}` cloud-driven target, unchanged behavior), **Codex, Claude Code, Cursor, Hermes** (each with install/login state), **终端**. Picking an agent shows **对话 / 命令行** for it (对话 default). Back row "‹ 返回" at each level. Local Mac/Windows device targets keep working exactly as before. Trigger label reflects the current conversation, e.g. `elon · Codex`, `elon · Codex · 命令行`, `elon · 终端`, `云端`.
- **对话 (ACP) conversations render in the main stream**: the native dialog state is mapped to `AgentMessage[]` and goes through the SAME `buildAgentRenderItems` → `AgentTranscriptBubble` / `AgentProgress` path. User bubbles, assistant markdown, tool calls/plan/thought as the progress card, permission requests and questions as the existing gate bubble style (extended for multiple options). Sending, stop, attachments use LeoComposer; the model control is a native-model picker in the same compact style as `ModelGroupPicker compact` placed where the model picker is. Offline machine: the same stream shows the cloud-saved transcript (same mapper), composer disabled with one plain-language line.
- **命令行 / 终端**: the left pane shows the xterm surface (host-styled frame, no tone/zinc chrome, no program strip, no session sidebar) and directly below it a bar in the composer-bottom-bar style containing the SAME ComputerDock trigger + settings gear, so switching back is always one click away.
- **Settings**: a gear icon button beside the Device trigger appears only for native/terminal conversations. It opens the EXISTING right `SplitWorkspace` pane (library slot) titled e.g. `Codex 设置 · elon` / `终端设置 · elon`, content in host style, each group labeled with its scope (本对话 / 这台电脑上的 Codex / 整台电脑). Closing restores the previous right-pane content/tab. Selecting a program never auto-opens settings.
- Switching conversations never cancels running work and never executes anything. A task can hold its cloud OceanLeo conversation plus several native sessions; the Device menu marks which ones exist in this task (✓ / dot) and switching to one reuses it; a new session is created only when the task has none for that computer+program+view.
- From home (no task): choosing e.g. elon · Codex then sending creates the managed session/task (existing W1 API), navigates to `/tasks/<id>?computerSession=<sid>`, then sends the first prompt through the native thread. CLI/终端 from home create the session immediately and navigate.
- Plain-language status only. Never show 图形 / 独立 CLI / ACP / Conversation / sync jargon. A save failure is shown as one quiet line ("这段对话暂时没能保存到云端") only when true.

## Shared contract (fixed; changes go through the parent)

```ts
// src/shell/native-thread/types.ts — owned by R1, consumed by R2/R3/R4
import type { ExecutionTarget } from "../../lib/execution-target";
export type NativeProgram = "cursor" | "claude" | "codex" | "hermes";
export type ConversationTarget =
  | { kind: "oceanleo"; target: ExecutionTarget }          // the task's OceanLeo conversation (cloud / computer / local device), existing behavior
  | { kind: "native"; computerId: string; computerName: string; program: NativeProgram; view: "chat" | "cli"; sessionId?: string }
  | { kind: "terminal"; computerId: string; computerName: string; sessionId?: string };
```
`sessionId` = `ComputerTaskSession.id` (managed id from `lib/computer-task-api.ts`, unchanged backend). view "chat" ↔ session.kind "acp", "cli" ↔ "cli", terminal ↔ "terminal".

R1 exports from `src/shell/native-thread/index.ts`:
- `dialogToAgentMessages(messages: AgentDialogMessage[], opts: { live: boolean }): AgentMessage[]` — pure, deterministic ids (negative integers so branch/regenerate never apply), stable across re-renders.
- `useNativeThread(input: { computer: Computer | null; session: ComputerTaskSession | null; enabled: boolean; onNativeSessionChange?: (nativeId: string) => void }): NativeThread` where
  `NativeThread = { messages: AgentMessage[]; running: boolean; ready: boolean; offline: boolean; blockedReason: string | null; send(text: string): Promise<boolean>; stop(): void; answer(message: AgentMessage, optionIdOrAnswers: unknown): void; composerAttachments / onAttachFiles / onRemoveAttachment (LeoComposer-compatible shapes); modelPicker: ReactNode | null; hasOlder: boolean; loadOlder(): void; saveFailed: boolean; dialog: <controller from useAgentDialog> }`.
- `NativeModelPicker` (used inside `modelPicker`).
- R1 also extends `AgentTranscriptBubble` gate rendering: `meta.native_permission = { permId, options:{id,name,kind}[], chosen }` and `meta.native_question = {...}` render as the existing GateBubble look with one button per option; callback prop `onNativeAnswer?: (message: AgentMessage, answer: unknown) => void`.

R2 exports: `ComputerDock` props gain `conversation?: ConversationTarget`, `onConversationChange?: (c: ConversationTarget) => void`, `taskSessions?: ComputerTaskSession[]`; `LeoComposer` props gain `conversation`, `onConversationChange`, `taskSessions`, `modelPickerSlot?: ReactNode` (replaces ModelGroupPicker when given), `onOpenSettings?: () => void` + `settingsOpen?: boolean` (gear shown only for native/terminal conversation). R2 REMOVES the W3 hacks `computerDockSlot`, `hideComputerDockControl`, `draftExecutionTarget` (and `onBeforeComputerNavigate` if unused). R2 exports `ConversationBar({conversation,onConversationChange,taskSessions,boundTarget,onOpenSettings,settingsOpen})` from `src/shell/cloud-computer/ConversationBar.tsx` — the composer-bottom-bar-styled row used under terminal/CLI.

R4 exports from `src/shell/cloud-computer/native-surface/index.ts`:
- `NativeTerminalSurface({ computer, session, active, onNativeSessionChange })` — session.kind cli|terminal, fills its parent, host-styled, offline message in plain language.
- `NativeSettingsPanel({ computer, conversation, dialog? })` — host-styled scoped settings for native chat (needs R1's `thread.dialog`), CLI and terminal (appearance). Title text helper `nativeSettingsTitle(conversation, tt)`.

R3 owns integration in AgentChat and deletes the old workspace.

## Ownership (disjoint)

- R1 native thread: new `src/shell/native-thread/**`; `src/shell/AgentTranscriptBubble.tsx` (gate extension only); `src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx`, `reduce.ts`, `types.ts` if needed; new tests `tests/native-thread-*.test.mjs`.
- R2 device menu: `src/shell/cloud-computer/ComputerDock.tsx`, new `src/shell/cloud-computer/ConversationBar.tsx`, `src/shell/LeoComposer.tsx`, `src/shell/ModelPicker.tsx` (style reuse only if needed); tests `tests/cloud-computer-dock*.test.mjs`, `tests/d10-computer-dock-hydration.test.mjs`, `tests/execution-target.test.mjs`, `tests/sko-w15-composer-slash.test.mjs`, `tests/eas-w06-dock-and-links.test.mjs`, new `tests/conversation-dock.test.mjs`.
- R3 host: `src/shell/AgentChat.tsx`, `src/shell/SplitWorkspace.tsx` (only if a title prop is missing), `src/shell/index.ts`, `src/lib/index.ts`, `src/lib/computer-task-api.ts`, `src/lib/execution-target.ts`, delete `src/shell/cloud-computer/task-host/**` and `src/shell/cloud-computer/task-workspace/**` (keep legacy deep-link import behavior by moving it into a small host-owned helper), portal `/root/projects/oceanleo/app/tasks/**`, `/root/projects/oceanleo/app/computers/**` (only what the import/forward needs), tests `tests/computer-task-host.test.mjs`, `tests/computer-session-view.test.mjs` (delete/replace), `tests/computer-task-api.test.mjs`, `tests/agent-chat-*.test.mjs`, new `tests/agent-chat-conversations.test.mjs`, `src/architecture/public-api.snapshot.json`.
- R4 surfaces: `src/shell/cloud-computer/terminal-card/**`, `src/shell/cloud-computer/agent-dialog/AcpCard.tsx`, `AcpSettings.tsx`, `MessageList.tsx`, `Composer.tsx`, `ArchivedAttachment.tsx` (Computers-page standalone stays working; remove dead `embedded` branches once nothing embeds AcpCard), new `src/shell/cloud-computer/native-surface/**`; tests `tests/cli-card-view.test.mjs`, `tests/terminal-card-view.test.mjs`, `tests/acp-card-flows.test.mjs`, new `tests/native-surface.test.mjs`.
- Parent: this contract, i18n copy file `src/i18n/ui/messages/computer-task-workspace-copy.ts` (+17 languages), oceandino code map/manifest, final integration, typecheck, LeoDev freshness. Children write user-visible strings as `tt("中文")` and LIST every new string in their book's "New strings" section; do not edit i18n files.

## Rules for every child

- Read this file, your R-book, kernel `/opt/cursor-workspaces/oceandino/AGENTS.md`; run `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh` first.
- Edit only your files. If you need a change in another owner's file, write it in your book under "Requests" and work against the contract.
- Visual rule: host tokens only (neutral/stone, `rounded-xl`/`rounded-2xl`, `text-[12px]/[13px]`, existing svg glyph style). No `tone.*`, no zinc-palette chrome, no emoji icons, no underlined text links as controls.
- Focused tests: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`. Full typecheck only via `run-heavy -- npx tsc --noEmit` and at most once at the end.
- No browser, Playwright, screenshots. No push, bump, deploy, migration.
- Commit on `main` only your own paths: `git add <paths> && git commit -m "<msg>" -- <paths>`; if `index.lock` exists, wait 5s and retry. Never `git add -A`, never reset/checkout others' files. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Update your R-book Checkpoint section with files, decisions, exact commands + results, New strings, Requests.

## Root final acceptance (2026-10-30 ~17:55)

- Commits (oceanleo-ui main): 48db3d66 contract · 779d50ee/7fc228d2 R4 · 5f691d29/304e1329 R1 · 08cf56a6/b0eeab12 R2 · 81d4ada7/1a4073d9/1fda6c2f R3 · 22ba95fb/4384a346 R5 · a8ee1e34 V1 findings. Portal (oceanleo main, local only): 00cd51ed, babc246d home handoff. oceandino a78c7a866 map/manifest/§15 (pushed to GitHub).
- Root-run checks: UI `tsc --noEmit` 0 errors; portal `tsc --noEmit` 0 errors; `public-api-snapshot --check` ok; 31 focused/regression test files 350/351. The single failure, `ui-followup-project-cards` (missing `COLLECTION_ACTION_BTN_GHOST` in its module bench), fails identically at 9dcf64cb with the sibling portal present. The full suite at base vs. mid-fix head showed no new failing files beyond those re-run green here.
- V1 read-only audit: no tone/agent-dialog presentational import on the task page; one stream; Device drill-down inside the original ComputerDock. Its 20 findings were fixed by the owners (see V1-review-fixes.md and each Fix checkpoint).
- LeoDev: `oceanleo` slot FRESH(dev), 0 STALE; `/`, `/tasks/<computer task>?computerSession=cloud`, `/history`, `/computers/x` → 200 with no compile errors.
- Not done (not authorized): browser/screenshots, real devices, twin/production push, package bump. Gateway: `cli/programs` rows do not report sign-in state, so the menu cannot show 需要登录 before connecting (the composer still says so once the chat connects).
