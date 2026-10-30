# R3 — Main task page integration (AgentChat) and removal of the second UI

Read `R0-redo-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`, plus portal `/root/projects/oceanleo` for task/computer routes.

## Goal

AgentChat is again the single page. It decides which conversation is shown (`ConversationTarget`) and routes stream, composer and right pane accordingly. Delete `ComputerTaskWorkspace` and everything that drew the top strip.

R1 (native thread), R2 (dock/composer props) and R4 (terminal surface/settings) are being built IN PARALLEL against the contract in R0. Code against the contract signatures; when their files land (check `git log` / file existence), integrate and run the typecheck. If a sibling's export differs from R0, adapt on your side when trivial, otherwise write it under Requests and tell the parent in your final report.

## Build

1. Remove from AgentChat: `ComputerTaskWorkspace`, `ComputerTaskSettingsPane` imports/usages, `computerPickerOpen`, `computerDraftTarget` hydration effect, `computerTaskMode`, the `computerDockSlot`/`hideComputerDockControl`/`draftExecutionTarget` props, the `library` override with literal "设置". `SplitWorkspace left={stream-or-surface}` again.
2. Conversation state in AgentChat:
   - Task sessions: `listComputerTaskSessions(taskId)` when a task is open (and after creating one). Resolve the current conversation: URL `?computerSession=<sid>` (keep this param name; portal links use it) → that session; else for `mode==="computer"` tasks (and legacy `shell`) → the most recent session; else oceanleo with the task's bound target. Ignore and strip a legacy `computerSession=cloud` value on computer tasks (that produced the empty page).
   - Fix the bound target for computer tasks: the screenshot showed "Cloud" for a `mode="computer"` task. Find why (`taskExecutionTarget(r.data.task)` in `lib/execution-target.ts`, and what the task detail API returns for `computer_id`/`plan`), and make computer tasks show their computer. If the API omits `computer_id`, derive from the task's sessions instead; do not add a migration.
   - Draft (home, no task): conversation comes from the dock (`onConversationChange`); oceanleo keeps today's remembered execution-target behavior.
3. Rendering:
   - `oceanleo` → unchanged cloud stream + LeoComposer.
   - `native` view chat → `const thread = useNativeThread({computer, session, enabled})`; the SAME stream JSX renders `buildAgentRenderItems(thread.messages)` instead of task messages (factor the stream so the source of `messages`, `running`, `presentation`, empty hint, and handlers is switchable; native messages: no branch/regenerate/share/suggestions/quick-action chips; gate bubbles get `onNativeAnswer={thread.answer}`); `LeoComposer` gets `onSubmit` → `thread.send(text)`, `loading={thread.running}`, `onStop={thread.stop}`, attachments from thread, `modelPickerSlot={thread.modelPicker}`, `disabled` + placeholder from `thread.blockedReason`; `saveFailed` → one quiet stone line above the composer; `hasOlder` → the existing "load older"/scroll-top affordance style, or a small host-styled row at top of the stream.
   - `native` view cli / `terminal` → left pane = `<NativeTerminalSurface>` (R4) filling the space + `<ConversationBar>` (R2) under it. Keep every opened surface mounted (hidden) while switching so nothing restarts or cancels.
   - The composer and ConversationBar always receive `conversation`, `onConversationChange`, `taskSessions`, `onOpenSettings`, `settingsOpen`.
