# W10 state
- Done: date fix (snapshot.ts effectiveGridNumberFormat/dateTextToSerial + grid-model.ts readWorkbook numFmt), grid-univer/xlsx-export.ts (snapshot->exceljs), stage wiring (save/export/preview), ribbon undo/redo hidden via preset `menu`.
- Current step: tsc check, commit, delivery.
- Repro: run-light node --test tests/grid-univer-xlsx-export.test.mjs tests/grid-univer-date-import.test.mjs
