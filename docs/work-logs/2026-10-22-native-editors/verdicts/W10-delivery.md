# W10 delivery — Grid (Univer): faithful XLSX export, date serials, single undo/redo

Claims below are mine; parent verifies.

## What changed

Added
- `src/shell/doc-editors/grid-univer/xlsx-export.ts` — `buildGridXlsxFromUniverSnapshot(snapshot)` builds the XLSX directly from the Univer snapshot with exceljs (no `GridSheet` detour). Returns `{ blob, dropped[] }`. Also `gridXlsxDroppedWarning` and `univerSnapshotToPreviewSheets` (display text for the Library thumbnail: cached formula results, number formats applied, so dates are not serials).
- `tests/grid-univer-xlsx-export.test.mjs` (12 tests, round trip snapshot -> xlsx -> exceljs read-back), `tests/grid-univer-date-import.test.mjs` (4 tests, real xlsx through `loadGridFile`).

Edited
- `GridUniverStage.tsx`: save, download-xlsx and pdf-conversion source use the new builder; thumbnail uses the display sheets; save status shows `dropped` (never silent). The old unconditional "autofilter over the whole sheet + freeze row 1" is gone (it was invented, not from the document).
- `grid-univer/snapshot.ts`: `effectiveGridNumberFormat` (legacy `type` date/currency/percent -> Excel format string), `dateToExcelSerial`; ISO date text in date cells becomes a serial number plus date pattern.
- `grid-model.ts` (`readWorkbook`): carries the source `numFmt`; date detection ignores quoted text/`[Red]`/escapes (`0.00;[Red]-0.00` was typed as date); Date values keep their time when non-midnight.
- `grid-univer/stage-plan.ts`: preset config `menu` hides `univer.command.undo` / `redo` (Univer's own MenuConfig, no CSS). OceanLeo top bar keeps the single undo/redo.
- `tests/advanced-native-editors.test.mjs`, `tests/lightweight-office-frontend.test.mjs`: one line each, symbol name asserted in the grid stage source (`buildGridRouteWorkbookBlob` -> `buildGridXlsxFromUniverSnapshot`).

Deleted: nothing. `GridWorkbookExport.ts` `buildGridRouteWorkbookBlob` / `applyGridConditionalFormats` are no longer used by the stage but are still imported by other tests (`advanced-editor-v8-...`) and the carrier pipeline, so they stay.

## Written to XLSX now (round-trip tested)
values (number/text/boolean/formula with cached result, shared formulas), number formats, dates, fonts (bold/italic/underline/strike/size/name/colour), fill, alignment, wrap, rotation, borders, merges, column widths, row heights, hidden rows/columns/sheets, tab colour, freeze panes, gridlines, zoom, data validation (list/whole/decimal/date/textLength/custom, operators, prompts, error style, expanded per cell), hyperlinks (external and in-workbook), notes and thread comments (as XLSX comments, replies joined), rich-text runs, autofilter range, conditional formats (number ops incl. between, text ops, formula, top-N, above/below average, colour scale, data bar, icon set), images (base64 only), defined names.

## Reported in the save/download notice (cannot be written)
table objects, active filter conditions (range kept), checkbox validation, multi-select list written as single list, rules with no XLSX equivalent (unique/duplicate/time-period highlight), non-base64 images, partly linked text (whole cell becomes a link), validation over 100k cells, list longer than 255 chars. The Univer snapshot saved in the Library keeps everything.

## Date serial bug
Cause: SheetJS import produced `format.type = "date"` only; `gridFormatToUniverStyle` copied `numFmt` only, so the Univer cell had no pattern (formula dates showed 46239/46249 = 2026-08-05/15) and ISO date text stayed text. Fixed on import and in conversion; regression test builds a real xlsx with date, date-formula, currency and `[Red]` cells. Stored Univer documents are not rewritten; documents already saved without a pattern need a user format change (no silent rewrite).

## Verification
- Focused: `run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- Green: new two files (16), all `tests/grid-*.test.mjs` and `collab-grid-*` except the two below, `advanced-native-editors`, `replay-frames-grid`.
- Failing at HEAD, not caused by me (source-text regexes on the stage): `grid-document-actions` #5 (`sourceFailed: Boolean(officeSource.error)`), `grid-univer-agent-review-gate` #22, `lightweight-office-frontend` #6 (`{!snapshotReady && (`). Parent/owner of the stage-text tests should update them.
- Typecheck: see bottom.

## Cross-owner requests
- `tests/advanced-project-autosave.test.mjs` (dirty from another owner, not touched): lines ~245 and ~307 assert `buildGridRouteWorkbookBlob` in `GridUniverStage.tsx`; change to `buildGridXlsxFromUniverSnapshot`. Fails 2 tests until then.
- `tests/advanced-editor-v8-doc-grid-chart-model3d.test.mjs` fails to load (chart-schema removed, W01); its grid half still imports `buildGridRouteWorkbookBlob`, which still exists.
- Library sheet preview (`library-viewers.tsx`, W06) reads the saved xlsx; nothing needed.

## Deps requested
None.

## Remaining limitations
- Not browser-verified (no browser by rule): the `menu` hide for undo/redo is verified by config + Univer source (`mergeMenuConfigs` applies per schema id), not by looking at the ribbon.
- CSV download still uses raw cell text (formulas as `=...`, dates as serials); not changed.
- exceljs cannot write Excel threaded comments or tables; replies are flattened into one comment.
- Image offsets use a rough pixel-to-cell conversion; images are placed by cell anchors only.
- Icon-set thresholds are best-effort from Univer's operator/value list.

## Typecheck follow-up (parent request)
First `tsc --noEmit -p .` reported 7 errors in `xlsx-export.ts` (exceljs `CellIsOperators` has only equal/greaterThan/lessThan/between; `ContainsTextOperators` has no beginsWith/endsWith/notContains). Fixed without casts: greaterThanOrEqual, lessThanOrEqual, notEqual, notBetween, beginsWith, endsWith, notContainsText are written as equivalent `expression` rules on the range's top-left cell (new test covers them). Re-run `run-heavy -- npx tsc --noEmit -p .`: 0 errors in my files (see /tmp/w10-tsc2.txt; total TS errors in repo: counted below). Grid tests: `grid-univer-xlsx-export` + `grid-univer-date-import` 17/17 pass.
Repo-wide TS error count in that run: 1 (none in W10 files).
