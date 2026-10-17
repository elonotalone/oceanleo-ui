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
      reason: "Native in ui; offline session not yet proven here",
    },
    {
      editorId: "chart",
      schema: "oceanleo.chart.v1",
      core: "echarts@6 + @antv/ava",
      license: "Apache-2.0/MIT",
      status: "AMBER",
      reason: "Native in ui; not yet wired to EditorSession",
    },
    {
      editorId: "pdf",
      schema: "pdf-binary@1",
      core: "@embedpdf/*@2.15.0",
      license: "MIT",
      status: "AMBER",
      reason: "WASM must stay bundled; not yet proven in this runtime",
    },
    {
      editorId: "website",
      schema: "website-source@1",
      core: "remote website embed; Puck not landed",
      license: "MIT",
      status: "RED",
      reason: "Current route loads the remote website site",
    },
    {
      editorId: "design-canvas",
      schema: "oceanleo.design-document.v1",
      core: "remote design embed",
      license: "MIT",
      status: "RED",
      reason: "Current route loads the remote design site",
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
      status: "RED",
      reason: "AGPL must stay in the public hosted repo",
    },
    {
      editorId: "richdoc",
      schema: "tiptap-json@1",
      core: "Tiptap local / Umo hosted",
      license: "MIT",
      status: "AMBER",
      reason: "Tiptap can go local; Umo stays in umo-hosted",
    },
    {
      editorId: "audio",
      schema: "oceanleo.audio-project.v1",
      core: "waveform-playlist / AudioMass hosted",
      license: "MIT",
      status: "AMBER",
      reason: "AudioMass remains a separate hosted origin",
    },
    {
      editorId: "threed",
      schema: "oceanleo.model-view@1",
      core: "model-viewer / threeeditor-hosted",
      license: "MIT",
      status: "AMBER",
      reason: "Full three.js editor stays in the hosted repo",
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
      core: "remote video embed",
      license: "MIT",
      status: "RED",
      reason: "Current route loads the remote video site",
    },
  ]);
