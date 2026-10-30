# R1 — Native conversations through the main chat stream

Read `R0-redo-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`.

## Goal

Make a Codex / Claude Code / Cursor / Hermes conversation on a computer renderable by the ORIGINAL main chat stream and drivable from `LeoComposer`, with no Computers-page presentational component involved.

## Build

1. `src/shell/native-thread/types.ts` — exactly the `NativeProgram` / `ConversationTarget` types in R0.
2. `src/shell/native-thread/map-dialog.ts` — `dialogToAgentMessages(messages, { live })`:
   - `user` → `{ role:"user", kind:"text", content:text, meta:{ attachments } }` (map `UserMessageAttachment` to `AgentAttachment` shape that `AgentTranscriptBubble` already renders; archived attachments keep their `download_path` link via existing attachment rendering — check how the bubble shows attachments and match it).
   - `turn` items in order: `assistant` → `{role:"assistant", kind:"text", content}` (consecutive assistant chunks of one turn may merge; the last one of a finished turn gets `meta.final=true`); `tool` → `{role:"assistant", kind:"step", content: tool.title, meta:{ step_index, tool_status, native_tool:true }}` so `buildAgentProgressActions` lists it; failed tools say so in the label; `thought` → `kind:"analysis"` (collapsed in the progress card); `plan` → `kind:"plan", meta:{ plan_steps }`; `permission` → `kind:"gate"`, `meta:{ gate_prompt: title (+ tool title), native_permission:{ permId, options, chosen, auto } }` (auto-allowed → a step row instead of a gate); `question` → `kind:"gate"`, `meta:{ gate_prompt, native_question:{ questionId, questions, submitted } }`; `usage` → dropped.
   - `notice` → `{ role:"assistant", kind:"error", content: <plain-language text from existing notice.ts dictionary or frame text> }`.
   - Ids: deterministic negative integers derived from the dialog message/item id (stable hash), unique within the list. A turn with `live` true and no final text leaves the last assistant message without `final` so the host can show streaming.
3. `src/shell/native-thread/useNativeThread.ts` — wraps the existing headless `useAgentDialog` (`cloud-computer/agent-dialog/useAgentDialogController.tsx`) for ONE managed session (`taskSessionId = session.id`, `initialProgram = session.program`, `initialSessionId = session.native_session_id`, `enabled` only when computer online and `enabled`), never opening a program strip or session sidebar. Read how `AcpCard.tsx` currently drives the controller in embedded mode (props `taskSessionId`, `onArchiveStatus`, `onNativeSessionChange`) and replicate the needed wiring headlessly; then the host no longer needs AcpCard.
   - Offline / not yet connected: load `getComputerTaskTranscript(session.id)` (paginated `has_older/next_before`) and reduce frames with `applyDialog` → same mapper. Online: live controller messages. Never show two copies.
   - `send(text)`: uses controller `setDraft`+`send` (or the direct send path) with current attachments; returns false when not ready. `stop()` → controller abort. `answer(message, x)` → `answerPermission` / `answerQuestion` from `meta.native_permission/native_question`.
   - `running` = controller busy for this session (use existing occupancy/busy signals the AcpCard used).
   - `blockedReason`: plain language when offline ("这台电脑离线，只能查看已保存的对话。"), program not installed, not logged in (point to settings gear, no in-stream install/login cards), else null.
   - Attachments: adapt controller `attachments/addAttachments/removeAttachment` to the props LeoComposer already takes (`attachments`, `onAttachFiles`, `onRemoveAttachment`; inspect `useAttachments().composerAttachments` type in `src/shell/useAttachments.ts` and match it).
   - `modelPicker`: `<NativeModelPicker>` bound to `dialog.models/selectedModel/setSelectedModel` (+ mode if the program exposes one). Null when no models.
   - `saveFailed`: true only when the archive status reported for this session is "error".
4. `src/shell/native-thread/NativeModelPicker.tsx` — visually identical to `ModelGroupPicker` with `compact placement="top" align="right"` (read `src/shell/ModelPicker.tsx` and reuse its trigger/menu classes; do not invent a new look). Unusable models disabled with their reason as title.
5. `src/shell/AgentTranscriptBubble.tsx` — extend `GateBubble`: when `meta.native_permission` present, render one button per option in the existing gate button style (allow-type kinds primary, reject-type secondary), disabled after `chosen`, showing the chosen option name; when `meta.native_question`, render the question(s) with options/text input in the same style. New prop `onNativeAnswer?: (message, answer) => void`. Cloud gates unchanged.
6. `src/shell/native-thread/index.ts` barrel.

## Tests (new)

`tests/native-thread-map.test.mjs`: mapping of every item kind; deterministic ids; progress grouping via `buildAgentRenderItems` yields one progress card per turn with tool labels; permission → gate; auto permission → step; notice → error text; offline archive frames through `applyDialog` produce the same messages as live.
`tests/native-thread-gate.test.mjs`: DOM render of `AgentTranscriptBubble` with native permission (buttons per option, callback receives option id, disabled after chosen) and question.
`tests/native-thread-hook.test.mjs`: hook with a stub controller/socket (follow how `tests/acp-card-flows.test.mjs` / `tests/computer-session-view.test.mjs` stub sockets and the gateway): offline → archive messages and `blockedReason`; online send → prompt frame carries `task_session_id`; stop → cancel frame; answer → permission frame.

## Done when

Files exist, focused tests pass, `git diff --check` clean, committed (own paths only), Checkpoint filled incl. New strings and any Requests. Do NOT edit AgentChat/LeoComposer/ComputerDock/AcpCard.

## Checkpoint

Not started.
