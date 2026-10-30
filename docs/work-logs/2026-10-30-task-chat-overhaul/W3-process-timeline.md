# W3 — One process timeline for Leo and native programs; no horizontal scrollbar

Read `00-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`.

**You own:**
- `src/lib/agent-progress.ts`
- `src/shell/AgentProgress.tsx` and/or a new `src/shell/ProcessTimeline.tsx`
- `src/shell/native-thread/map-dialog.ts`
- `src/shell/AgentTranscriptBubble.tsx`
- `src/shell/Markdown.tsx`, only if needed
- the **render regions** of `src/shell/AgentChat.tsx`: `renderStream`, the JSX that `renderNativePane` returns, the cloud stream item rendering, and the scroller/column classes ≈2559/2562
- tests

Do not touch the native flow regions of `AgentChat.tsx` (W4) or `LeoComposer.tsx` (W5).

## Operator verdict
- "The task chat panel is ridiculously bad; the old Computers-page panel was better because agent output was over-processed instead of shown raw."
- "The progress card is not right for the Leo agent either."
- "Users must be able to see, and fold, the agent's full thinking process — for OceanLeo and for Codex / Claude Code — like it used to be."
- "There is even a horizontal scrollbar; that's a big bug."

## What is wrong today (confirmed by the parent)
**`map-dialog.ts` reduces native output to almost nothing:**
- An ACP tool becomes a `step` whose content is only its title (≈189-200); `content` (diff | terminal | text) and `locations` are dropped.
- A plan keeps only `plan_steps` text; its status and priority are lost in rendering.
- An auto-allowed permission becomes a visible step whose label is the entire command (≈219-228).
- Every notice becomes `kind:"error"`, a red box (≈141-151).
- Usage is dropped.

**`buildAgentRenderItems` (`agent-progress.ts` 125-176) breaks the order:** it pulls every process message of a turn into ONE card at the first process position, while assistant text stays in place. So text1, toolA, text2, toolB renders as text1, [A, B], text2.

**`buildAgentProgressActions` mislabels and hides:**
- It pairs a thought with the following tool, so the row title is the tool name but the expanded body is the thought, not the tool result.
- It reads only `step.content`; for cloud steps it ignores `meta.args_preview`, `result_preview`, `error`, `status` and `tool` (contract C2). Real example: a device step that failed with "失败：failed（没有执行）：ui.find: the foreground window is the hand itself" shows only "在电脑上查找元素".

**`AgentProgress.tsx`:**
- Shows only the latest plan, sliced to 8 steps and collapsed.
- `summary()` cuts to 180 chars.
- The simple `ProcessRow` branch (120-125) renders `<span>{label}</span>` with no `min-w-0` / truncate / break, which is the main horizontal-overflow cause.

**Horizontal scrollbar (all confirmed):**
- The scroller `AgentChat.tsx:2559` is `h-full overflow-y-auto px-4 py-4`, so `overflow-x` computes to `auto`.
- The column at 2562 has no shared wrapping.
- Elements with no break rules:
  - the user bubble (`AgentTranscriptBubble.tsx:245`)
  - `GateFrame` / the cloud gate (≈523, ≈428)
  - plan `li` (`AgentProgress.tsx` 78-80)
  - the error bubble (≈331)
  - the standalone step (≈324)
  - the native question `<pre>` (≈693)
  - `DeviceStatusNotice` (≈825)
  - the tail lines in `AgentChat.tsx` ≈2696/2699

The old Computers page avoided all this with one `min-w-0 flex-1 space-y-2 break-words [overflow-wrap:anywhere]` wrapper per turn. `Markdown.tsx` is already safe: code blocks and tables scroll inside their own box.

**Reference for fidelity:** read `src/shell/cloud-computer/agent-dialog/MessageList.tsx`. Do not import or mount it.
- `ToolView` 99-171: kind icon, title, status, expand to show diff via `lineDiff` (`diff-lines.ts`), terminal output, text and locations.
- `ThoughtView` 69-97.
- Plan with ☑ / – / ☐ and priority, 352-378.
- Usage, 380-391.
- `AutoAllowedView` and `isAutoAllowedNoise`.

