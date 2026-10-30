# W4 — Home → native chat: absolutely fast, in place; paste works; no silent hand-back

Read `00-contract.md` first (same directory).

**You own:**
- in `/root/projects/oceanleo`: `app/_components/home-content.tsx`, `app/_components/pending-task-conversation.tsx`, `app/tasks/[id]/**`
- in `/root/projects/oceanleo-ui`:
  - `src/lib/computer-task-api.ts`
  - `src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx`
  - `src/shell/native-thread/useNativeThread.ts`, **except** the `modelPicker` block (W5)
  - the **native-flow regions** of `src/shell/AgentChat.tsx`: `startNative`, `adoptCreatedTask`, pending native prompt, session/computer loading ≈976–1300, ≈3100–3200, native `submit`
- tests

Do not edit the render regions of `AgentChat.tsx` (W3), or `LeoComposer.tsx` / `NativeModelPicker.tsx` (W5).

## Operator complaint
"Sending to the agent from the homepage first shows 'open task' — extremely slow!!! It must be absolutely fast!!! The chain from sending to seeing the reply must be as short as possible." And: "Ctrl+V of an image in the homepage input does nothing."

## Measured chain today (Claude Code on the operator's computer, from gateway logs)
- `home-content.tsx` ≈96-111 awaits `isSignedIn()` (twice in total), then `createComputerTaskSession` (≈0.11 s), stashes the prompt in sessionStorage (`computer-task-api.ts` ≈73), awaits `getUserId()`, then `router.push('/tasks/<id>?computerSession=<cts>')`.
- **4.2 s** of route change: the `app/tasks/[id]/loading.tsx` skeleton "正在加载任务", full remount, and a 5 s summary poll in `page.tsx` ≈94-130.
- On the task page:
  - `AgentChat` fetches the session list (≈992; 1.9 s, requested twice); only after it arrives does it fetch the computer (`getComputer` ≈1090; ≈2.1 s).
  - The machine counts as "connecting" until both are back (≈3145).
- "正在打开对话…" (≈2831) shows with the user's text hidden. The prompt is sent only when `thread.ready` (≈3155).
- `ready` also needs a fresh occupancy reply (`useNativeThread.ts` ≈218), even for a brand-new session, which cannot be busy.
- The user bubble appears only after the socket send (`useAgentDialogController.tsx` ≈1093).
- **Bug:** after 20 s not ready (`PENDING_PROMPT_SETTLE_MS` ≈3114, ≈3167), the prompt is silently put back into the input box.
- Agent cold start is only triggered when the task page connects.

## Required
1. **In place, no page jump.**
   - After send, the homepage turns into the conversation immediately, the way the cloud Leo path already does: `PendingTaskConversation` plus `history.replaceState` (`pending-task-conversation.tsx` ≈33, `AgentChat.tsx` ≈1432 `adoptCreatedTask`).
   - The user's bubble shows at once (optimistic) with its attachments.
   - The session is created in the background, the URL is updated with `replaceState`, and there is no `/tasks` route remount and no "正在加载任务" skeleton.
   - A real navigation to `/tasks/<id>` later (reload, sidebar) must still work.
2. **No serial fetches.** Hand the created session row and the already-known computer (from the device menu) to `AgentChat`, so it doesn't wait for the session list and then `getComputer`. Fetch in parallel, or skip, when data is already present. Remove duplicate fetches.
3. **Prewarm.**
   - When a native program is picked on the homepage, open the dialog connection in draft mode (exists since `304e1329`) and send the frame that starts the agent process. W2 confirms it is `models`; read `agent_dialog.py` ≈1474-1477 and W2's Checkpoint if it has landed.
   - Pressing Enter then uses that warm connection. Do not open a second socket for the same program/computer when the conversation mounts; reuse it or hand it over.
4. **Ready / send.**
   - A brand-new session must not wait on an occupancy reply.
   - Send as soon as the socket and session are bound.
