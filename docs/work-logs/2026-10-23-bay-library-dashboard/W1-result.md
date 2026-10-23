# W1 result — shared collections

Implementation is ready for parent review; no commits, pushes, browser use,
dependency edits, generated theme CSS or Bay edits were performed by W1.

## Changed paths

In `oceanleo-ui`:

- `src/shell/collection-items.tsx`: Library-standard Card/Row/List. Card owns
  16:9 cover, 13px medium title, 11px metadata. Row owns 36px square cover,
  px-4 py-3 spacing. List owns rounded border and dividers. Open and action
  controls are siblings. `openHref` preserves native anchor semantics;
  `containerProps` preserves drag and collection markers, `openProps` preserves
  open-button markers. Optional selected/disabled states are retained.
- `src/shell/ArtifactLibrary.tsx`: shared components, existing preview/favorite
  behavior and virtual grid retained; cover children fill shared wrappers.
- `src/shell/workspace-library-view.tsx`, `WorkspaceLibrary.tsx`: shared
  Card/Row/List with thumbnail viewer, drag and entry actions retained.
- `src/shell/AppDirectory.tsx`: site/agent entries share Card/Row/List;
  favorite, delete, prompt, badge, custom entry and capability images retained.
- `src/shell/AppMarket.tsx`: actual Workspace app shelf shares Card/Row/List;
  install, two-step uninstall, request rollback and navigation preserved.
- `src/shell/Playground.tsx`: actual Workspace prompt shelf shares Card/Row/List;
  add and modal editing callbacks preserved, custom/category/description
  information retained as metadata. Other Playground behavior untouched.
- `src/shell/index.ts`, `src/architecture/public-api.snapshot.json`: public
  collection primitives and generated public API snapshot.
- `tests/collection-items.test.mjs`, `tests/app-market.test.mjs`,
  `tests/app-directory-workspace-card.test.mjs`: focused coverage and updated
  expected Library 16:9 geometry.

In `oceanleo`: `app/projects/page.tsx`: both views use shared components;
project URLs remain native links, star handlers and filters remain intact.

No edits were needed in SiteExplorer, WorkspaceDesk or SiteCatalogConsole:
the traced real paths are WorkspaceDesk → PlaygroundDetail → SiteExplorer →
AppDirectory for sites, AppDirectory for agents, AppMarket for apps, and
PromptZone in Playground for prompts.

## Evidence

From `/root/projects/oceanleo-ui`, passed **35/35**:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/app-market.test.mjs tests/app-directory-workspace-card.test.mjs tests/collection-items.test.mjs tests/collection-chrome.test.mjs tests/library-collection-chrome.test.mjs
```

Checks include AppMarket list toggle rendering 36px thumbnails inside a single
divided list; install not accidentally opening the item; failed install
rollback; uninstall confirmation; real card navigation; native anchor URLs;
independent favorite/open callbacks; no nested buttons; selected/drag markers;
directory capability-image URLs and multilingual labels.

Focused TypeScript transpile syntax checks returned zero errors for all edited
TSX implementation files. `git diff --check` passed for owned implementation
and tests, including portal Projects. Public API snapshot generated with
`run-light -- node scripts/public-api-snapshot.mjs`.

Initial test invocation without the repo's extension loader failed resolving
an existing extensionless TypeScript import. Using the canonical loader as
above resolved it; no product workaround was added.

Parent owns package/portal typechecks, generated CSS, API export check,
integration review and LeoDev freshness. No visual-browser verification claimed.

## Parent review follow-ups

Card metadata now always reserves its second text line (non-breaking-space
fallback), so an entry lacking metadata has the same body footprint. Projects
now displays its existing translated `PROJECT_KIND_LABELS[project.kind]`.
Both Library virtual grids estimate the shared 16:9 cover plus 66px for the
two text lines, padding and borders, plus their configured row gap; obsolete
4:3 estimates/comments were removed.

Follow-up checks passed **26/26**, including the new absent-metadata check
and existing 1,000-item virtualization, scrolling and keyboard-focus cases:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/collection-items.test.mjs tests/virtual-grid.test.mjs
```

The regenerated API snapshot includes pre-existing `plugin-theme` export
drift discovered by parent; W1 did not edit `plugin-theme` source.
