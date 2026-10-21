# Editor layout and save owner

User requests all editors: autosave mostly green, yellow only briefly after actual changes; currently slow saves. Fix real persistence/timing, never falsely mark pending changes saved. Left agent/extra-functions panel should smoothly expand while right content contracts and preserves content proportions. Flatten bottom-right zoom widget. Toolbar defaults top, remove dock strip (toolbar owner owns dock files).

Model operator-authorized gpt-6-luna reasoning max. Bootstrap first, read live kernel/oceanleo pack and editor plan. No browser, Playwright, production, installs. apply_patch, main only.

Own: plugin-chrome/*; InlineAdvancedWorkbenchShell.tsx and advanced layout/context modules; use-advanced-autosave.ts, advanced-background-sav* modules; image-editor/* except context toolbar until coordinated with toolbar owner; shared canvas viewport/zoom components; per-editor persistence/layout files as required. Own corresponding focused tests. Do not edit MyLibrary/library modules, auth, SelectionToolbar*, FloatingContextToolbar.tsx, edit-bar-* or EditBarDock*; coordinate shared seams with toolbar owner. Parent owns generated CSS/dependency manifests and full typecheck.

Trace saved state from actual dirty events to receipt, avoid initial/hydration/selection changes triggering writes and repeated serialization/export. Improve genuine save latency with safe debounce and in-flight queuing. Ensure latest changes aren't lost. Animate panel layout in shared code, ensure viewport resize/refit preserves aspect ratios and user zoom where appropriate across cores. Use ResizeObserver/core sizing APIs, no recreated editor core.

Focused behavior tests must exercise edits/saving/overlap and layout structure as appropriate. Use run-light and coordinate any heavy job with parent. No git push/product commits. Report causes, files, editor coverage, tests, remaining limits. Journal docs/tasks/2026-10-21-editor-layout-save-result.md.