5. **The silent hand-back.** Never silently put the prompt back. If it truly cannot be sent (offline, not installed, not signed in), show a clear line in the conversation with the reason and a retry, and keep the user's bubble marked "未发送".
6. **Paste / attachments on the homepage for native chats.**
   - `home-content.tsx:437` sets `onAttachFiles={nativeChat ? undefined : uploadLocalFiles}` (added today, `00cd51ed`), so paste, drag-drop and the attach button vanish silently.
   - Make attachments work for native chats from the homepage: images via Ctrl+V, drag-drop and the picker go with the first prompt to the program, the same way they work inside the task page (`useNativeThread` attachments).
   - Remove the "请进入对话后再添加附件" refusal (≈344-348).
7. **Composer controls on home (contract C4).** Pass `showPayerSelector={false}` and `modelPickerSlot={thread.modelPicker}` for native chats on the homepage, exactly as `AgentChat.tsx:2890-2894`, using the warm draft thread. W5 makes the picker rich.
8. **Terminal / CLI targets.** Keep their current behaviour (they open the task page at once), but apply items 2 and 4 so the page is quick.

## Tests
- Update or add tests:
  - homepage native send renders the user bubble before session creation resolves
  - no `router.push` for chat
  - `replaceState` called with the task URL
  - no wait on occupancy for a new session
  - no silent hand-back (a clear message instead)
  - attachments accepted for native chats on home
  - prewarm frame sent on pick
- Existing suites to keep green: `tests/computer-task-host.test.mjs`, `tests/computer-task-api.test.mjs`, `tests/native-thread-hook.test.mjs`, `tests/execution-target.test.mjs`, `tests/cloud-computer-dock.test.mjs`, `tests/agent-chat-conversations.test.mjs`, plus `grep -l` hits for the symbols you touch.
- Homepage code in `/root/projects/oceanleo` has its own tests/typecheck. Find them (`package.json` scripts) and run `npx tsc --noEmit` there through `run-heavy`.

## Done when
- Typecheck is clean in both repos and tests are green.
- The Checkpoint lists the new chain with an estimated time per step, files, tests, strings and Requests.
- Nothing is committed.

## Checkpoint

### W4 checkpoint — 2026-10-30 (not committed)

**Status:** done. Typecheck is clean in both repos and the focused suites are green. The only reds left are W5's untranslated strings and failures that already exist at HEAD (details below).

#### New chain (homepage → Claude Code / Codex / … chat)
| step | what happens | estimate |
|---|---|---|
| pick program | Home reads the computer (`loadComputer`, one GET, remembered in the tab). Its own `useNativeThread` opens the dialog socket in draft mode and sends `status`, `sessions`, `occupancy` and `models`. `models` is the frame that pre-starts the agent (W2). The model picker (W5), paste, drop and the attach button work from here. | GET ≈0.1–0.3 s, then WS ≈0.1–0.3 s, all while the user types |
| Enter | No awaits on the hot path. `isSignedIn` is skipped when the link is already live, and `getUserId` runs after. `thread.queue(text)` puts the user's bubble, with its files, into the conversation. Home renders `PendingTaskConversation native=…` in place: no `router.push`, no `/tasks` route mount, no "正在加载任务". | one render, about 16 ms |
| create | `createComputerTaskSession` runs in the background with one `request_id` per launch (retries reuse it). | ≈0.11 s (measured before) |
| bound → send | The session prop binds to the same warm thread. A brand-new session is ready as soon as the link is up, without an occupancy reply, so the prompt frame goes out on the existing socket. AgentChat adopts the task with no session-list read and no `getComputer` wait (the computer is known). The URL becomes `/tasks/<id>?computerSession=<cts>` via `replaceState(null, …)`. | about 0 ms after create |
| reply | The agent was already started by the prewarm. Reply time is the program's or model's own. | vendor |

