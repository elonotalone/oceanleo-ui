# W06 delivery — PDF on EmbedPDF only + native Library previews

Owner W06 (Sonnet 5.5, medium). Everything below is a claim for the parent to verify.

## Premise correction (read first)

The task book said "normal mode = existing PdfNextStage normal path". That path was an empty `<div>`
(it opened the document and rendered nothing). The real normal mode was `PdfStage` drawn on
**pdf.js**. "EmbedPDF only" therefore meant moving the real normal-mode rendering, thumbnails,
text layer and redaction verifier onto the PDFium engine, not just deleting a flag. That is what was done.
Editing (annotations, page ops, forms, redaction content-stream edits) still uses pdf-lib on bytes, as before.

## What changed

### 1. PDF engine: pdf.js removed from src
- NEW `src/shell/media-editors/pdf-engine-host.ts`: one place that builds the PDFium engine outside React
  (`worker` for UI, `direct` for redaction/node), wasm address via the existing `resolvePdfiumWasmUrl`
  (env > bundled > refuse, never a CDN). Also `openPdfEngineDocument`, `paintImageData`, `readPdfPageText`.
- `use-pdf-document.ts`, `use-pdf-preview-render.ts` (stage + thumbnail rail), `use-pdf-text-layer.ts`
  now use `renderPageRaw` / page table / text runs. `usePdfPreviewRender` keeps the same outputs
  (rotation, pageWidth/Height, renderedZoom, renderThumbnail).
- `pdf-form/redaction.ts`: text positions and the "independent reader" verification now come from PDFium
  text runs (`normalizeRotation: true`, CropBox origin added back). `extractPageTextWithPdfJs` is renamed
  `extractPageTextWithPdfium` (also in `pdf-form/index.ts`).
- Found while porting: PDFium's `extractText` returns uninitialised garbage for a page with zero characters
  (it would make a scan look like it has a text layer, and made "redacted page is empty" fail). Text is read
  from runs instead (`readPdfPageText`), covered by a test.
- `pdf-manifest.ts`: `PDF_TEXT_LAYER_EXTRACTOR` is now `pdfium@embedpdf-2.15.0`; the schema enum still
  accepts the legacy `pdfjs-dist@4.10.38` so stored manifests stay valid.
- `pdf-workbench-utils.ts` `pdfErrorMessage`: understands engine rejections (`reason.code` 3 = not a PDF,
  4 = password) instead of showing nothing.
- Remaining `pdfjs` strings in src: only the legacy-extractor constant/enum (above) and two doc strings.
  No import of `pdfjs-dist` anywhere in `src` (regression test scans it).

### 2. PDF Pro = official EmbedPDF viewer, locked to the OceanLeo file flow
- NEW `media-editors/pdf-pro-config.ts` (pure, tested): disables `document-menu/open/close/print/export/
  protect/capture` categories (buttons and shortcuts; snippet `disabledCategories` applies to commands too),
  `tabBar: "never"`, `maxDocuments: 1`, no external fonts, host-accent theme (light/dark by `html.dark`).
- `PdfNextStage.tsx` rewritten Pro-only (no `mode` prop, no engine hook, no empty normal div). It exposes a
  controller whose `pullBytes()` calls the viewer's `export` plugin `saveAsCopy()`, and subscribes to the
  `history` plugin to report edits.
- `PdfRoute.tsx`: no `resolveEditorCore` flag any more (normal = `PdfNormalFace`, Pro = lazy viewer).
  Pro edits: on history change (600 ms debounce), before leaving Pro (`beforeLeavePro`, blocks with the gate's
  retry UI on failure), before flush/save, and before download, the route pulls the viewer bytes and swaps them
  into the editor with `replaceBytesSilently(..., {markDirty, personEdit})`. So top-bar save/autosave/download
  read the Pro edits. Failures surface in the status bar; no success is reported on an unsynced edit.
  `pdf-workbench-state.ts`: `replaceBytesSilently` option type gained `personEdit` (already implemented).

