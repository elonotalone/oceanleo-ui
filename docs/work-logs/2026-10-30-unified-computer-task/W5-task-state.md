# W5 — native task identity, title and running state completion (existing W1 agent)

Root review found0304 creates every native task completed with a generic computer/program title and never updates task status/title when ACP runs. This makes merged My Tasks misleading and histories indistinguishable. This follows the authorized unification, not an extra product. Existing W1 backend owner is reassigned this disjoint backend follow-up; W3 owns only localization now, W2 delivered. Model gpt-6.1-sol; bootstrap, main only, no children/browser/push/node/service restart. Parent applies migrations/dev reload and independently checks real DB.

Own existing W1 backend files, an additive0306 migration (do not rewrite already-applied0304/0305 behavior incompatibly), backend tests, and this book. No UI/core/copy/generated files. Commit locally only named ownership. Coordinate extra fields if needed; existing ComputerTaskSession JSON may safely add optional run_status.

Native-only tasks must reflect managed ACP running, waiting for user approval, completed, failed/cancelled states and unseen completion in ordinary My Tasks. Keep per-session state so finishing one sibling cannot hide another running/waiting session. Project aggregate visibility onto linked ordinary cloud tasks WITHOUT rewriting their original engine/target/plan/status or starting a cloud engine; preserve owner scope. Permission payloads remain unarchived; only safe lifecycle state may persist. Preserve all existing account/target contracts and don't infer execution success from UI selection, an API accepting a request or merely binding a terminal. For CLI/terminal, distinguish an open terminal from an agent task completing; leave truthful association-only status unless server can observe native lifecycle reliably, document the boundary.

Native task titles should become recognizable from the first real user message, using existing safe title conventions and bounded text, without another model call. Preserve explicitly supplied/edited titles and never rename linked existing cloud tasks; mark auto-title intent explicitly at create to disambiguate. Safe default old newly-created generic native tasks may receive a first-message title, but do not retroactively rewrite user-authored history. Tests must cover two concurrent sessions (one done/one running), approval timeout/cancel, cloud task projection without mutation, no implicit model/execute, user-edited title preservation, restart state durability, and deleted session non-resurrection.

## Checkpoint

Not started.