4. Switching (`onConversationChange`): oceanleo → show cloud stream (draft: also existing target change). native/terminal with an existing `sessionId` → switch, update URL `computerSession` via `history.replaceState`. Without session: in a task → `createComputerTaskSession(computerId, {kind, program, task_id, request_id})` then switch; in draft → for chat: wait for first send: create session (no task_id) → `onTaskCreated`/router push `/tasks/<id>?computerSession=<sid>` → once `thread.ready`, send the pending prompt exactly once (guard against StrictMode/double effects); for cli/terminal: create immediately and navigate. Never execute on selection; never cancel the cloud run.
5. Settings: `settingsOpen` state; when open, the right `SplitWorkspace` pane shows `<NativeSettingsPanel computer conversation dialog={thread?.dialog}>` with title `nativeSettingsTitle(...)` through the SplitWorkspace library/pane title mechanism the page already uses (inspect `SplitLibraryConfig`; add a proper title prop to SplitWorkspace only if missing). Closing restores the previous right content/tab (keep it mounted, hidden). Switching conversation while settings are open updates the panel to the new conversation; switching to oceanleo closes it.
6. Delete `src/shell/cloud-computer/task-host/**`, `src/shell/cloud-computer/task-workspace/**`, their exports in `src/shell/index.ts`, and tests `tests/computer-task-host.test.mjs`, `tests/computer-session-view.test.mjs`, `tests/computer-task-workspace-i18n.test.mjs` (parent owns i18n later). `ComputerTaskImport` (legacy deep link import used by portal `/root/projects/oceanleo/app/computers/**` or `/app/tasks/**`): keep the behavior by moving it to `src/shell/cloud-computer/computer-task-import.tsx` (host-styled, plain loading line) and update portal imports; check `git show 5c3f61b1 8e7e02a8 7d5c8044` in `/root/projects/oceanleo` for what the portal expects.
7. `src/architecture/public-api.snapshot.json`: regenerate with `node scripts/public-api-snapshot.mjs --write` (check the script's flag) after exports change; `npm run api:check` must pass.

## Tests

New `tests/agent-chat-conversations.test.mjs` (DOM; stub gateway and the R1 hook module if needed): no element above the stream besides existing ones (assert no `data-computer-task-workspace` and no strip); computer task resolves to its session and dock label shows computer · program; `computerSession=cloud` on a computer task does not produce an empty page; native chat renders mapped messages through AgentTranscriptBubble/AgentProgress (assert host bubble markers) and LeoComposer (not `data-oceanleo-cc-composer` or whatever marker agent-dialog Composer uses); sending routes to thread.send; switching keeps cloud stream mounted and does not call stop; terminal view shows surface + ConversationBar and no LeoComposer; settings gear opens right pane with title and restores previous content on close; draft native send creates session then sends once. Keep `tests/computer-task-api.test.mjs` and existing `tests/agent-chat-*.test.mjs` green. Portal: run the portal's focused tests touching tasks/computers routes if present, and `npx tsc --noEmit` there via run-heavy only if you changed it.

## Done when

All deletions done, typecheck (one guarded `run-heavy -- npx tsc --noEmit` at the end, after R1/R2/R4 commits exist) passes or remaining errors are listed precisely against a sibling, focused tests pass, `npm run api:check` passes, committed (own paths), Checkpoint filled with New strings and Requests.

## Checkpoint

Done 2026-10-30 (R3). Integrated against landed R4 `779d50ee`, R1 `5f691d29`, R2 `08cf56a6`.

### Files
- `src/shell/AgentChat.tsx` — removed `ComputerTaskWorkspace`, `ComputerTaskSettingsPane`, `computerPickerOpen`, the `computerDraftTarget` hydration effect, `computerTaskMode`, the W3 composer props and the literal "设置" library override; `SplitWorkspace left={leftPane}` (stream wrappers only, nothing above the messages).
  - Conversation state: `listComputerTaskSessions(taskId)`; resolution `?computerSession=<id>` → that session; else `mode=computer|shell` (or `plan.computer_workspace`) → most recent session; else OceanLeo. `computerSession=cloud` / stale ids are stripped (replaceState) and a computer task opens its session — no empty page. Draft conversation from the dock (`onConversationChange`).
  - One stream renderer `renderStream(pane)` (same scroll frame, AgentProgress/AgentTranscriptBubble, composer frame). Cloud pane keeps its original bubble/progress JSX; native pane = `buildAgentRenderItems(thread.messages)` with `onNativeAnswer={thread.answer}`, no branch/regenerate/share/suggestions/chips, `presentation.working` from `thread.running`, host-styled "读取更早的对话" row when `hasOlder`, one stone line for `blockedReason`, one quiet line "这段对话暂时没能保存到云端" only when `saveFailed`, LeoComposer with `modelPickerSlot={thread.modelPicker}`, thread attachments, Stop → `thread.stop`, input cleared only when `send` returns true.
  - Each native chat is `<NativeChatConversation>` (module component, one `useNativeThread` per session, keyed by session id, `enabled` only for the one on screen, kept mounted hidden). It sends the home→task handoff prompt once when `thread.ready` (`takePendingNativePrompt` removes first) and portals `<NativeSettingsPanel dialog={thread.dialog}>` into the right pane.
  - CLI/terminal: `<NativeTerminalSurface>` per opened session (kept mounted hidden, mounted in the same render it is chosen) + `<ConversationBar>` below; no LeoComposer. `onNativeSessionChange` → serialized `bindComputerTaskSession(session.id, id)`; the promise is returned (rejects on failure so R4 retries).
  - Switching: oceanleo → cloud stream (URL param removed); existing session → reuse + replaceState; missing in a task → `createComputerTaskSession(..., task_id)`; draft chat → created by the first send (`startNative`: create → `stashPendingNativePrompt` → `onTaskCreated` + `router.push(portalHref('/tasks/<id>?computerSession=<sid>'))`); draft CLI/terminal → created immediately and navigated. Nothing executes on selection; nothing stops the cloud run.
  - Settings: gear (`onOpenSettings`/`settingsOpen`) opens the existing right `SplitWorkspace` pane, `library.paneTitle`/`label` = `nativeSettingsTitle(conversation, tt)` plus a right-pane claim (the hidden ResultCanvas label would otherwise win); previous right content stays mounted hidden and is restored; switching to OceanLeo closes it; a send blocked by "not installed / not logged in" opens it (composer stays enabled for that case; offline/connecting is read-only).
  - Bound target bug: the task detail API (`AgentTaskQueryService.get` → `task_repository.task_detail`) does not select `computer_id`, and `computer_task_create` writes `plan={"computer_workspace":{...}}` with no `execution_target`, so `taskExecutionTarget` fell through to `{kind:"cloud"}`. Now `taskExecutionTarget` returns null for computer-workspace tasks without `computer_id`, and AgentChat derives `{kind:"computer", id, name}` from the task's sessions. No migration.
- `src/lib/execution-target.ts` — `isComputerWorkspaceTask(task)`; `taskExecutionTarget` takes `mode`.
- `src/lib/computer-task-api.ts` — `latestComputerTaskSession`, `findComputerTaskSession`, `computerTaskSessionsTarget`, and the shared handoff pair **`stashPendingNativePrompt(sessionId, text)`** / **`takePendingNativePrompt(sessionId): string | null`** (key `oceanleo.pending-native-prompt:<sid>`, JSON `{text, queued_at}`, removed before returned, >10 min discarded; exported via `@oceanleo/ui/lib` `export *`).
- `src/shell/cloud-computer/computer-task-import.tsx` — `ComputerTaskImport` moved here (same behavior: imports only the named native session, forwards once with `computerSession`; plain loading line; failure shows a bordered "管理设备" control, no underlined link). Barrel export name unchanged, so portal `app/computers/[id]` and `app/tasks/[id]` need no change (portal not edited).
- Deleted: `src/shell/cloud-computer/task-host/**`, `src/shell/cloud-computer/task-workspace/**`, `tests/computer-task-host.test.mjs`, `tests/computer-session-view.test.mjs`, `tests/computer-task-workspace-i18n.test.mjs`; `ComputerTaskWorkspace` export removed from `src/shell/index.ts`.
- `tests/agent-chat-conversations.test.mjs` (new, 10 tests); `src/architecture/public-api.snapshot.json` regenerated.

### Commands + results
- `agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<f>.test.mjs`:
  agent-chat-conversations 10/10, agent-chat-single-header 6/6, agent-chat-streaming 15/15, agent-chat-search-highlight 12/12, agent-chat-home-launch-keeps-transcript 14/14, computer-task-api 3/3, local-agent-task 12/12, agent-action-history-live 6/6.
- Same failures at base `48db3d66` (checked in a temp worktree), not caused by R3: eas-w03-agent-thread-live (render count), tpp-w3-thread #7, library-task-render-loop, one-task-library-agent-acceptance, workbench-toolbar-rendered, hit-target-budget, bay-shell-static, artifact-surface-rendered, effect-tt-dependency (remaining entry is `messages/conversation/ConversationView.tsx`).
- share-i18n-coverage: red only for the two new strings below (parent i18n).
- `agent-io-guard.sh run-heavy -- npx tsc --noEmit` (once, after R1/R2/R4 landed): exit 0, 0 errors.
- `node scripts/public-api-snapshot.mjs --check`: pass.

### New strings
- `没能打开这段对话，请稍后再试。` (AgentChat: create/switch failure)
- `这段对话暂时没能保存到云端` (contract wording; native save failure)
- `这段对话暂时打不开，请稍后再试。` (computer-task-import failure)
- `正在打开对话…` (computer-task-import loading)
- Reused existing: 读取更早的对话, 正在读取会话…, 在下方输入，开始与 agent 对话。, agent 正在思考…, 继续追问，或上传文件让 agent 分析…, 继续追问, 管理设备.

### Requests
- Parent (portal home `app/_components/home-content.tsx`): use `stashPendingNativePrompt` / `takePendingNativePrompt` from `@oceanleo/ui/lib` for the home → task handoff; AgentChat's task page consumes it.
- Tests stubbing `../lib/agent` without `authed` that compile the real AgentChat now also load the native thread (`useAgentDialogController` → `lib/cloud-computer-agent-api` imports `authed`); `library-task-render-loop` was already red at base for this reason. Owners: add `authed` to those stubs (or `export *` from the real module).
