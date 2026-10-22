# W10 journal
- Root cause date serials: SheetJS import keeps only format.type="date"; gridFormatToUniverStyle carried numFmt only -> Univer cell had no n.pattern; ISO date text became string. 46239 = 2026-08-05.
- `[Red]` in `0.00;[Red]-0.00` matched /[ymdhis]/ -> mis-typed as date; fixed by stripping quotes/brackets.
- exceljs drops rows with no cells (hidden/height lost) -> touch cell(1).
- Pre-existing failures at HEAD (not mine): grid-document-actions #5, grid-univer-agent-review-gate #22, lightweight-office-frontend #6.
