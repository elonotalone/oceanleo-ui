# W11 state (video timeline)

## Confirmed facts
- [实测] bootstrap OK 2026-10-23; HEAD 377b212b on main.
- [读码] owned files: `src/shell/advanced-routes/VideoTimelineRoute.tsx`, `src/shell/video-editor/**`, copy book `src/i18n/ui/messages/editor-overhaul-copy-w11.ts`.

## Current step
- Step 1: read video-editor code (toolbar, command surface, timeline hook, preview engine, route) to map every edit-bar control to its executor.

## Next
- Step 2: write browser scenario `evidence/W11/scenarios/` that clicks every edit-bar button on video / image / text / audio clips and screenshots before/after -> broken list.
- Step 3: fix, migrate to canonical ids (§4), light/dark, save protocol §5.

## Repro commands
- focused test: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- browser: `cd docs/work-logs/2026-10-23-editor-overhaul && bash harness/mint.sh | OUT_DIR=/tmp/w11-x THEME=light node harness/run.mjs evidence/W11/scenarios/<s>.mjs`
