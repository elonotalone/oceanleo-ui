# Lightweight Office frontend

## Product outcome

DOCX, XLSX, and PPTX artifacts open as basic editable content inside the shared
OceanLeo workbench. The browser uses a compact native edit bar and the existing
source, save, export, recovery, and version-receipt contracts. It never loads an
ONLYOFFICE script, creates a `DocsAPI.DocEditor`, mounts an Office iframe, or
lets an embedded editor replace the workbench chrome. The backend Office
service can remain deployed because it is no longer a frontend dependency.

## Candidate frontend chains

### Reuse RichDoc, Grid, and Deck directly (chosen)

- Mature components: Tiptap plus Mammoth and `docx` for documents, SheetJS and
  ExcelJS for workbooks, and the existing OceanLeo deck model plus
  PptxGenJS/OOXML import for presentations.
- Interoperability: each parser and exporter consumes or emits the documented
  OOXML package formats (`.docx`, `.xlsx`, `.pptx`); the same
  `source`/`full` rendition resolver and artifact version API remain in use.
- Guarantees: one native state model owns edits, dirty state, recovery, save
  receipts, and export. The workbench keeps its own toolbar, focus, keyboard
  handling, loading state, and error state.
- Environment fit: all work runs in the existing browser bundle, without a
  document-server connection, JWT editor config, cross-origin script, iframe,
  or extra runtime process.
- Moving parts: three already-shipped editor hooks and stages, one lightweight
  Office dispatcher, and their existing import/export adapters.
- Known failure mode: OOXML features outside the lightweight models can be
  simplified on import. The UI must describe itself as a basic editor and
  preserve supported text, cells/formulas, slide text/layout, and explicit
  export rather than promise full desktop fidelity.

### Add Office-specific wrappers around each native editor

- Mature components and interoperability are the same as the direct chain, but
  an Office wrapper would translate every native editor state and action into a
  second shared abstraction.
- Guarantee: it could provide one nominal Office API for all three formats.
- Environment fit: still browser-only, but adds adapter state, event relays,
  and save/export forwarding for every format.
- Moving parts: a wrapper component, wrapper hook, three action bridges, and
  duplicate loading/error/dirty state.
- Known failure mode: wrapper state can drift from the native hook and cause a
  stale save receipt or a toolbar action to target the wrong editor. It adds no
  user-visible capability, so it ranks below direct reuse.

### Keep an iframe fallback

- Mature component: the deployed ONLYOFFICE Document Server and its documented
  JavaScript embedding API.
- Interoperability: broad Office-format fidelity and server-managed callback
  saves.
- Guarantee: unsupported native features could remain available in the
  embedded suite.
- Environment fit: requires a reachable cross-origin document server, signed
  config, dynamic `api.js`, iframe focus handoff, and substantially more memory
  and network capacity than the lightweight editors.
- Moving parts: gateway config endpoint, script loader, `DocsAPI.DocEditor`,
  iframe lifecycle, callback save polling, and native-chrome takeover.
- Known failure modes: script/download timeout, third-party frame focus and
  accessibility gaps, stale callback receipts, and an inconsistent workbench.
  It also directly violates the product requirement that no reachable frontend
  Office route render DocsAPI/ONLYOFFICE, so it is rejected without fallback.

## Falsifiable assumption and pre-edit proof

The chosen chain is invalid if the existing native import/model/export stack
cannot load a representative DOCX, XLSX, and PPTX, apply a content edit, emit a
valid same-family file, and reopen that edit without evaluating `DocsAPI` or
mounting an iframe.

Before production edits, a throwaway Node proof exercises those real
import/export modules with generated representative packages. The proof must
report successful DOCX, XLSX, and PPTX round trips and statically reject
`DocsAPI`, ONLYOFFICE script loading, or iframe construction in the proof
chain.

Proof command:

```sh
bash scripts/agent-io-guard.sh run-light -- node /tmp/oceanleo-lightweight-office-proof.mjs
```

Result on 2026-07-23: PASS. All three generated packages loaded, were edited,
saved, validated as OOXML, and reopened with the edited content intact. The
proof also scanned all 42 native editor modules and found no DocsAPI, dynamic
Office script, `DocEditor` construction, or iframe runtime.

