# W15 journal

- ui: removed chart_editing contract row + chart-editor@1 adapter id/registry tombstone/visual-formats/advanced-features rows; tsc 0 errors.
- ui i18n: 13 replay-note templates x16 locales (work-replay-copy), 13 chart* keys x17 tables (collab-visual-copy), 18 chart-editor panel keys (editor-panels-copy-*) removed. No Umo/PPTist/AudioMass/hosted labels exist in message files (searched with word boundary).
- ui tests: sweep of 40+ test files touching the changed modules, base (git archive HEAD) vs tree: no regressions; edit-bar-gesture-coverage and i18n-tt-key-coverage improved.
- backend: baseline 6 failed + 10 errors in reviewed-catalog tests (media proxy URL fixture drift, api.dev host), unchanged after.
- oceandino: build-bundles.mjs --check was already red before my change (22 drifted files since 2026-08-16); regenerated all, --check green.
