# W07 state
- Facts: VideoTimelineRoute has legacy(own timeline)+designcombo pro via PluginModeSwitchGate; VideoCanvasRoute has no pro path (already single).
- Plan: (1) add video-editor/openvideo-reader.ts (read-only reader + explicit convert of stored oceanleo.video.openvideo.v1), (2) rewrite VideoTimelineRoute single mode, (3) git rm vendor/, designcombo/, VideoDesigncomboStage.tsx, designcombo-save-preview.ts, (4) tests: delete designcombo tests, add regression, (5) delivery.
- Step: 1
- Focused test cmd: see _COMMON.md run-light, files tests/video-*.test.mjs, w10-video-*.test.mjs
- follow-up: remove EmbedEditorPane path from VideoCanvasStage; own workbench-embed, use-prefer-local-editors
