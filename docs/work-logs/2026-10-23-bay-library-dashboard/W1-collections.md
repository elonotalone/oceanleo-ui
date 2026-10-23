# W1 — shared Library collection foundation and Workspace/Projects

Read `00-dispatch.md` first. Implement the specified shared components using
ArtifactLibrary's existing exact presentation, and refactor ArtifactLibrary
to use them without a visual redesign. Bring Workspace collection entries,
Workspace site/app shelves, and portal Projects onto the same components in
both grid/list modes. Trace WorkspaceDesk -> SiteExplorer/AppDirectory as
needed; do not stop at the unused WorkspaceLibrary path.

Owned files: oceanleo-ui `src/shell/collection-items.tsx`,
`src/shell/ArtifactLibrary.tsx`, `src/shell/workspace-library-view.tsx`,
`src/shell/WorkspaceLibrary.tsx`, `src/shell/AppDirectory.tsx`,
`src/shell/SiteCatalogConsole.tsx`, `src/shell/WorkspaceDesk.tsx`,
`src/shell/index.ts`, needed non-Bay collection tests/public export snapshots;
oceanleo `app/projects/page.tsx`, `components/SiteExplorer.tsx` and a directly
used project/site card only if required by the same component contract.
Do not edit Bay files or collection-chrome.tsx. If a missing hot file is needed,
tell parent before editing. No theme/CSS regeneration (parent owns it).

Preserve favorites, ownership filters, links, selection, keyboard access,
content preview, project navigation and existing data markers. Do not nest
action buttons inside open buttons. Avoid new dependencies. Run focused
collection/render tests through run-light; no browser. Return changed paths,
test command/results and any residual limitation, write evidence to W1-result.md.
Do not commit; parent integrates commits after review.

