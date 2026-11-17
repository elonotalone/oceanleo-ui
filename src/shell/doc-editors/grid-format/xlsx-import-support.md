# XLSX import in the sheet editor

`loadGridFile` / `loadGridSheets` retain a native payload alongside the legacy display projection. `gridSheetsToUniverSnapshot` uses that payload directly for OOXML sheets. The original sparse cell coordinates are preserved; the old display projection still has its 10,000-row / 256-column limit, but it no longer limits the imported Univer snapshot. Non-OOXML formats retain their existing import path. Existing engine/workbook size limits still apply; this does not promise arbitrarily large worksheets render interactively.

Supported and covered by synthetic ExcelJS import → snapshot → XLSX export → re-import tests:

- Manifest font families and regional Noto aliases; font size, bold, italic, single/double underline, strike; explicit, indexed and workbook-theme colours including HSL luminance tint.
- Solid fills, outer and diagonal borders, horizontal/vertical alignment, wrapping, rotation and paragraph indent. Numeric/date format strings, typed numbers/text/booleans, cached/shared formulas and normalization of 1904 dates to the editor epoch.
- Merges, row heights, column widths, row/column styles, empty styled cells, hidden rows/columns/sheets, frozen rows/columns, gridlines, zoom and tab colour.
- List validation, including dynamic range/named-list references. Dropdown chip colours are inferred from matching equality conditional formats covering the dropdown range. Other ordinary whole/decimal/date/text-length/custom validations retain criteria and messages.
- Numeric cell-value comparisons (all eight operators), formula rules, text equality, basic text highlighting, two/three-colour scales and positive data bars. Rule order and `stopIfTrue` survive. A relative text/numeric formula is only normalized to a value rule when it refers to the range's own top-left cell.
- External and same-workbook hyperlinks, rich-text runs, workbook/sheet-scoped defined names (range, formula and constant, including hidden/comment metadata).
- Legacy cell comments become editable `SHEET_NOTE_PLUGIN` notes, including notes on empty cells. Absolute and relative comment relationships and nested comment part paths are supported; note text survives XLSX export and re-import.
- Embedded PNG/JPEG/GIF floating drawings with pixel/EMU anchors, and modern Excel rich-value “Place in Cell” pictures. Inline images carry complete Univer document drawing metadata and preserve aspect ratio. Font loading on imported and reopened snapshots uses the existing shared loader.

## Representation boundaries

These are not Excel's full layout/calculation semantics:

- Non-manifest fonts are substituted with the corresponding Noto sans/serif regional family. Font effects beyond the listed properties (shadow/outline, superscript/subscript, accounting underline semantics), gradient/pattern fills, shrink-to-fit and vertical justification/distribution are not retained exactly. Centre-across-selection becomes centre alignment. Pixel/character/point unit conversions can round; indent is represented in 24-pixel steps. Text direction is stored, but Univer 0.25.1 documents that direction rendering is incomplete.
- Very-hidden sheets become ordinary hidden sheets. Only the first worksheet view and its frozen splits are used; independent split windows and scroll positions are not reproduced. Print/page layout, protection, filters, structured tables, charts, shapes, threaded comments and pivot data are outside this import mapping.
- Legacy comment rich-text styling, author metadata and VML popup geometry are not represented by the native plain-text note model; note text and cell coordinates are retained.
- Conditional icon sets and other vendor extensions are not mapped. Custom negative data-bar colours, axis/border/length settings are not retained. Chip palettes can only be recovered when the file contains an unambiguous uniform equality-fill palette; Excel itself has no native chip-colour data. Remaining conditional formats stay separate from the chip palette. Imported advanced rule types are limited by the existing XLSX exporter's supported rule set and its downgrade reporting.
- Formula text and cached values are retained; this does not add missing Excel functions, dynamic-array spill semantics, external workbook connections, VBA, macros or an Excel calculation engine. Defined-name formulas have the same engine limits. Built-in `_xlnm.*` print/filter names are excluded.
- Only embedded PNG/JPEG/GIF images are restored. Image crop, rotation, effects, drawing hyperlinks/alt text, backgrounds, network `IMAGE()` rendering, WPS `DISPIMG`/cellimages and external linked pictures are not restored. In-cell download uses the existing exporter's one-cell anchored picture representation; Excel has no reliable way to distinguish that from a floating picture fitted exactly to one cell, so such a one-cell drawing reopens as an in-cell image here. Other floating drawings retain their position/size/anchor mode. Partial-text links continue to follow the exporter's existing whole-cell-link limitation.

No browser or visual comparison was run for UGRID; assertions cover data and actual generated XLSX packages. No new dependencies, visible strings or database writes were added. Fonts use the existing asset loader.
