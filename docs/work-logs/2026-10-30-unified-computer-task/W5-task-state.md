# W5 — native task identity, title and running state completion (existing W1 agent)

Root review found0304 creates every native task completed with a generic computer/program title and never updates task status/title when ACP runs. This makes merged My Tasks misleading and histories indistinguishable. This follows the authorized unification, not an extra product. Existing W1 backend owner is reassigned this disjoint backend follow-up; W3 owns only localization now, W2 delivered. Model gpt-6.1-sol; bootstrap, main only, no children/browser/push/node/service restart. Parent applies migrations/dev reload and independently checks real DB.

Own existing W1 backend files, an additive0306 migration (do not rewrite already-applied0304/0305 behavior incompatibly), backend tests, and this book. No UI/core/copy/generated files. Commit locally only named ownership. Coordinate extra fields if needed; existing ComputerTaskSession JSON may safely add optional run_status.

Native-only tasks must reflect managed ACP running, waiting for user approval, completed, failed/cancelled states and unseen completion in ordinary My Tasks. Keep per-session state so finishing one sibling cannot hide another running/waiting session. Project aggregate visibility onto linked ordinary cloud tasks WITHOUT rewriting their original engine/target/plan/status or starting a cloud engine; preserve owner scope. Permission payloads remain unarchived; only safe lifecycle state may persist. Preserve all existing account/target contracts and don't infer execution success from UI selection, an API accepting a request or merely binding a terminal. For CLI/terminal, distinguish an open terminal from an agent task completing; leave truthful association-only status unless server can observe native lifecycle reliably, document the boundary.

Native task titles should become recognizable from the first real user message, using existing safe title conventions and bounded text, without another model call. Preserve explicitly supplied/edited titles and never rename linked existing cloud tasks; mark auto-title intent explicitly at create to disambiguate. Safe default old newly-created generic native tasks may receive a first-message title, but do not retroactively rewrite user-authored history. Tests must cover two concurrent sessions (one done/one running), approval timeout/cancel, cloud task projection without mutation, no implicit model/execute, user-edited title preservation, restart state durability, and deleted session non-resurrection.

## Checkpoint

Not started.

## Completion checkpoint (Claude Code takeover, 2026-10-30 13:40)

The W5 child stopped mid-implementation at 13:10 with an uncommitted draft. The takeover agent reviewed it and fixed these defects before committing:
- `associated` was projected into `agent_tasks.status`, which has no CHECK constraint. Now only real run states project; a task with only CLI/terminal sessions keeps its status.
- When storing the approval-wait state failed, the exception surfaced in `broadcast` and the permission/question frame never reached the browser. Now `_set_run_state` swallows and logs the failure; the lease converts unrecorded runs to failed.
- A gateway restart or node loss left `running` stuck forever. Fixed with a 3-minute `run_lease_until`, renewed by frames and by `maintain_runs()` (only for bindings whose ACP process is still usable via `registry.any_running`). `computer_task_expire_runs` changes lapsed leases to `failed/lease_expired`; a late `done` from the same turn restores completed. `public()` shows a lapsed lease as failed before maintenance runs.
- Explicit history import drove the live lifecycle (it marked tasks running → completed and unread). It now uses the `computer_task_import` RPC, which sets the transaction-local `oceanleo.computer_import` flag and clears it afterwards. Import still gives the task its title from the first message.
- Config/model errors while idle, and stops issued before a turn starts, no longer rewrite a finished outcome. `computer_reconnecting` is transient. `computer_offline` and other errors during a live turn → failed.
- Sibling aggregation: a live sibling takes priority; otherwise the latest outcome by `run_changed_at` (clock_timestamp) wins, so a stale earlier failure no longer outranks a later completion.
- New native tasks are created `seen=true` (the user just opened them); unread is set only on a running → finished transition.
- `attach_run_states` is a read-only projection, adding `computer_run_status` only while running/waiting, and fail-soft (the task list never breaks). The list no longer carries the full `computer_sessions` payload.

UI: `AgentTask.computer_run_status` and `ComputerTaskSession.run_status` types; the History/My Tasks status dot uses the native live state for linked cloud tasks and knows `completed`/`waiting_user`.

CLI/terminal boundary: the server cannot observe agent turns inside a PTY, so those sessions stay `associated` and never set task state; binding a terminal or opening a PTY is not completion.

Evidence:
- `backend/tests/sql/computer_task_lifecycle_0306_rollback.sql` covers two concurrent sessions, approval wait/stale resume/timeout, cancel, idle error, lease expiry + late done, user-edited/explicit titles, import without lifecycle, a linked cloud task left unmodified, the owner fence, the terminal fence, and deleted-task non-resurrection. Passed on dev-CN postgres (inside a rollback transaction, then for real after applying) and on oceanleo Supabase (variant ending in `SCENARIO_OK_0306`, all rolled back).
- 0306 applied to oceanleo Supabase and to local dev-CN postgres.
- Backend: `test_computer_task_sessions.py` + cc_dialog sessions/v2/inbox/cancel: 74 passed. Query-service suites: 80 passed, 2 failed in `test_task_created_by_leo.py` — the same 2 fail on the stashed baseline (stale tests from the earlier hide-shell-rows change).
- Commit oceanleo `00f1df37`.
