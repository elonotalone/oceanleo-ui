# UT game close confirmation

Owner copy_a, gpt-6.1-sol high standard tier. Live kernel/bootstrap plus wave contract and UT book apply. Same detached worktree; no install/branch/push/deploy/release/browser/screenshots/generated CSS/API/process stops/secrets.

Own ONLY src/shell/game-editor/GameProjectEditor.tsx and tests/game-project-render.test.mjs. Final report comparison found one remaining wave real defect: no-native-dialog.test.mjs passes on v0.256.2 but new GameProjectEditor.tsx uses window.confirm when closing dirty code. Replace it with existing native-feeling shared ConfirmDialog, preserving explicit save/discard choice and dirty-state warning. Reuse current tt text already translated (修改尚未保存，仍要关闭吗？ and standard Cancel/Close labels); do not add untranslated copy. Preserve no action on cancel and close only after user confirms. Add meaningful mounted dirty-close cancel/confirm test, no native browser dialogs. Existing tests/game-project.test.mjs and game-project-render.test.mjs + no-native-dialog.test.mjs must pass, source hooks lint green.

Main final full suite running at A (~1000 cases); finish source+tests quickly before G file loads; do not stop suite. No other source. Evidence game-confirm-* under UT-evidence; commit explicit owned paths; report commands/counts.
