# ACP connection recovery

Owner: reconnect_ui. Scope: src/shell/cloud-computer/agent-dialog/{MessageList.tsx,notice.ts,useAgentDialogController.tsx,reconnect.ts} and focused tests for those files only. Do not touch other dirty files. Run workstation bootstrap and read kernel/task packs before work.

Outcome: temporary computer offline/reconnecting/dialog_unreachable states show a neutral animated loading indicator, no amber text and no Retry button. Loading must correspond to continuing automatic reconnection and disappear after recovery. Preserve messages, active session, draft and running work; never automatically resend prompts. Keep real permission/login/install/program failures actionable.

Investigate the existing controller/reducer recovery chain, implement focused fix and meaningful tests (including recovery after repeated failed reconnects). Existing source already auto reconnects offline frames; avoid unnecessary transport redesign. Record alternatives: existing React indicator + native WebSocket exponential reconnect (chosen; existing stack), generic query retries (does not cover WS), forced page reload (loses draft/view). Falsify assumption via focused runtime test: a failed/offline socket must schedule a new connection and a recovered status must clear loading.

No browser, screenshots, service restarts, dependency installs, package version changes, commits or pushes. Parent owns release and typecheck. Use IO guard run-light for focused tests. Return exact changed files, test commands/results, remaining limitations. Checkpoint report within one minute.
