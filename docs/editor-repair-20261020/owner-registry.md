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

Checkpoint commits: UI 2f1101dc, portal 80ab77c, website 1c4ac9b, oceandino 80f1e1466. Oceandino required checks passed (UI tsc, 456 dev/staff tests, 1325 Lucy tests + 200 subtests, 584 script tests + 6 skips, policy valid); GitHub origin/main verified at 80f1e1466. Secondary origin push target /host/opt/git-mirrors/oceandino.git unavailable from this mount; no mirror configuration changed.