You may import pure helpers (`diff-lines.ts` `lineDiff`, `types.ts` types). Never import components or `server-page/tone`. Render with the host's styling: stone palette, the same type scale as `AgentTranscriptBubble` / `AgentProgress`, and the host accent.

## Build
1. **One ordered process model per turn.**
   - Replace the "pull everything into one card" grouping with an ordered timeline.
   - Inside one assistant turn (between user messages), consecutive process entries form a process block, and assistant text stays exactly where it happened. Text1, toolA, text2, toolB renders as text1 · [A] · text2 · [B], or as one turn container that shows everything in order. Choose the clearer one, but order must be real.
   - The final answer of a finished turn stays visible outside the fold.
   - One renderer serves both sources:
     - native via `map-dialog.ts`, which must now carry the full `ToolCard`, thought text and plan entries (contract C3);
     - cloud via `AgentMessage` kinds `analysis` / `step` / `plan` / `text` + `meta.reasoning` (contracts C1, C2).
2. **Entries.**
   - **Thought.** Native thought text, or cloud `analysis` content, or cloud reply `meta.reasoning`. Shown as one line, "思考" plus duration when known (`reasoning_ms`), expandable to the full text in Markdown. While streaming and running, it is expanded and live.
   - **Tool.** Kind icon, title (single line, truncated, full on expand), status (运行中 / 完成 / 失败).
     - Native expands to: diff (red/green lines), terminal output (`<pre>` with its own `overflow-x-auto`, `max-h` with scroll, monospace), text, locations.
     - Cloud expands to: `args_preview` (code or JSON), `result_preview`, and the `error` in red. A cloud `analysis` paired with a step is shown as the thought before the tool, not as the tool's body.
   - **Plan.** All entries with status marks and priority, the latest plan expanded inside the block while running. Earlier plans are reachable (e.g. "计划已更新" lines).
   - **Notice.** Neutral line; red only for real failures (`provider_needs_credits`, `not_logged_in`, `program_missing`… stay actionable; reconnect churn stays hidden as today).
   - **Auto-allowed permission.** Hidden.
   - **Usage.** A faint "用量 N%" in the finished summary line, if present.
3. **Fold behaviour (operator ruling).**
   - While the turn runs, its process is expanded and live; the newest entry is visible.
   - When the turn finishes, it collapses to one summary line: "思考 X 秒 · N 个步骤", plus "· 1 个失败" when relevant. Clicking toggles the whole process.
   - Each entry also folds on its own.
   - Selecting text inside an expanded entry must not collapse it (the old `collapseUnlessSelecting`).
4. **No horizontal overflow, ever.**
   - Add `overflow-x-hidden` (or `overflow-x-clip`) to the stream scroller and `min-w-0 break-words [overflow-wrap:anywhere]` to the column.
   - Fix each element listed above.
   - Long unbroken strings (paths, base64, URLs, commands) wrap or truncate.
   - `<pre>` blocks scroll inside themselves only.
5. **Streaming.**
   - Assistant text keeps `TypewriterMarkdown` streaming as today.
   - Cloud reasoning streams into the thought entry.
   - The "agent 正在思考…" / "正在分析任务…" spinner shows from send until the first process or text entry. For cloud, label it "正在理解问题…" before any row exists.
