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
      editorId: "video-timeline",
      schema: "oceanleo.timeline.v1",
      core: "own timeline (VideoTimelineStage)",
      license: "n/a",
      status: "GREEN",
      reason: "Single-mode native timeline; the designcombo/OpenVideo face is deleted",
    },
    {
      editorId: "deck",
      schema: "pptx",
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
  ]);
