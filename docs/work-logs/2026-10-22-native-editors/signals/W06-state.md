# W06 state
- Step 1: survey. Next: library-viewers PDF/canvas, media player, pdfjs removal, Pro config, tests, delivery.
- Step 2: writing pdf-engine-host.ts then porting use-pdf-document/preview-render/text-layer/redaction to pdfium (verified in node: direct engine via http-served wasm works; normalizeRotation:true gives rect top-left coords in cropbox space).
- Step 2 done: pdf-engine-host.ts, use-pdf-document/preview-render/text-layer, redaction ported to pdfium; pdf-forms test green (21). Next: run pdf tests, PdfNextStage Pro lockdown, library PDF reader, media player, canvas, tests.
- Step 3: PdfNextStage rewritten Pro-only (pdf-pro-config.ts, controller pullBytes/onEdited). Next: PdfRoute wiring (drop core flag; sync Pro edits to editor via replaceBytesSilently), then library viewers.
- Step 3b: PdfRoute wired (Pro sync via replaceBytesSilently; core flag removed). Next: tsc on my files, library-viewers PDF reader + media player + canvas, tests.
- Step 4: library-viewers (PDF reader LibraryPdfReader.tsx, canvas->image), LibraryMediaPreview custom player done in source. Next: tsc, update/run tests (frame-host, sandbox-origin, media lifecycle, pdf-next-*), add regression tests, security gate compare, delivery.
- Step 5: tests updated/added (pdf-embedpdf-only, pdf-next-wiring rewritten, frame-host, carrier etc.). tsc queued (/tmp/w06/tsc.out), gate rerun (/tmp/w06/gate2.out). sandbox-origin test has my 3 hunks but also W01 hunks: do not commit.
