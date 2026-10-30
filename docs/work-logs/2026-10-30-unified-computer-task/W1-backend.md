# W1 — managed task sessions and durable cloud conversation

Read `00-contract.md` beside this book, live kernel, bootstrap, matching oceanleo/deploy/parallel packs. Model gpt-6.1-sol. Own `/root/projects/oceanleo/backend/app/cloud_computer/task_sessions.py` (new), new task session router, app/main.py registration, additive migration (pick unused number), agent_dialog.py, acp/registry.py archive hooks, agent/query_service.py and task_service.py necessary computer-mode guards, backend focused tests. No UI edits except checkpoint append in this book. No node/client changes. No production/twin push or live service restart. Parent applies migration/credentials and dev setup. Commit only your files locally on main.

Implement the exact shared HTTP contract in 00-contract, secure owner-bound durable recording of platform-started ACP sessions even without browser listeners, native binding before first turn, query discoverability and deleted-task protection. Existing cloud task linking must preserve original target, engine and plan fields. Existing unbound standalone sessions remain compatible. Focused tests must exercise security/failure/restart/idempotency not just source strings. Coordinate storage/transcript pagination or API additions with W2/W3/root promptly. Use existing database/auth patterns and inspect DB schema constraints; do not invent missing columns. Record user/assistant text into task messages as well as structured replay archive, retain minimal safe tool summaries. Root needs an additive migration ready for helper application and dev API verification. Log real findings/checks below.

## Checkpoint

Not started.
