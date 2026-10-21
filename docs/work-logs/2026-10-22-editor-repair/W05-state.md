# W05 state — spreadsheet toolbar glyph coverage

## Facts

- Repo is `/root/projects/oceanleo-ui`, branch `main`, based on `07bf3412` (`W01` shared bar commit); worktree also contains unrelated W02/W04 edits and an unrelated public API snapshot edit. Preserve them.
- Ownership is limited to `src/shell/doc-editors/GridUniverStage.tsx`, `src/shell/doc-editors/grid-univer/*`, `src/shell/AdvancedEditorIcon.tsx`, focused grid/icon tests, and W05 evidence files.
- The adopted spreadsheet core remains Univer. The per-editor plan specifies native React `@univerjs/presets` / Sheets OSS presets; no engine or dependency change is needed.
- `gridUniverSelectionContext()` builds toolbar controls from runnable L1/L2 rows in `GRID_UNIVER_COMMANDS`.
- `controlForCommand()` marks L2 action controls `iconOnly: true` without assigning an `icon`; generic action controls also default to icon-only. The real shared `SelectionToolbarControl` turns an absent `control.icon` into `null`, and its button renderer omits the label for icon-only compact controls. This produces visually blank controls while retaining only an `aria-label`.
- Color controls already have a real icon plus a color swatch. Alignment gets its active glyph from the current value. `AdvancedEditorIcon` is exhaustive at the TypeScript type level but currently returns an empty SVG if an invalid runtime name bypasses the type.

## Current

The focused runtime regression now renders the real generated grid controls through the shared `SelectionToolbarControl`. Before the repair, it failed on `numfmt-preset is icon-only but has no rendered glyph`; the unknown-name negative control also produced an empty `<svg>`. The first attempt to import TSX directly did not execute any test cases; after switching to `module-bench`, both cases ran and reproduced the defects.

The repair assigns a meaningful existing glyph to every generated runnable grid command, including the icon-only formatting and structure actions; decimal precision also carries its own glyph. `AdvancedEditorIcon` now renders a question-mark-in-circle fallback and marks it with `data-icon-fallback="true"` when a runtime name is unknown. Parent confirmed scope: do not add a new border tool because there is no existing visible border control to repair.

Focused verification passed 58/58 subtests across the icon-rendering, grid facade command, grid wiring/runtime, and L4 chip suites. `git diff --check` is clean. Parent still owns shared typecheck and dev-slot acceptance. Repo remains on `main`; no package, lock, environment, provider, browser, or production action was taken.

## Next

1. Record the exact verification and owned file list in `W05-delivery.md`.
2. Commit only the explicit W05 source/test/evidence paths on `main`.
3. Return the commit and delivery file; parent performs typecheck/dev acceptance.

## Reproduction

Executable reproduction before the repair: `tests/grid-univer-icons.test.mjs` via the focused command below reported `numfmt-preset is icon-only but has no rendered glyph`; the negative control rendered an empty `<svg>`. The corrected module-bench path made both assertions execute.

Verification command: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=1 --test-timeout=180000 tests/grid-univer-icons.test.mjs tests/grid-univer-facade-commands.test.mjs tests/grid-univer-wiring.test.mjs tests/grid-univer-l4-chips.test.mjs` — 58 tests passed, 0 failed.