6. **Every consumer of the old API.** `grep -rn "buildAgentRenderItems\|AgentProgress\|buildAgentProgressActions\|activeAgentProgressKey\|isAgentProgressMessage" src` covers AgentChat, replay, history and the pending conversation. Keep them working, or migrate them to the new renderer so there is one system.
7. **i18n.** New strings go through `tt` with zh source. Check how `src/i18n/ui` registers strings (there may be a key catalogue test) and add entries.
8. **Tests.**
   - Update `tests/native-thread-map.test.mjs` and the agent-progress tests.
   - Add DOM tests (the repo's existing DOM test setup):
     - order preserved
     - native tool expand shows diff / terminal / locations
     - cloud step shows args / result / error
     - reasoning thought renders
     - running is expanded and finished is collapsed with the summary
     - auto-allowed hidden
     - notice not red
     - stream column has overflow-x hidden and wrapping classes
     - the user bubble breaks long words
   - Run the related existing suites: `grep -l` for the touched symbols in `tests/`.
   - Run typecheck through `run-heavy`.

## Done when
- Typecheck is clean and the focused and related tests are green.
- The Checkpoint lists files, tests, new strings and Requests.
- Nothing is committed.

## Checkpoint

### W3 checkpoint — 2026-10-30 (not committed)

**Design.** There is one ordered timeline, rendered by one component. `AgentChat`, the native pane and `FunctionAgentChat` keep the same imports (`AgentProgress`, `buildAgentRenderItems`, `activeAgentProgressKey`), so the test stubs that replace those modules still work.
- `buildAgentRenderItems` works on one user turn at a time:
  - Every process row stays where it happened, and a run of process rows forms one block.
  - Assistant text that is followed by more process in the same turn stays inside the block, in place. A turn of text1, A, text2, B, answer renders as `[text1 · A · text2 · B]`, then the answer.
  - The text after the turn's last process row is the answer. It stays outside the fold.
  - Gates, artifacts, errors, notices and device_status stay in the stream and end the current block.
  - A reply's `meta.reasoning` (C1) becomes a synthetic `analysis` row (`meta.reasoning:true`, `reasoning_ms`, `streaming` while there is no text yet). It sits right before that reply's text, so the live thought replaces the bare spinner (`activeProgress`).
- `buildProcessEntries` produces ordered entries: thought / tool / plan / text.
  - Native tools carry the full `meta.tool_card` (diff | terminal | text, locations).
  - Cloud steps carry `args_preview`, `result_preview`, `error` and `status` (C2). A failure is detected from status or from a non-empty `error`.
  - Plans carry their entries with status and priority. A plan built only from `plan_steps` gets a numbered list.
- `summarizeProcess` gives the counts for thoughts, tools, failed, plans and usage, plus `ms`. `ms` comes from the sum of `reasoning_ms`; without it, from the `created_at` span of the rows (≥1 s).
- `buildAgentProgressActions` is gone. It was the thought→tool pairing that mislabelled rows.
- `AgentProgress.tsx` is the renderer, built with host styling (stone palette, accent).
  - While running, the block is open and live, with a spinner in its header. When it finishes it collapses to one line, "思考 X 秒 · N 个步骤 · 1 个失败 · 用量 N%" (the failure count is in red). Clicking the line toggles the whole process.
  - Each thought, tool and plan folds on its own. A live thought or the latest plan opens while running and closes when it stops being live, unless the user has toggled it.
  - Clicking an open body collapses it only when no text is selected (`collapseUnlessSelecting`).
  - A tool row shows the kind icon, a one-line truncated title and its status (运行中 / 完成 / 失败 / 等待).
  - A failed tool shows its error on a red line even while collapsed.
  - Expanding a tool shows the full title, red/green `lineDiff` rows, terminal output in a `<pre>` with its own `overflow-auto max-h-64`, text, locations, args (JSON pretty-printed), result, and the error in red.
  - It imports only the pure `diff-lines.ts`. No agent-dialog components and no `server-page/tone`.
- `map-dialog.ts` (C3):
  - Tools keep their full card and no longer get "（失败）" glued onto the title.
  - Thoughts and plans keep everything.
  - Auto-allowed permissions are dropped.
  - Usage rides on the turn's last process row as `meta.native_usage`.
  - Neutral notices (`acp_exited`, `dialog_detached`, `agent_busy`, `permission_timeout`, `computer_not_confirmed`, `session_not_found`) become `kind:"notice"`. Real failures stay `kind:"error"` (red), and reconnect churn stays hidden.
- No horizontal overflow:
  - The scroller gets `overflow-x-hidden` (`data-agent-stream-scroller`), and the column gets `min-w-0 break-words [overflow-wrap:anywhere]` (`data-agent-stream-column`).
  - Wrapping is added to the user bubble, GateBubble / GateFrame and their prompts, the native question `<pre>` and legend, the plan bubble, the standalone step, the error bubble, `DeviceStatusNotice`, and the streamNotice / error tail lines.
  - `<pre>` blocks scroll only inside themselves.
  - Every class used already exists in `src/theme/ui.css`. I replaced `ml-[2px]` with `ml-0.5` for that reason.
- Spinners:
  - Cloud: the fallback label is now 「正在理解问题…」. The existing seconds ticker is kept.
  - Native: 「agent 正在思考…」 shows only until the turn's first assistant entry.

**Files**
- `src/lib/agent-progress.ts`
- `src/shell/AgentProgress.tsx`
- `src/shell/native-thread/map-dialog.ts`
- `src/shell/AgentTranscriptBubble.tsx`: overflow classes, plus the new neutral `kind:"notice"` branch
- `src/shell/AgentChat.tsx`, render regions only:
  - the scroller and column classes in `renderStream`
  - the streamNotice and error tail lines
  - the cloud thinking fallback label
  - the native spinner condition in `renderNativePane`
- `src/i18n/ui/messages/agent-progress-copy.ts`: 5 new keys × 17 locales
- `src/i18n/ui/messages/computer-task-workspace-copy.ts`: removed the dead `{title}（失败）`
- Tests:
  - new: `tests/process-timeline.test.mjs`
  - updated: `tests/agent-progress-contract.test.mjs`, `tests/native-thread-map.test.mjs`
  - `tests/i18n-tt-key-coverage.test.mjs`: removed the dead baseline entries 已制定计划 / 已更新计划 / 正在继续执行… / 步, which no longer have any `tt()` call site

**New user-visible strings** (zh source via `tt`, 16 translations each, in agent-progress-copy):
- 「思考 {seconds} 秒」
- 「{count} 个步骤」
- 「{count} 个失败」
- 「计划已更新」
- 「正在理解问题…」

Reused existing keys: 思考, 计划, 任务过程, 运行中, 完成, 失败, 等待, 参数, 结果, 优先级高/中/低, 用量 {pct}%, 执行步骤.

**Tests run**
- `process-timeline` (7) + `agent-progress-contract` (12) + `native-thread-map` + `native-thread-gate`: 30/30 green in the working tree.
  - The DOM tests cover: order, running open / finished collapsed with the summary, native diff / terminal / locations, cloud args / result / error, reasoning thought, selection not collapsing, auto-allowed hidden, notice not red, long-word wrapping, scroller and column classes.
- Typecheck (`run-heavy npx tsc --noEmit`): clean in the working tree, and clean (exit 0) in a `git archive HEAD` copy that has only W3's changes.
- The related suites (every test that touches these modules, 500 tests) were run on that isolated copy.
  - All W3-related tests are green, including all of `agent-chat-conversations`.
  - The remaining reds are not W3's: they also fail on pristine HEAD, or come only from running in /tmp:
    - `eas-w03` "AgentChat：流式期间每次轮询只换正在长的那一行…" (32≠20 renders)
    - `library-task-render-loop`
    - `workbench-toolbar-rendered`
    - `hit-target-budget` (149 vs 98; W3 adds 0)
    - `effect-tt-dependency` (ConversationView)
    - `bay-shell-static` (BayMine)
    - `tpp-w3-thread`
    - the /tmp-location baseline self-checks
- `architecture:check` is OK. `api:check` is unchanged (exit 0).

**Requests / notes for the parent**
- The working-tree i18n reds come from other units' new strings:
  - W4: 「未发送：{reason}」 (AgentChat native tail) and 「没能发出去，请重试。」 (useNativeThread)
  - W5: NativeModelPicker (手动确认 / 代理 / 全部放行 / 完全访问 …)
  - These also fail `computer-conversations-i18n` and `i18n-tt-key-coverage`.
- The working-tree `agent-chat-conversations` reds (native composer `null`) appeared while W4 was editing AgentChat. They pass with W3's edits alone.
- Pre-existing HEAD reds (listed above) are not addressed by W3.
- `FunctionAgentChat` uses the new renderer through the unchanged `AgentProgress` and `buildAgentRenderItems` API. Its scroller was not part of W3's scope.
- Cloud timing in the summary is shown only when known: `reasoning_ms` (W1, C1) or a ≥1 s `created_at` span. Native turns have no timestamps, so they show "思考" without seconds.
