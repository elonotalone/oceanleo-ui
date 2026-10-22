# Native editors wave — dispatch contract (2026-10-22)

Operator decisions (this conversation, 2026-10-22, all explicit):

1. **No shell-website editors.** An editor must never be a whole third-party web app
   (iframe or otherwise) with its own menus/theme/empty-state. AudioMass, three.js
   editor, Umo, PPTist hosted Pro faces are deleted now. Pro buttons for them disappear.
   (User content *preview sandboxes* — UGC website/game run frames — are not editors and stay.)
2. **Pro only where the same core ships an official full UI on the same instance.**
   Exactly three editors keep a Pro page: **grid** (Univer full ribbon), **pdf**
   (EmbedPDF official `@embedpdf/react-pdf-viewer` on the same engine), **website**
   (Puck default full UI). Every other editor has **one mode** — no Edit/Pro tabs, no
   mode switch, no "pro" code path. "Do not build Pro for the sake of having Pro."
3. **Chart editor is deleted** (code). Chart Library items: parent handles data later.
4. **Image and design canvas merge into one editor and one material type** (`image`).
   Stored documents are not silently rewritten: old `canvas` / design items are aliased at
   read time to the image editor/type; new writes use `image`.
5. **Audio moves to wavesurfer.js only** (drop waveform-playlist, last release 2022).
6. **PDF uses EmbedPDF only.** No Chrome built-in PDF viewer (iframe of a PDF URL), no
   pdf.js rendering path. Library PDF preview is our own EmbedPDF reader surface.
7. **Delete the vendored OpenVideo/designcombo "pro" timeline entirely.**
8. **Games: inject a prebuilt three.js runtime into the UGC sandbox** so agent-generated
   three.js games work (sandbox stays offline, no external scripts).
9. Native feel bar for every editor: no in-editor File/Edit/View menubar, opening always
   shows the user's content (never "drop a file here"), save/share/export only via the
   OceanLeo top bar, host theme, no third-party branding, no shell-website.

This supersedes, for these points, the 2026-09 "editor core-swap wave" section of the
oceanleo rule pack (PPTist/Umo hosted, pro = core native UI for all 13). Parent updates
the pack and code map after integration.

## Owners (all children: model sonnet, effort medium, never fast)

| ID | Owner of | Repo |
|---|---|---|
| W01 | Shell core: Pro-page allowlist, routing/registry/flags/origins, chart editor removal, EmbeddedRoute shell-iframe removal, iframe guard test | oceanleo-ui |
| W02 | Audio editor on wavesurfer.js, single mode; delete AudioMass hosted | oceanleo-ui |
| W03 | 3D editor single mode; delete three.js editor hosted | oceanleo-ui |
| W04 | Rich doc (Tiptap) single mode; delete Umo hosted | oceanleo-ui |
| W05 | Deck single mode; delete PPTist hosted | oceanleo-ui |
| W06 | PDF EmbedPDF-only (normal + official Pro) + Library previews (PDF, video, audio, canvas) | oceanleo-ui |
| W07 | Video timeline + video canvas single mode; delete OpenVideo/designcombo vendor | oceanleo-ui |
| W08 | Image + design canvas merge (one editor, `image` type, read-time alias, new writes) | oceanleo-ui + oceanleo backend |
| W09 | Website: Puck normal (composed light UI) + Puck default Pro | oceanleo-ui |
| W10 | Grid: XLSX export from full Univer data, date serial bug, duplicate undo | oceanleo-ui |
| W11 | Game three.js sandbox runtime + generator prompt/lint + single mode GameRoute | game + oceanleo backend + oceanleo-ui GameRoute |

Parent: package.json/lockfiles, shared i18n message files, full typecheck/suite,
integration, rule pack + code map, dev-slot freshness, data handling.

## Cross-owner contracts

- **Pro allowlist (W01):** `PRO_PAGE_EDITORS = ["grid", "pdf", "website"]` (single source,
  exported from `src/shell/plugin-chrome/plugin-pages.ts`). `buildPluginPages` emits the
  `pro` page only for these. `plugin-mode-store` must return `normal` for any other
  editor even if localStorage says `pro` (stale persisted state). Editor owners remove
  their own `usePluginMode` / `PluginModeSwitchGate` / pro branches; W01 keeps the shared
  infra working for the three Pro editors and deletes nothing an editor owner still imports.
- **Routing (W01):** design-canvas / `canvas` items route to the **image** route and
  `ImageRoute` (W08 makes ImageRoute open design-document projects and deletes
  `DesignCanvasLocalRoute`). Chart routes are removed; a chart item resolves to
  UnsupportedRoute/read-only. Website always uses `WebsiteLocalRoute`, video canvas always
  `VideoCanvasRoute`; the subsite iframe fallback in `EmbeddedRoute` is removed. Stored
  documents whose format the local editor cannot open become read-only with the existing
  "one-click convert" when a converter exists — never a shell iframe, never silent rewrite.
- **Theme ids (W01 owns `plugin-theme.tsx`):** remove `chart-editor`; `design-canvas`
  folds into `image` (keep a type alias only if needed for stored state).
- **Library viewers (W06 owns `library-viewers.tsx`, `LibraryMediaPreview.tsx`):** canvas
  kind previews like an image (rendition image), label 图片; no SandboxedWebViewer for
  design canvases.
- **Tests:** you own tests that are mainly about your files. Cross-editor tests that list
  all editors (registries, flags, theme ids, page rows, w10 mounts, hosted origins) are
  W01's. If you delete a module that a test you don't own imports, note it in your
  delivery — do not edit that test.
- **Shared files nobody but the parent edits:** `package.json`, lockfiles,
  `src/i18n/ui/messages/*` (unused keys are fine; new UI text uses `tt("中文")` inline as
  the surrounding code does), `src/index.ts` / `src/shell/index.ts` public barrels
  (report needed export removals; parent applies and runs `npm run api:check`).

## Evidence layout

`docs/work-logs/2026-10-22-native-editors/` — `tasks/Wxx.md` (task book),
`signals/Wxx-state.md`, `signals/Wxx-journal.md`, `verdicts/Wxx-delivery.md`.
