# W11 state (video timeline)

## Confirmed facts
- [实测] bootstrap OK 2026-10-23; HEAD 377b212b on main.
- [读码] owned files: `src/shell/advanced-routes/VideoTimelineRoute.tsx`, `src/shell/video-editor/**`, copy book `src/i18n/ui/messages/editor-overhaul-copy-w11.ts`.

- [实测] fixtures in acceptance lib: mp4 root 16cfec58-8240-4e9b-a74b-0a1c8e528724, png 693393d6-ff34-446c-bf32-29f842271f13, mp3 292e3906-5df2-42cb-b539-671350215e20.
- [实测] `/library?item=<root>` shows viewer; editor opens via button aria-label `编辑「…」` (see scenarios/w11-lib.mjs openVideoEditor).
- [读码] W03 projection exists (`edit-bar-canon-table.ts`, `-projection.ts`); A-1: panel canon items = sub-controls with slot inspector + inspectorGroup=<canon id>.
- [读码] convert/timeline.py (parent-owned) export supports: video scale/opacity/x/y/rotation/eq/fit; image scale/opacity/x/y/rotation; text size/color/background/x/y/align/bold; no flip/italic/underline/font-family.

- [实测] video clip bar today: panels 片段时间/音量/位置与变换/画面调色/转场 + muted/speed/fit + more(duplicate/delete). 片段时间 & 位置与变换 share icon position; 音量 & 静音 share effects.
- [实测] clicking a panel button marks it active but the panel host `section.tool-detail` is not visible in the `/library?item=` carrier -> every slider control unreachable (shell/W02 side).
- [实测] seeded clip source_url is a short-lived artifact-access grant (exp ~minutes) -> 410 Gone, preview turns black, and it is saved into the project doc (breaks reopen). Backend media import accepts artifact-access URLs.

## Current step (06:45Z)
- Step 3: code: video-edit-bar.ts (canonical controls, A-1 panels), flip_x/flip_y in model+preview, light/dark timeline palette, durable seed source (refresh grant + import), clip labels, copy book.

## Next
- focused tests + tsc, commit; browser matrix + two themes + save protocol; delivery.
## Repro commands
- focused test: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- browser: `cd docs/work-logs/2026-10-23-editor-overhaul && bash harness/mint.sh | OUT_DIR=/tmp/w11-x THEME=light node harness/run.mjs evidence/W11/scenarios/<s>.mjs`
