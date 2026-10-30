# W3 — unified main task host, Device navigation, right settings and routes

Read `00-contract.md` beside this book, live kernel, bootstrap, matching oceanleo/parallel packs. Model gpt-6.1-sol. Own `/root/projects/oceanleo-ui/src/shell/AgentChat.tsx`, LeoComposer.tsx, cloud-computer/ComputerDock.tsx, new lib/computer-task-api.ts and new outer workspace files OUTSIDE W2 task-workspace/ComputerSessionView.tsx, necessary shared exports/history display helpers and host/API-focused tests; portal `/root/projects/oceanleo/app/tasks/**`, `/app/computers/**`, necessary task/home/history routes only if required. Do NOT edit agent-dialog/**, terminal-card/**, ComputerSessionView.tsx, backend, or navigation manifest. W2 owns native views; W1 backend. No grandchildren. Commit only your files and checkpoint book locally on main; no package bump/push/deploy/browser.

Implement shared HTTP client contract, Device -> device -> agent/terminal hierarchy with cloud OceanLeo retained, offline browsing, statuses, no native execution on selection, main task wrapper mounting W2 ComputerSessionView, durable task/session discovery and task URL restoration, always-visible switching across acp/cli/terminal, explicit independent CLI launch wording, settings in existing right pane with previous content preserved. Existing task boundTarget semantics must not silently mutate a running task execution target; attach a separate managed session to it. New direct tasks mode=computer and plan.computer_workspace. Keep native views mounted while changing active view so switching does not kill/restart/cancel work. Backend tasks list includes them. Avoid a duplicate nested session-history app. Preserve legacy computer deep links through intentional import/forwarding into main task workspace; leave device management reachable. Root will update code map and run dev acceptance. Coordinate any contract questions immediately. No localStorage-only chat archive. Use existing auth/routing, no new deps. Focused tests behavioral without browser. Log real findings/checks below.

## Checkpoint

Not started.

## Checkpoint — host implemented, focused verification

- Added shared authenticated `computer-task-api.ts` create/list/transcript/bind functions, pagination and AbortSignal; exports in lib barrel.
- Added `task-host/ComputerTaskWorkspace.tsx`: task-owned durable discovery, URL session restoration, device/program hierarchy, passive device inspection, managed descriptor creation on graphical program selection, explicit independent CLI/terminal creation, stable session.id keys and hidden mounted views, always-present toolbar.
- AgentChat uses this host in its existing SplitWorkspace; right settings temporarily replace visible right content while preserving prior content mounted and its open/tab state. Existing boundTarget remains unchanged and cloud chat remains mounted.
- Home ComputerDock computer rows lead to program selection; offline computer remains inspectable. Managed selection forwards to task URL. Device management remains reachable.
- Legacy computer URLs use `ComputerTaskImport` (known native identity only); legacy shell tasks import their own identity into that same task then display main AgentChat. Portal task and computer routes updated.
- Managed inbox upload fourth argument `{task_session_id}` adds query and returns optional private archive metadata per W1; W2 notified.
- Focused command `agent-io-guard.sh run-light -- node --test tests/computer-task-host.test.mjs tests/computer-task-api.test.mjs`: PASS 3/3. Behavioral host test checks offline inspection without execution, URL restoration/switch, stable mounted views, independent CLI label, cloud default and settings toggle.
- First guarded UI typecheck ran before W2 ComputerSessionView existed; only missing module and inferred callback id. Explicit callback typing fixed; full integration typecheck pending W2 file arrival.

## Checkpoint — focused integration verification complete

Expanded actual DOM behavioral tests (no browser): settings close preserves exact prior preview instance and edited input; native switching preserves both mounted instances; offline device drill-in/back is passive; explicit independent CLI wording and cloud return; legacy named CLI deep link imports into existing task and forwards to managed URL under StrictMode. Added actual authenticated gateway request/error-path coverage, including storage failure.

Final focused command: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/computer-task-host.test.mjs tests/computer-task-api.test.mjs` — PASS 6/6. `git diff --check` PASS. No second whole typecheck queued because W2/root own integrated typechecks. New ComputerTaskSettingsPane preserves prior right workspace instance. New cloud tasks explicitly submit cloud target rather than inheriting a previously remembered execution choice. Parent owns remaining integrated typecheck/dev-slot checks.
