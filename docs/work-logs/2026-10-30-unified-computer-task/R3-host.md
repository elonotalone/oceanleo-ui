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

Not started.
