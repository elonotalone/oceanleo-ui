export type EditorLocalizationStatus = "GREEN" | "AMBER" | "RED";

export interface ClientEditorAdapterRecord {
  editorId: string;
  schema: string;
  core: string;
  license: string;
  status: EditorLocalizationStatus;
  reason: string;
}

/** Projection of W04-editors.md for hosts. Not a second inventory. */
export const CLIENT_EDITOR_ADAPTERS: readonly ClientEditorAdapterRecord[] =
  Object.freeze([
    {
      editorId: "image",
      schema: "oceanleo.fabric-image.v1",
      core: "fabric@6.9.1",
      license: "MIT",
      status: "GREEN",
      reason: "Local Fabric session proven offline",
    },
    {
      editorId: "grid",
      schema: "oceanleo.grid.univer.v1",
      core: "@univerjs/presets@0.25.1",
      license: "Apache-2.0",
      status: "AMBER",
      reason:
        "Workbook snapshot load/mutate/save/reopen proven offline. createUniver instance needs W09 Vite bundle of OSS presets; not silent readonly.",
    },
    {
      editorId: "chart",
      schema: "oceanleo.chart.v1",
      core: "echarts@6.1.0",
      license: "Apache-2.0",
      status: "GREEN",
      reason: "Local ECharts session proven offline; AVA stays optional",
    },
    {
      editorId: "pdf",
      schema: "pdf-binary@1",
      core: "@embedpdf/pdfium@2.15.0",
      license: "MIT",
      status: "GREEN",
      reason: "Local pdfium.wasm proven; jsDelivr blocked and still editable",
    },
    {
      editorId: "website",
      schema: "website-source@1",
      core: "WebsiteLocalRoute (W10)",
      license: "MIT",
      status: "AMBER",
      reason: "mountEditor loads WebsiteLocalRoute. Offline proof stays W10.",
    },
    {
      editorId: "design-canvas",
      schema: "oceanleo.design-document.v1",
      core: "DesignCanvasLocalRoute (W10)",
      license: "MIT",
      status: "AMBER",
      reason: "mountEditor loads DesignCanvasLocalRoute. Offline proof stays W10.",
    },
    {
      editorId: "video-timeline",
      schema: "oceanleo.timeline.v1",
      core: "legacy timeline; OpenVideo host only",
      license: "OpenVideo",
      status: "AMBER",
      reason: "Full designcombo package is not a ui dependency",
    },
    {
      editorId: "deck",
      schema: "oceanleo.deck.v1",
      core: "PPTist in pptist-hosted",
      license: "AGPL-3.0",
      status: "AMBER",
      reason: "mountEditor uses DeckHostedRoute + local-hosted:slides. AGPL stays out of this tree.",
    },
    {
      editorId: "richdoc",
      schema: "tiptap-json@1",
      core: "@tiptap/core@3.27.3",
      license: "MIT",
      status: "GREEN",
      reason: "Local Tiptap Editor proven offline; Umo stays W10/umo-hosted",
    },
    {
      editorId: "audio",
      schema: "oceanleo.audio-project.v1",
      core: "waveform-playlist@4.3.3",
      license: "MIT",
      status: "GREEN",
      reason: "Local waveform-playlist + Web Audio proven; AudioMass stays W10",
    },
    {
      editorId: "threed",
      schema: "oceanleo.model-view@1",
      core: "three@0.183.2",
      license: "MIT",
      status: "GREEN",
      reason: "Local three.js view proven; three-editor hosted core stays W10",
    },
    {
      editorId: "game",
      schema: "oceanleo.game-document.v1",
      core: "sandbox host; no IDE core",
      license: "n/a",
      status: "RED",
      reason: "User HTML cannot run in the IPC-trusted editor",
    },
    {
      editorId: "video-canvas",
      schema: "oceanleo.video-canvas.v1",
      core: "VideoCanvasRoute local xyflow (W10)",
      license: "MIT",
      status: "AMBER",
      reason: "mountEditor loads VideoCanvasRoute. Offline proof stays W10.",
    },
  ]);
