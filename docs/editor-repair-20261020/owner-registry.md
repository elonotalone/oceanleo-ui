# Cursor owner registry

All owners run explicit model cursor-grok-4.6-xhigh-fast via local cursor-agent CLI, not Codex subagents. Logs /tmp/editor-repair-20261020-ID.log. CLI launched 2026-10-20 21:02 Asia/Shanghai.

| Owner | exec session | Cursor chat when returned | State |
|---|---|---|---|
| W1 | 13960 | d14705ef-34ce-44d6-8b0c-2f54e98a96cc | first round delivered; r2 task committed |
| W2 | 11410 | pending | first round running |
| W3 | 10195 | pending | first round running; r2 task committed |
| W4 | 17381 | cbf3fe8c-b54a-4697-8a5a-2a2673f756cf | delivered; parent reran five focused tests green |
| W5 | 74903 | 914d7164-a935-4907-8812-6a97396586f8 | first round delivered; r2 task committed |
| W6 | 43128 | pending | first round running |
| V1 | 48562 | pending | baseline/behavioral acceptance running |

## Follow-up owners

First-round V1 committed 587127eb (report includes its historical working-tree timestamp, not final acceptance). W3 committed f612459c; W2 UI d97ef932, gateway 3ace4e8; W6 59e9e746. Parent rereads actual source and reruns focused tests: W2 UI 13 pass, gateway 40 + 80 subtests; W3+W6 26 pass; W4 5 pass; W5 23 pass. W1's initial eight passed before parent found and removed a fail-open sanitizer: that pass is invalid as final evidence until strict sanitizer tests rerun.

Active r2 sessions (all same explicit Cursor model): W1 exec 36107 chat d14705ef-34ce-44d6-8b0c-2f54e98a96cc; W2 exec 88572 chat 406e11c0-405c-41bd-8b38-b776c2463b59; W3 exec 62349 chat 59f32dde-474b-4393-b09c-0dd1c82336ea; W5 exec 12420 chat 914d7164-a935-4907-8812-6a97396586f8; W6 exec 17222 chat be23663a-f88d-4284-8521-69dbf05cf32d. Logs /tmp/editor-repair-20261020-ID-r2.log. V1-r2 task committed but not dispatched until repair owners deliver.

Parent safety corrections committed: 91eb28b4 strict sanitization; bab6aa23 never retarget stale save to a new session. Follow-up owners must preserve these, remove unused speculative buses/adapters, fix real positive source/edit/save/reopen paths and typecheck failures. See integration-review and r2 tasks.

Dev API reload: inspected /opt/multisite-docker/caddy/sites/oceanleo-api.caddy. api.dev.oceanleo.com → local :8008 oceanleo-api; public production is sg-prod. Self-preservation guard passed. Exec 96615 runs guarded docker restart oceanleo-api, currently queued under IO guard; /tmp/editor-repair-dev-api-restart.log. Health was healthy before restart; confirm new StartedAt after completion. No production gateway restart.

Checkpoint commits: UI 2f1101dc, portal 80ab77c, website 1c4ac9b, oceandino 80f1e1466. Oceandino required checks passed (UI tsc, 456 dev/staff tests, 1325 Lucy tests + 200 subtests, 584 script tests + 6 skips, policy valid); GitHub origin/main verified at 80f1e1466. Secondary origin push target /host/opt/git-mirrors/oceandino.git unavailable from this mount; no mirror configuration changed.