### 3. Library PDF preview
- NEW `src/shell/LibraryPdfReader.tsx` (lazy): fetches bytes through `fetchMediaBlobRefreshing` (same
  re-sign-on-410 logic as before, now one shared `fetchItemSourceBlob` also used by the text path), renders pages
  lazily to canvases on PDFium. Read-only: no download/print/annotate. No iframe.
- `library-viewers.tsx`: the `<iframe src=pdf>` branch, its `sandbox-exempt: pdf-plugin` marker and the whole
  `PDF_FRAME_*` allowlist / `isSandboxExemptPdfFrameUrl` are deleted from this file. (Security gate was
  baseline-FAIL before I touched anything; see Verification.)

### 4. Video/audio preview
- `LibraryMediaPreview.tsx`: no native `controls`. Own player bar: play/pause, seek, current/total time,
  volume + mute, fullscreen (video). `controlsList="nodownload noremoteplayback noplaybackrate"`,
  `disablePictureInPicture`, `disableRemotePlayback`, context menu suppressed. The panel-active release /
  resume-position lifecycle is unchanged (d22 tests green).

### 5. canvas kind
- `library-viewers.tsx`: `canvas` previews as an image (rendition if it is an image, else preview/thumb
  poster) via `ProgressiveArtifactImage`; never `SandboxedWebViewer`. Falls back to `StructuredCanvas`
  (node snapshot) only when there is no bitmap. `libraryKindLabel("canvas")` is now `图片`.
  `SandboxedWebViewer` is unchanged for website/game/geo_map/interactive_doc/video workflow.

## Commits (main)
- `33ee332c` PDF read/render/text/redaction on PDFium, drop pdf.js
- `be8b6164` Pro viewer lock + sync, Library PDF reader, media player, canvas as image, tests
- this delivery commit

## Verification (commands run; all via `agent-io-guard run-light` with the standard node flags)
Green: `pdf-forms` (21), `pdf-embedpdf-only` (5, new), `pdf-next-wiring` (9, rewritten), `pdf-next-core-swap` (19),
`pdf-next-init-timeout`, `pdf-next-annotations`, `pdf-carrier-contract` (31), `pdf-editor-v8`, `pdf-annotations*`,
`pdf-workbench-hook-runtime`, `collab-pdf-adapter/readonly/sync/undo`, `doc-family-commands`,
`untrusted-content-pdf-frame-host` (5), `d22-library-media-lifecycle` (10), `library-viewer-honesty`,
`library-preview-landing`, `library-document-open`, `library-failure-surface`, `library-stability`,
`library-task-render-loop`, `library-render-stability-1022`, `d4-r7-library-background-restore`.
Typecheck (`run-heavy -- npx tsc --noEmit -p .`): 8 errors, none in my files (VideoTimelineRoute `useRef`,
grid `xlsx-export.ts`: other owners). The run began before my last two small edits (`pdfErrorMessage`,
a one-line import in `LibraryPdfReader`); re-run once the heavy slot is free.
Security gate: before my changes `FAIL` (cross-repo render scan). After: 2 failures, neither new findings:
(a) render-scan reports "NEW / UNDECLARED FINDINGS: none" but allowlist drift — including the now-stale entry for
`library-viewers.tsx` UC-3-IFRAME-NO-SANDBOX that my deletion caused (see requests); the other four stale entries
are the hosted routes other owners deleted; (b) `hosted-editor-contract-v2.test.mjs:536` missing UC reference (not mine).

Not done / not possible here: no browser, so the Pro viewer's real DOM was never inspected; the lock is based on the
snippet's command table and `disabledCategories` documentation (see limitations).

## Tests deleted/rewritten and why
- `pdf-next-wiring.test.mjs`: flag/dual-core assertions and the `flag=next` empty-stage tests removed (that path no longer
  exists); rewritten to assert: lazy Pro leaf, no flag, same-bytes handoff, file commands disabled, the mode-switch gate,
  and Pro-edit sync (fake registry -> `replaceBytesSilently`).
- `untrusted-content-pdf-frame-host.test.mjs`: the "two copies of the allowlist are identical" and "library-viewers frame
  guarded by allowlist" assertions replaced: the cover keeps its guarded frame; Library has no PDF frame.
