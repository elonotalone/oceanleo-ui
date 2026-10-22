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
      status: "GREEN",
      reason:
        "Workbook snapshot proven offline. W09 dist editor.html?type=grid instantiates Univer (Sheet1) without importmap.",
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
      editorId: "video-timeline",
      schema: "oceanleo.timeline.v1",
      core: "own timeline (VideoTimelineStage)",
      license: "n/a",
      status: "GREEN",
      reason: "Single-mode native timeline; the designcombo/OpenVideo face is deleted",
    },
    {
      editorId: "deck",
      schema: "oceanleo.deck.v1",
      core: "native deck editor (DeckRoute)",
      license: "n/a",
      status: "GREEN",
      reason: "Single-mode native deck; the hosted PPTist face is deleted",
    },
    {
      editorId: "richdoc",
      schema: "tiptap-json@1",
      core: "@tiptap/core@3.27.3",
      license: "MIT",
      status: "GREEN",
      reason: "Local Tiptap Editor proven offline; hosted Umo face is deleted",
    },
    {
      editorId: "audio",
      schema: "oceanleo.audio-project.v1",
      core: "wavesurfer.js",
      license: "BSD-3-Clause",
      status: "GREEN",
      reason: "Local wavesurfer + Web Audio; hosted AudioMass face is deleted",
    },
    {
      editorId: "threed",
      schema: "oceanleo.model-view@1",
      core: "three@0.183.2",
      license: "MIT",
      status: "GREEN",
      reason: "Local three.js view proven; hosted three.js editor face is deleted",
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
