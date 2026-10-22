# W01 state
- Done (src): PRO_PAGE_EDITORS allowlist (plugin-pages/mode-store/page-store/toggle), chart editor deleted, EmbeddedRoute + hosted origins + client-local-editors + hosted-local-origin deleted,
  routing: website->WebsiteLocalRoute, video_canvas->VideoCanvasRoute, canvas/design->ImageRoute (route type image), legacy "embed" pin aliased at read time (advanced-session, workbench-routes),
  chart/vector_image -> read-only UnsupportedRoute with reason, theme ids chart-editor/design-canvas removed (design-canvas adapter id aliased to image), sandbox/protocol: hosted + injected-loopback trust removed, TRUSTED_EMBED_EDITOR_BASES now empty.
- Now: test triage of cross-editor tests (affected-by-grep list /tmp/w01-list2.txt, broader /tmp/w01-list3p.txt; baseline copy of HEAD in /tmp/w01-head via git archive for pre-existing-failure comparison).
- Next: finish test triage, security gate rerun, tsc rerun, write verdicts/W01-delivery.md, commit.
- Repro: focused test = _COMMON.md run-light cmd; guard: tests/native-editors-guard.test.mjs (last test "sub-site embed pane" red until W07 removes VideoCanvasStage EmbedEditorPane use).
