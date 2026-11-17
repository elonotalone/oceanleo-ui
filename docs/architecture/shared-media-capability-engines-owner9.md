# Shared media capability engines

The shared package owns image editing and video timeline editing. Audio playback and 3D viewing are detail-viewer capabilities. Audio and 3D generation remain independent of file editors.

Image operations preserve source identity and append immutable recipes. Provider-backed image operations require an adapter that advertises the requested command and return lineage for their output. Missing providers return an explicit capability failure.

`TimelineDoc` is the timeline's only editing document. Semantic edits produce revisioned snapshots; saving and rendering consume the same normalized snapshot. Render cancellation is explicit, and receipts pin schema and document revision. The timeline retains its audio tracks, captions, image insertion and gateway render integration.

The timeline media-kind classifier is independent of node-graph persistence and lives in `src/shell/video-editor/video-material.ts`. The public timeline capability barrel is `video-editor/capabilities`. Image and timeline commands keep the shared command registry, selection adapters, theme and persistence contracts.

The `@google/model-viewer` detail viewer retains GLB/glTF display and its Three.js peer dependency. Native audio detail playback uses the existing media player. Organization diagrams retain their own xyflow dependency and are outside media editing.
