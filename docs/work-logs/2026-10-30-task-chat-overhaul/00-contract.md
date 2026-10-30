# 2026-10-30 Task chat overhaul — dispatch contract

Operator order (2026-10-30, Claude Code session c6324093): fix everything found in today's analysis. Afterwards sync oceanbizs (主站 portal `main` + `oceanleo-ui-bump.sh --only oceanleo` + twin gateway). The parent does all commits, pushes, bumps, dev-gateway restarts and DB migrations; children do none of these.

## Operator rulings for this batch
- One rendering system for the OceanLeo cloud agent AND native programs (Claude Code / Codex / Cursor / Hermes). No second UI system. The renderer is built in the host's own components (one-UI rule): never mount `cloud-computer/agent-dialog/MessageList.tsx` or `Composer.tsx` in the task page, and never import `server-page/tone`.
- Users can see the agent's FULL thinking/working process and fold it. Fidelity like the old Computers page: real order, tool output/diff/locations, plans with status.
- Default fold: while a turn runs, its process is expanded live. When it finishes, it collapses to one summary line ("思考 12 秒 · 9 个步骤"), and the final answer stays visible. Each thought / tool can be expanded on its own. Auto-allowed permission rows are hidden (as on the old Computers page). Notices are neutral, not red; only real failures are red.
- Leo reasoning text is shown to users raw (folded). Prompt fragments leaking is accepted in the dev phase. Mask secrets/tokens only.
- No browser, Playwright or screenshots for verification (operator said no). Static checks, DOM tests (jsdom/happy-dom as the repo already uses), HTTP and API checks only.
- Dev-box second node: NOT doing it.
- Home → native chat must be "absolutely fast": no page jump, user bubble immediately, agent prewarmed.
- The 40 s complaint is the OceanLeo cloud agent with the lite model group (triage `qwen/qwen3.8-flash` + reply `openai/gpt-oss-20b` via openrouter), whole conversation < 50 chars. If it is our bug, fix it. If it is purely the vendor's speed, leave it and report the measurement.

## Units (disjoint ownership)
| id | owner scope | repo |
|---|---|---|
| W1 | Leo cloud agent latency + reasoning capture + tools-tier streaming | oceanleo backend `app/agent_engine.py`, `app/llm.py`, `app/providers.py`, `app/agent_smol_engine.py`, their tests |
| W2 | Computer task sessions backend: My Tasks visibility, dialog latency, ACP process lifecycle, token out of argv | oceanleo backend `app/cloud_computer/**`, `app/agent/task_repository.py`, `app/agent/query_service.py`, new migration(s), their tests |
| W3 | One process timeline renderer + overflow fixes | oceanleo-ui `src/lib/agent-progress.ts`, `src/shell/AgentProgress.tsx` (or a new `src/shell/ProcessTimeline.tsx`), `src/shell/native-thread/map-dialog.ts`, `src/shell/AgentTranscriptBubble.tsx`, `src/shell/Markdown.tsx` (only if needed), `AgentChat.tsx` **render regions only**, tests |
| W4 | Home → native send speed, in-place conversation, paste/attachments, silent hand-back bug | oceanleo `app/_components/home-content.tsx`, `app/_components/pending-task-conversation.tsx`, `app/tasks/[id]/**`; oceanleo-ui `src/lib/computer-task-api.ts`, `src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx`, `src/shell/native-thread/useNativeThread.ts` (**except the modelPicker block**), `AgentChat.tsx` **non-render native-flow regions only**, tests |
| W5 | Composer controls for native targets | oceanleo-ui `src/shell/LeoComposer.tsx`, `src/shell/native-thread/NativeModelPicker.tsx`, the `modelPicker` block of `useNativeThread.ts`, `src/shell/PayerSelector.tsx`/`ModelPicker.tsx` (only if needed), tests |

The parent owns the oceandino bootstrap fast path, the one-time cleanup of leftover ACP processes on this host, integration, typecheck, the full suites, LeoDev slot freshness, commits and the sync.

## Shared-file rules
- `AgentChat.tsx` is shared by W3 and W4. Use the Edit tool with exact, small replacements only. Never rewrite or reformat the file and never run a formatter on it. Re-read the region right before each edit. W3 owns `renderStream`, `renderNativePane`'s returned JSX (items / empty / top) and the cloud stream item rendering. W4 owns `startNative` / `adoptCreatedTask` / pending prompt / session + computer loading (≈ lines 976–1300, 3100–3200) and the native submit logic.
- `useNativeThread.ts` is shared by W4 and W5. W5 owns only the `modelPicker` construction (≈ lines 255–280). W4 owns the rest.
- Do not touch files owned by another unit. If you need a change there, write it under **Requests** in your book and tell the parent in your final report.

## Cross-unit contracts
- **C1 Leo reasoning (W1 → W3).** On the streaming reply row (`agent_messages`, `kind:"text"`), the gateway keeps `meta.reasoning` (string, the model's reasoning text, capped at 16000 chars, secrets masked) updated with the same throttle as content (≥0.33 s or ≥120 new chars). It also sets `meta.reasoning_ms` (int, time spent reasoning) once text starts or the turn ends, and keeps `meta.streaming:true` while generating. The tools tier (`reply_path:"tools"`) streams `content` the same way. Rows from before this change have no `meta.reasoning`; the UI must cope.
- **C2 Cloud step detail (existing data → W3).** `step` rows carry `meta.{tool, status, error, args_preview, result_preview, step_index}`. `analysis` rows carry the full model prose plus code. W3 renders all of it inside the expandable tool / thought entries.
- **C3 Native tool detail (W3 internal).** `map-dialog.ts` must carry the ACP `ToolCard` in full (`kind`, `status`, `content[]` diff | terminal | text, `locations[]`), plan entries with status and priority, and thought text. Usage may be shown as a faint line in the summary. Auto-allowed permissions are dropped.
- **C4 Native composer (W5 → W4).** `thread.modelPicker` (from `useNativeThread`) is a self-contained ReactNode with model, mode, fast and effort when the program offers them. W4 passes it on the homepage exactly as `AgentChat.tsx:2890-2894` does (`showPayerSelector={false}`, `modelPickerSlot={thread.modelPicker}`). W5 also makes `LeoComposer` hide the payer selector and the Leo tier picker whenever `conversation.kind === "native"`, even if a host forgets.
- **C5 My Tasks (W2).** Every `mode='computer'` task must appear in My Tasks on every site. The fix and backfill are in the DB function and migration; the frontend does not change.

## Verification for every unit
- Focused tests through `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- <cmd>`. Typecheck (`npx tsc --noEmit` in oceanleo-ui) through `run-heavy`.
- Backend tests: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- docker exec -w /app oceanleo-api python -m pytest tests/<file> -q`. The container mounts `/root/projects/oceanleo/backend` at `/app`. Do NOT restart the container; the parent restarts it once at integration.
- No browser, Playwright or screenshots.
- Fill your book's **Checkpoint** section: files changed, tests run with results, Requests, and new user-visible strings (zh source text via `tt`).