Send → prompt on the wire is ≈0.1–0.2 s. Before this change it was ≈4.2 s (route) + 1.9 s (list) + 2.1 s (computer) + an occupancy round trip.

Cold Enter (computer not read yet): the bubble still shows at once. The prompt leaves once both the computer read plus socket and the session create are done; those run in parallel.

**CLI / terminal:** these still open the task page, so the route-change skeleton is unchanged. The session create and `loadComputer` run in parallel, and both rows are remembered in memory. The task page seeds the named `?computerSession` row and the computer from memory, so it shows at once. The list and the computer are re-read in parallel, in the background. Concurrent list or computer reads share one request, and only while that request is younger than 5 s, so a hung request never blocks a retry.

#### Never handed back silently
`useNativeThread` has a new `pending / queue / markUnsent / retry` API.
- A queued prompt stays as the user's bubble (`meta.native_pending`).
- It is marked unsent, with a plain reason, in these cases: offline, not installed, not signed in, the session create failed, the send failed, or 45 s with no way out.
- AgentChat shows `未发送：<reason>` with a 重试 button under the bubble (neutral stone, `data-native-unsent`). A setup block also opens settings.
- The 20 s hand-back (`PENDING_PROMPT_SETTLE_MS`) is gone.
- A computer whose state is not known yet counts as connecting, never as offline.

A legacy `stashPendingNativePrompt` link is now queued the same way.

#### Files
- oceanleo
  - `app/_components/home-content.tsx`: warm thread on pick, launch in place, native attachments (paste, drop, picker → computer inbox), C4 props, the "请进入对话后再添加附件" refusal removed, CLI/terminal reads the computer in parallel.
  - `app/_components/pending-task-conversation.tsx`: `native` prop → `AgentChat nativeLaunch`; `onTaskCreated` replaces the URL with `?computerSession`.
  - `tests/task-transition-routing.test.mjs`: new source case.
  - `tests/home-conversation-runtime.test.mjs`: the stale `/# pass 1/` became pass ≥1 and fail 0.
  - `app/tasks/[id]/**`: unchanged. The in-place path never mounts it, and a real navigation or reload still works through `page.tsx`.
- oceanleo-ui
  - `src/lib/computer-task-api.ts`
    - Shared in-flight list reads.
    - Remembered session rows (`rememberComputerTaskSession` / `knownComputerTaskSession`); create and bind remember them automatically.
    - Remembered computers: `rememberComputer` / `knownComputer` / `loadComputer` / `watchComputer`.
  - `src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx`: `send` lets a brand-new view (no native session yet) skip the occupancy wait once the link is up. A pending send or a live turn still holds it.
  - `src/shell/native-thread/useNativeThread.ts`, everything except the modelPicker block:
    - `pending` / `queue` / `markUnsent` / `retry`; the optimistic bubble carries its files, and those files leave the composer chips.
    - Brand-new sessions are ready without occupancy.
    - No transcript read for a session born from this draft while the computer is online.
    - A draft after a session (New Task) starts a fresh view.
  - `src/shell/AgentChat.tsx`, native-flow regions only:
    - The `nativeLaunch` prop and the `AgentChatNativeLaunch` type.
    - Seeds for `pickedChat` and `computers`.
    - Session-list skip for an adopted task, and the seed from the `?computerSession` row this tab knows.
    - Computer seed and remember.
    - `startNative` no longer stashes and has a stable request id per pick.
    - Launch adoption under the same chat key.
    - Native `submit` queues; the `tail` carries the unsent line and retry.
    - `NativeChatConversation` takes an `external` thread (its own hook then stays disabled: one socket).
    - The hand-back is removed.
