# W06 state
- Step 1: survey. Next: library-viewers PDF/canvas, media player, pdfjs removal, Pro config, tests, delivery.
- Step 2: writing pdf-engine-host.ts then porting use-pdf-document/preview-render/text-layer/redaction to pdfium (verified in node: direct engine via http-served wasm works; normalizeRotation:true gives rect top-left coords in cropbox space).
- Step 2 done: pdf-engine-host.ts, use-pdf-document/preview-render/text-layer, redaction ported to pdfium; pdf-forms test green (21). Next: run pdf tests, PdfNextStage Pro lockdown, library PDF reader, media player, canvas, tests.
