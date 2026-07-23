# Native Office editing and OnlyOffice retirement

Status: OnlyOffice runtime retired from source on 2026-07-23. DOCX, XLSX, and
PPTX support remains active through the in-process RichDoc, Grid, and Deck
routes.

## Product outcome

Office-family artifacts open inside the shared OceanLeo workbench and use the
existing source-rendition, save, export, recovery, and version-receipt
contracts. The browser has no document-server script, iframe, JWT-config call,
or Office-specific route. The gateway has no `/v1/office/*` surface, and the
deploy inventory has no document-server stack or proxy.

This retirement does not remove Office MIME classification, OOXML parsing or
export, source/full rendition resolution, or the native document, grid, and
deck editors.

## Chain decision

Three chains were evaluated:

- Direct RichDoc/Grid/Deck reuse (chosen): Tiptap/Mammoth/`docx`, SheetJS/
  ExcelJS, and the native deck OOXML stack already implement the required
  load-edit-save-export paths. They fit the browser runtime with no extra
  service. Unsupported desktop-only OOXML features may be simplified on import.
- Office-specific wrappers: the same parsers would sit behind duplicate state,
  loading, dirty, save, and action bridges. This adds drift without adding a
  capability.
- A document-server iframe fallback: this provides broader desktop fidelity but
  requires a cross-origin script, iframe focus handoff, JWT config/callback API,
  another production process, and a second save lifecycle. It is not reachable
  from the current capability registry and is therefore retired rather than
  retained as an unused fallback.

## Production and migration evidence

The 2026-07-23 audit established:

- `EditorRoute` has no `office` member and `AdvancedContentWorkbench` dispatches
  document, grid, and deck artifacts directly to native routes.
- All 31 TSV-resolved package consumers had no direct OnlyOffice, `DocsAPI`, or
  `/v1/office` caller. The only consumer matches were contract tests for legacy
  metadata.
- Gateway and document-server logs showed historical traffic before the native
  cutover, with the last persisted callback at 10:02 UTC. A timestamped gateway
  window beginning before the 12:33 UTC native-cutover commit contained zero
  `/v1/office/config` or `/v1/office/callback` requests.
- Production still contained 45 current artifact revisions whose historical
  capability token was `office-editor`, four durable session snapshots whose
  stored route was `office`, and six saved callback receipts. Those rows contain
  user-owned Office files/history; they are not a dependency on the retired
  service and must not be deleted.

The `office-editor` capability alias and stored `office` session remap therefore
remain compatibility inputs only. They must resolve by typed artifact/source
format to `richdoc`, `grid`, or `deck`; they never authorize an Office route or
network call. New canonical metadata uses the native capability, adapter, and
project schema. Removing the compatibility inputs requires a separate verified
data migration after the historical-row counts reach zero.

## Falsifiable assumption and acceptance

The chosen chain is invalid if native import/model/export cannot load a real
DOCX, XLSX, and PPTX, mutate it, emit a valid same-family file, and reopen the
edit.

The pre-edit proof passed on 2026-07-23 for all three OOXML families. Focused
acceptance is permanently covered by:

- `tests/office-real-file-roundtrip.test.mjs` for real OOXML round trips.
- `tests/lightweight-office-frontend.test.mjs` for native dispatch and the
  absence of Office routes, document-server transport, and public exports.
- `tests/shared-capability-plane.test.mjs` and
  `tests/advanced-session.test.mjs` for the bounded historical metadata/session
  remap.