- `pdf-carrier-contract` §5.4 (pdf.js canvas) -> PDFium canvas; extractor const -> enum; `pdfjs-dist` dependency
  version assertion dropped. `pdf-editor-v8`, `collab-pdf-readonly`: stale regexes (two were already red before this
  wave because `PdfRoute` had changed) updated to the current shape.
- Regression tests that fail if the old behaviour returns: `tests/pdf-embedpdf-only.test.mjs` (no pdfjs import in src;
  Library PDF renders no `<iframe|embed|object`; media preview has no native `controls`, has OceanLeo bar, nodownload,
  no PiP; canvas preview is an image and its branch has no `SandboxedWebViewer`; PDFium opens/renders/reads text and a
  blank page reads `""`) and `pdf-next-wiring` (Pro editing must flow back).

## Cross-owner requests
1. **W01 / parent — `tests/untrusted-content-sandbox-origin.test.mjs`** (file is red as a whole today from W01's
   `HOSTED_EDITOR_EMBED_BASES` removal). It needs these library-viewers expectations, which I applied in the working
   tree but did **not** commit because W01's hunks are in the same file: `library-viewers.tsx` iframes 1 / exemptions 0;
   total exemptions 1 (cover only); drop `library-viewers.tsx` from the "PDF frame blocks Referer" loop.
2. **Parent — oceandino `scripts/oceanleo-untrusted-render-allowlist.json`**: delete the stale
   `UC-3-IFRAME-NO-SANDBOX` entry for `oceanleo-ui/src/shell/library-viewers.tsx` (0 hits now).
3. **Owner of `workspace-library-cover.tsx`** (not in my cluster): the Library *cover thumbnail* for PDFs still uses a
   sandbox-exempt `<iframe>` on the PDF URL (and its host allowlist). Same Chrome-viewer problem as the detail had; it
   should render page 1 through `pdf-engine-host` (or the artifact's preview rendition) and drop the exemption.
4. **W02**: `tests/eas-w19-five-editors-handoff.test.mjs` test 14 reads the deleted `AudioPlaylistStage.tsx`.

## package.json
- Request: remove `pdfjs-dist` (no import left in `src`; only strings/tests mention it). `pnpm-lock.yaml` follows.
- No additions needed (`@embedpdf/*` already present; `@embedpdf/models` imported as types only).
- Public barrels: no export removals needed from my files (`LibraryPdfReader` is internal; `src/shell/index.ts` unchanged).

## Honest limitations
- **Pro viewer bypasses not browser-verified.** Covered by config: open (Ctrl+O), close, print (Ctrl+P), export,
  protect/encrypt, screenshot capture, menu, tab bar, single document. Not confirmed by running it: (a) the PDF
  attachments panel/annotation attachment "save" affordances, (b) drag-and-drop of a file onto the viewer (limited by
  `maxDocuments: 1` but not tested), (c) right-click "save image" on stamps. If any shows up, add its category to
  `PDF_PRO_DISABLED_CATEGORIES` (snippet categories listed in that file's comment). Cannot be fully blocked from our
  side beyond what the config offers.
- Pro edits join the editor as a whole-file byte swap: they are **not** in OceanLeo's undo stack (Pro keeps its own
  undo), and sync is debounced 600 ms (flush/leave/download force it). With collaborators present the swap goes
  through the existing "local annotation" merge path; that combination is untested.
- Pro starts from the editor bytes at the moment it opens and is mounted once per Pro session (the viewer reads its
  config only at mount).
- Page rasterisation moved from pdf.js to PDFium: appearance of exotic PDFs can differ (fonts: external font fallback
  is deliberately off unless `NEXT_PUBLIC_OCEANLEO_PDFIUM_FONT_BASE` is set, so missing fonts show as blank/boxes).
  Viewed only through tests, never visually.
- Library reader renders at fit-width up to 900 px, no zoom/search/text-selection (read-only by design).
- Encrypted PDFs: PDFium rejects them; the user gets "这份 PDF 有密码保护，暂不能打开。" (pdf.js had the same limit).
- Dev-slot freshness (`oceanleo-dev-slots-fresh.sh`) not run: no bump/deploy allowed in this task.
