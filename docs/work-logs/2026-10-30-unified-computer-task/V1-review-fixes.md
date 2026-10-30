# V1 review → fix assignments (parent, 2026-10-30)

A read-only audit after R1–R4 confirmed that only one UI system remains on the task page: no tone/agent-dialog imports, no strip, and one stream. It also found the defects below. Each is assigned to the owner of its files. Owners: fix, add a focused test per fix, commit their own paths, append a "Fix checkpoint" to their R-book (files, commands, results, new strings).

## R3 (AgentChat.tsx, lib/computer-task-api.ts, cloud-computer/computer-task-import.tsx, portal app/computers/** + app/tasks/**)

1. **Devices page → `/computers/<id>` → `ComputerTaskImport`.** It creates a task with an `acp` session whose program is `"oceanleo"` (the default when the link has no `program`). `useNativeThread` only drives cursor/hermes/claude/codex, so the user waits forever on "正在读取会话…", and a random request_id creates another empty task on every load.
   - Fix: when `program` is absent or `oceanleo`, open the OceanLeo conversation on that computer (`{kind:"oceanleo", target:{kind:"computer",id,name}}`), so the existing cloud-driven computer target is used. Do not create an oceanleo native session.
   - Use a stable request_id (derived from computer + program + native id + kind) so reloads don't multiply tasks.
   - Never render a native chat for program `oceanleo`; existing such sessions show as the OceanLeo conversation or are ignored.
2. **Cross-origin handoff.** The pending prompt lives in `sessionStorage` on the current site, but `openComputerTask` navigates with `portalHref` to the portal origin, so the prompt is lost on any non-portal AgentChat host. Fix: navigate on the same origin when the host can show the task (use `onTaskCreated` / the host's own task route). If you must cross origins, send the prompt before navigating instead of stashing it. Never lose the text silently.
3. **A failed pick is silent.** Errors from creating a computer session must show in whichever stream is visible (the cloud stream included), in the existing error-line style. The conversation must not switch (and the dock label must not change) until the session exists.
   - In a draft, AgentChat must always pass its own controlled `conversation` to LeoComposer, never `undefined`, so a failed pick reverts. Coordinate with R2's fix 3.
   - A draft pick that the host turns down must never leave a native label while Send goes to cloud.
4. **Session list fetch failure.** Today it is treated as an empty list, the `?computerSession` param is stripped, and the bound target stays null (Device shows "正在加载…" forever, Send disabled). Fix: retry with backoff, keep the URL param, and show one plain line with a retry button in host style.
5. **Computer status.** Fetched once, so every computer looks offline until it loads, and a failed fetch counts as removed forever. Fix: "not yet known" ≠ offline (show 正在连接… and don't disable the composer as offline). Refresh periodically (follow the cadence other computer views use) and on window focus; a failed fetch retries.
6. **Pending first prompt when Codex needs install or sign-in.** It waits on `thread.ready` forever and expires. Fix: if the thread is blocked (blockedReason set, or not ready after it settles), put the text back in the composer, open settings for a setup block, and drop the stash.
7. **Offline gates.** Pass `onNativeAnswer` only when the thread is live (R1 will expose `live`).
8. **Native LeoComposer controls.** Hide controls that do nothing for native sends: `showPlugins={false}`, `showPayerSelector={false}`, `showAppsBar={false}`. Respect the host `placeholder` override.
9. **Computer task invents an OceanLeo bound target.** A `mode="computer"` task must not offer sending an OceanLeo turn into it. Its OceanLeo row is disabled with the visible reason "OceanLeo 请在新任务里使用" (or better wording). The Device label comes from the current conversation, not from a flipping "latest session". Cloud tasks with attached native sessions keep their real bound target.
10. **Draft native chat settings never load.** Enable the thread for a draft so program status and models load when the conversation is selected or settings are open, without creating a session. Coordinate with R1's fix 3.
11. **Hidden chats disconnect.** Keep opened native chats connected while hidden (`enabled = Boolean(session)`, with a separate visible flag if R1 provides one), so permission prompts and progress keep arriving. Also don't clear the archive on every switch.
12. **Settings header.** The settings pane title must win over a hidden editor's header claim while settings are open (`SettingsPaneTitle` vs `InlineAdvancedWorkbenchShell` claims).
13. **Attachment-only native send** must work. Clear the input only on a real send (R1 fix 2).
14. **URL changes inside the same task** (another `computerSession`) must switch the conversation: re-read on `popstate` / searchParams change.
15. **Create native chat sessions on first send, not on pick**, inside tasks too. Picking 对话 for a program the task has no session for shows an empty native pane with a ready composer; the session is created on the first send. 命令行 / 终端 still create on pick, because they have nothing to send.
16. **Draft navigation double push.** Navigate once: either the host's `onTaskCreated` or router push with `?computerSession`, not both.
17. **Jargon.** Native empty hint "正在读取会话…" → "正在打开对话…".
18. **Dead code.** Remove `nativeChatActive` and `preferredSessionRef` if unused; don't pass `gateActive` / `gateBusy` to native gates.

## R2 (ComputerDock.tsx, ConversationBar.tsx, LeoComposer.tsx)

1. **Native trigger title/aria.** Not "任务执行位置". Use "切换对话" (or the current conversation label).
2. **Locked-row reason** (bound task, other targets): also visible as inline muted text in the popover, not only a tooltip (touch users).
3. **Controlled conversation.** When the host passes `onConversationChange`, LeoComposer/ComputerDock must not keep their own memory of a native or terminal pick: the label follows the `conversation` prop only. If the prop is `undefined`, show the draft OceanLeo target. A failed host pick therefore reverts automatically.
4. **Computer tasks:** support a `disabledOceanleoReason` (or similar) prop so R3 can disable the OceanLeo row in `mode="computer"` tasks with a visible reason.
5. **Dead code.** `existingSession` duplicates `findComputerTaskSession`; un-export `TargetGlyph` if only used internally; ConversationBar test-only seams are OK if documented.
6. **命令行 hint wording.** "在这台电脑的命令行里继续，记录和对话分开" → "在电脑的命令行窗口里继续，和这里的对话分开记录".

## R1 (native-thread/**, AgentTranscriptBubble.tsx, agent-dialog controller/reduce/types)

1. **Expose `live: boolean`** on NativeThread (connected, can answer). `AgentTranscriptBubble`: when `onNativeAnswer` is absent, native gates render read-only (no active buttons), and never show a local "已选" that wasn't sent.
2. **Truthful send.** `send()` returns true only when the controller actually sent the prompt (make the controller return the outcome). Support attachment-only sends (empty text with ready attachments).
3. **Draft mode** (`session === null`, program known): connect to the computer for program status and models, so the model picker and settings work, but never open, create or prompt a session. Add `program` to `NativeThreadInput` for this.
4. **Hidden but connected.** Allow `enabled` (connected) separately from `visible`, if the controller needs a hint; a hidden chat must keep receiving frames.

## R4 (agent-dialog/AcpCard.tsx — Computers page)

1. Restore the two guards W2 had added, which were removed together with the embedded branches:
   - the `!active` guard on the initial-session effect, so hidden cards don't open sessions;
   - the `oceanleoLoaded` guard on the "当前使用云端 OceanLeo agent…" banner, so it doesn't flash or stick.
   Keep the Computers page tests green and add a regression test for each.