- **Outside the book (additive, needed for the gates — please confirm or move):**
  - `src/shell/index.ts`: `export { useNativeThread, type NativeThread } from "./native-thread"`, plus `type AgentChatNativeLaunch` on the AgentChat line.
  - `src/architecture/public-api.snapshot.json`: regenerated; the only change is those 3 entries.
  - `src/i18n/ui/messages/computer-task-workspace-copy.ts`: 3 new keys in all 17 blocks; the dead `attachInsideConversation` key removed.
  - `tests/computer-conversations-i18n.test.mjs`: `PORTAL_ONLY` is now empty.
- Tests updated: `tests/agent-chat-conversations.test.mjs`, `tests/native-thread-hook.test.mjs`, `tests/computer-task-api.test.mjs`, `tests/agent-chat-home-launch-keeps-transcript.test.mjs` (stubs for the native thread and the cloud-computer API; new portal cases).

#### Tests (focused runs through run-light; the batch and tsc through run-heavy)
- `npx tsc --noEmit`: oceanleo-ui 0 errors; oceanleo 0 errors.
- Batch of 18 files, 216 tests: 213 pass. The 3 reds are all W5's `NativeModelPicker` strings with no translations (`computer-conversations-i18n` ×2, `i18n-tt-key-coverage` #8).
  - Green in the batch: agent-chat-conversations, native-thread-hook, computer-task-api, agent-chat-home-launch-keeps-transcript, share-i18n-coverage, execution-target, cloud-computer-dock, native-composer-controls, public-api-snapshot-tracked, dialog inbox, session refresh, acp-card-flows, native-thread map and gate, conversation-dock, shared-capability-exports.
- New cases:
  - homepage send shows the bubble before the create resolves;
  - no `router.push` for chat;
  - `replaceState` → `/tasks/t_home1?computerSession=cts_home1`;
  - sent once on the warm thread, and the page's own thread stays off;
  - no list read;
  - a new session is ready with occupancy silent;
  - no silent hand-back: the unsent line plus retry, with the request id reused;
  - attachments accepted on home and routed to the thread;
  - the prewarm `models` frame is sent in draft, and home's thread is enabled with the computer on pick;
  - the `?computerSession` seed shows before the list arrives;
  - list and computer reads are shared and remembered.
- Wider sweep (73 files touching these symbols): 25 reds. 22 of them are identical at clean HEAD (checked in a throwaway worktree): eas-w03 streaming 20/32, effect-tt ConversationView, hit-target budget, the library/material suites, tpp-w3 polling, app-page-header styles, workbench-toolbar. The other 3 were my missing translations, now fixed.
- oceanleo: `task-transition-routing` and `home-conversation-runtime`: 5/5. `device-status-popover` #6 already fails at HEAD and is unrelated.

#### New user-visible strings (zh source, via `tt`, translated in 16 locales)
- 未发送：{reason}
- 没能发出去，请重试。
- 暂时连不上这台电脑，请稍后重试。

Reused: 重试, 没能打开这段对话，请稍后再试。, and the blocked reasons that already exist.

#### Requests
1. **W2 (prewarm reliability).** `agent_dialog.py` about lines 1448–1453 answers `models` from `transcript_store.catalog` and returns without `_acquire_proc`. With a cached catalog, the homepage pick does not start the agent process. The `models` frame on connect should always warm the process, even when the cached catalog is answered first. Home sends nothing else; it relies on `models`.
2. **W3 (renderer).** The queued bubble carries `meta.native_pending`, and `meta.native_unsent` when it could not be sent. A small "未发送" mark on that user bubble in `AgentTranscriptBubble` would echo the line under it. The line itself already says it plainly.
3. **Parent.** Keep or move the additive `src/shell/index.ts` export and the snapshot entries; the homepage cannot reach the warm thread without them. Add W5's 8 picker translations (their Request 1).
4. **Parent (note).** In oceanleo I briefly ran `git stash` / `git stash pop` to get a baseline. That stash included W1/W2's backend WIP for a few seconds. The pop restored everything cleanly, with no conflicts, and `git status` shows all their files back. Tell me if anything there looks off.
