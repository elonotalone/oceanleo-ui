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
