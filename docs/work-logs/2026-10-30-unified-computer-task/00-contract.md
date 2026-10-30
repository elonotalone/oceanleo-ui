# Unified computer task workspace — delivery contract

Operator authorized implementation after two analysis turns on 2026-10-30. Main task chat becomes the normal home for OceanLeo, Cursor, Claude Code, Codex, Hermes and terminal work. No production/twin push, package bump, browser, screenshots or device automation was authorized. Finish with local commits and LeoDev + dev gateway evidence. Live kernel and matching task packs apply.

## Ownership and model

Parent configuration: `gpt-6.1-sol`, explicitly named for every child. All repositories start clean on `main`; oceanleo-ui is ahead 9, oceanleo ahead 1330, oceandino clean/even. Preserve pre-existing commits. Three substantial disjoint units launch together, no grandchildren. Parent owns contracts, navigation manifest/docs, credentials/migration application, dev setup and independent final verification; children own their product clusters and focused tests. Communicate changes to cross-unit contracts before making them.

- W1 backend: cloud_computer task sessions/archive/router/migration, agent_dialog + acp/registry hooks, query/task service integration and backend tests.
- W2 native views: cloud-computer/agent-dialog/** and terminal-card/**, new task-workspace/ComputerSessionView.tsx, focused native-view tests.
- W3 host: AgentChat, LeoComposer, ComputerDock, new shared computer-task API and outer workspace, portal task/computer/history entry integration, exports, focused host/API tests. Does NOT edit W2 clusters or backend.

## User behavior

Device -> device -> agent or Terminal in one keyboard/touch-usable popover, with back navigation. Default cloud OceanLeo stays accessible. Agent defaults to graphical conversation; graphical/CLI are labelled honestly as separate sessions unless a native continuation is actually supported. Main region hosts the chosen native surface; no nested independent Past sessions sidebar in embedded mode. Global task history retains discoverability. Opening/selecting never executes an instruction, cancels a run or creates endless processes. New native sessions use explicit New actions/first send. Drafts belong to sessions. Always-visible device/program/view/settings toolbar survives terminal mode. Offline machine remains inspectable; cloud-saved history stays readable; no cloud fallback.

Gear opens the existing right workspace with scoped agent/terminal settings, not another in-card modal. Selecting a program alone does not open settings. Title names machine/program. Mark machine-wide settings versus session/program defaults; terminal appearance affects CLI too. Preserve prior right-side content/tab when leaving settings and keep runtime mounted while changing views. Stop/permissions remain bound to their session.

## Shared HTTP contract (W1 server, W3 client, W2 uses client)

`ComputerTaskSession` fields: `id`, `task_id`, `computer_id`, `computer_name`, `kind: "acp"|"cli"|"terminal"`, `program: "oceanleo"|"cursor"|"claude"|"codex"|"hermes"|null`, `native_session_id: string|null`, `created_at`, `updated_at`, optional `saved_at`, `sync_status: "saved"|"pending"|"error"`. Terminal uses null program. IDs are opaque bounded identifiers.

- POST `/v1/computers/{computer_id}/task-sessions`: `{kind, program?, task_id?, native_session_id?, title?, request_id}` -> `{task_id, session: ComputerTaskSession}`. request_id provides idempotent creation. Existing task ownership is checked; it may receive several native sessions WITHOUT changing its original execution target or cancelling it. New direct tasks have `mode="computer"`, `plan.computer_workspace={version:1}` and no cloud engine is started. Persist before returning success; storage errors fail closed. New tasks and terminal sessions appear in My Tasks (do not use filtered legacy mode=shell). New empty computer tasks must not be filtered as orphaned. Opening known native id is an explicit import, never scan/sync all independent CLI histories.
- GET `/v1/computer-task-sessions?task_id=...` -> `{sessions: ComputerTaskSession[]}`. Ownership of task; available while node offline/removed.
- GET `/v1/computer-task-sessions/{id}/transcript` -> `{session: ComputerTaskSession, frames: Record<string,unknown>[], saved_at: string|null, sync_status}`. Durable graphical user-visible messages/events only; no secret configs, hidden reasoning or terminal keystroke archive. Owner only independent of node state. Bound/paginated output (W1 communicate additional pagination).
- PATCH `/v1/computer-task-sessions/{id}` `{native_session_id}` -> `{session}` binds a CLI/terminal/native identity. Reject cross-owner/machine/program changes and native rebinding. ACP binding also occurs SERVER-SIDE before executing first prompt.

All ACP `new_session`, `open_session`, and `prompt` frames from managed workspace include `task_session_id`. W1 validates task-session owner/computer/program and binds the resolved native id before first user_message. Never accept arbitrary caller owner. W1 archives live frames in gateway, independently of browser attachment. No DB-per-token synchronous write loop. Use an ordered bounded durable scheme and truthful saved/pending/error status; do not swallow storage failure and claim saved. Normalized user/assistant messages also appear in task history. Exclude thought and permission/credential payloads. Preserve user-visible tool summaries where safe. Record deletion cascades and missing managed binding never recreates deleted task.

W3 owns `src/lib/computer-task-api.ts`, exporting `ComputerTaskSession`, `createComputerTaskSession(computerId, input)`, `listComputerTaskSessions(taskId)`, `getComputerTaskTranscript(id)`, `bindComputerTaskSession(id,nativeSessionId)`. Return the HTTP response shapes above directly; throw actionable errors using existing authenticated gateway helpers. Helpers support AbortSignal via optional trailing options if desired; coordinate.

## Native surface contract (W2 exports, W3 consumes)

W2 exports `ComputerSessionView` from `src/shell/cloud-computer/task-workspace/ComputerSessionView.tsx` with props:

```ts
{
  computer: Computer;
  session: ComputerTaskSession;
  active?: boolean;
  settingsOpen: boolean;
  onSettingsContent: (content: React.ReactNode | null) => void;
  onNativeSessionChange?: (id: string) => void;
}
```

Embedded AcpCard uses session.program and session.native_session_id, includes task_session_id in socket frames; load durable transcript and show it offline, update archive status honestly. Embedded Cli/Terminal binds terminal/native ID through API callback; no raw terminal backup implied. Expose content for outer settings pane instead of local overlay, hide embedded program strip/past-session sidebar and local routing mutations. Preserve standalone component APIs/tests for legacy migration; new props opt into embedded behavior. W3 owns the outer always-visible toolbar, current task/session selection, settings state, right panel, and route/history integration.

## Verification

Behavioral focused tests: ownership/isolation/idempotency/archive restart/offline/deletion; no execute on selection; switch without cancel/new native process; explicit CLI separation; settings scope + right-panel open/restore; device status + cloud default; real HTTP client contract. Run focused suites via run-light, full typecheck/build only through `scripts/agent-io-guard.sh run-heavy`. No browser/Playwright. Parent independently runs named tests and UI/portal typecheck, migration/schema checks and dev HTTP checks; refresh all STALE LeoDev slots before done. Local commits only for UI/portal; oceandino docs/manifest follow its mandated checks/push.

## Checkpoints

Every child updates its W*-book with actual files, decisions, command results and remaining work before finishing/interruption. Return commit IDs, exact focused tests, exports/API shape, limitations. No TODO stubs, no deferred product chain. Parent verifies artifact existence and tests rather than accepting reports alone.

## Root final acceptance (Claude Code takeover, 2026-10-30 ~14:00)

The Codex root session and all children stopped around 13:10 (W4 uncommitted, W5 a half-finished draft). A Claude Code agent took over as root to finish W5 (see W5 book), verify and commit W4, and do the integration acceptance.

- Commits: oceanleo `00f1df37` (W5 backend + 0306 + SQL scenarios); oceanleo-ui `9fa80630` (W4 localization, run-state types, task-list status dot, work logs); oceandino `d6a726157` (architecture §15 run state, manifest, regenerated code map; pushed to GitHub main).
- Migration 0306 applied to oceanleo Supabase (shared by dev gateway and production) and local dev-CN postgres. The SQL scenarios passed on both, with all fixtures rolled back.
- `oceanleo-api` (api.dev, :8008) and `oceanleo-dev-cn-api` (:8018) restarted per the verification-tiers runbook; /health 200. The lease-maintenance RPC runs every 30s on both.
- Real-database smoke inside the dev gateway (operator computer `cc_6b9905f8aaf2`, fixtures deleted, 0 left): new W5 smoke 8/8 (idle/seen/generic title → first-message title + running + pending list → approval wait/stale/resume/done with no payload archived + unseen completion → opening marks seen → sibling running → lapsed lease to failed → linked cloud task unchanged with projection → deleted task not resurrected); W1 regression smoke 14/14.
- Unauthenticated api.dev `/v1/computer-task-sessions` and `POST /v1/computers/{id}/task-sessions` → 401.
- UI: guarded full `tsc --noEmit` exit 0; `api:check` clean; focused suites 75 + 56 + 23 + history 21 all pass.
- LeoDev: `oceanleo-dev-slots-fresh.sh` 0 STALE (only the `oceanleo` slot runs, in dev mode). Slot preview `/`, `/history`, `/tasks/<id>` return 200 with no compile errors; `/computers` → 307 `/settings/devices`.
- Not done (outside authorization): no browser/screenshots/real devices, no twin/production push, no shared-package bump.
