# W2 — embedded native conversation, CLI, terminal and scoped settings

Read `00-contract.md` beside this book, live kernel, bootstrap, matching oceanleo/parallel packs. Model gpt-6.1-sol. Own `/root/projects/oceanleo-ui/src/shell/cloud-computer/agent-dialog/**`, `terminal-card/**`, and new `task-workspace/ComputerSessionView.tsx` plus native-view-focused tests. Do NOT edit AgentChat, LeoComposer, ComputerDock, shared lib/computer-task-api.ts, exports index or portal/backend. W3 owns those. No grandchildren. Commit only your files and your checkpoint book locally on main; no package bump/push/deploy/browser.

Implement exact ComputerSessionView props from 00-contract. Adapt existing live views in embedded mode to remove nested program strips and Past sessions columns/routing, preserve native session identity, transmit task_session_id on ACP prompt/new/open, display durable server transcript on offline/removed devices. Avoid frontend-only persistence; W1 archives on server. Use shared W3 API functions from contract. NativeId binding must finish before next managed operation. Deliver settings content via callback to outer right pane; do not render in-card overlay in embedded mode. Scope labels must accurately distinguish machine-wide flags, current conversation model/config, CLI launch defaults, shared terminal appearance. Preserve standalone compatibility, permissions/cancel, model controls, attachments and no hidden execution. Graphical/CLI are independent bindings; no false same-process view-switch guarantee. Device/program data unknown is loading, not uninstalled. Focused SSR/controller/component behavioral tests without browser. Log real findings/checks below.

## Checkpoint

Not started.
