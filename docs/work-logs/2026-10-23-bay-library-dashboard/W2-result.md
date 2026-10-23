# W2 result — Bay collection consumers

Implemented and ready for parent integration. No commit, push, browser, dependency,
network/auth or generated CSS changes by W2.

## Changed paths

- `src/shell/bay/shell/LeoBayPage.tsx`: removed column-forcing descendant CSS;
  explicitly supplies actual collection view to asset, app and lesson shelves.
- `src/shell/bay/shell/BayList.tsx`: every feed kind renders the shared Library
  card or compact row; lists share one rounded/divided border. Retained distinct
  request budget range, service starting price and consultation unit formatting,
  original restricted service/consult visibility, filtering, loading, favorites,
  pagination and navigation. Panel-specific needs/supply card files untouched.
- `src/shell/bay/asset/BayAssetLibrary.tsx`, `BayAssetCard.tsx`: all four material
  grids use shared collection wrappers; list uses actual 36px thumbnail rows.
  Retained native deep links through W1's `openHref`, asset types, duration,
  provenance and license badges; list badges move into metadata so they do not
  cover the thumbnail. Loading placeholders follow the selected view.
- `src/shell/bay/apps/BayAppShelf.tsx`, `BayAppCard.tsx`: shared card/row/list,
  real view props, retained source capture, summary/author/opens/open mode.
- `src/shell/bay/lessons/BayLessonShelf.tsx`, `BayLessonCard.tsx`,
  `BayBundleCard.tsx`: shared card/row/list and view-aware loading, retained
  course/bundle tabs, summaries, author, chapters, prices, rating, sales,
  struck-through total and savings.
- `tests/bay-apps-shelf.test.mjs`: marker source contract reflects containerProps.
- `tests/bay-collection-views.test.mjs`: real SSR of all four Bay collection
  card components and every feed kind in both display modes.

## Focused evidence

All commands use `agent-io-guard.sh run-light -- node --import
./tests/helpers/assert-dom-guard.mjs --experimental-strip-types
--experimental-loader ./tests/ts-extension-loader.mjs --test ...`.

- 38/38 pass: bay-collection-views, bay-asset-card, bay-apps-shelf,
  bay-lessons-shelf, bay3-page.
- 4/4 pass: bay-asset-library.
- Final rerun after retaining distinct feed price formats/restricted categories
  and collection summaries: 25/25 pass across bay-collection-views,
  bay3-page, bay-apps-shelf.
- Owned-path `git diff --check` passes.

New render assertions prove 36px square thumbnail markup, Library 13px/11px
typography, no aspect-ratio cover in list mode, 16:9 grid covers, one divided
list container, preserved paid lesson/bundle metadata, native asset links and
all demand/help/service/consult feed kinds. Existing page checks cover empty,
loading, retry and pagination behavior without a browser.

## Limitations / parent verification

No visual browser verification. Parent owns shared/portal typechecks, generated
CSS, LeoDev HTTP and slot freshness. Long metadata uses the same truncated
single metadata line as Library; full summaries remain available in detail.
Existing unrelated PDF/video/editor changes were not modified.

## Parent-review correction — native asset links

Parent identified that passing the detail callback to an anchor caused
`BayAssetLibrary.openAsset` to assign the current location even during
Ctrl/Cmd-click. `BayAssetCard` now bypasses the callback whenever `openHref`
exists; normal button cards still invoke it. Shared primitives were not changed.

Added a real React DOM click regression for list and grid. Plain, Ctrl and Cmd
anchor clicks invoke no callback and leave native defaults uncancelled; button
clicks invoke the callback with the asset. The harness only prevents jsdom's
unsupported navigation after React's handler has run.

Focused rerun of `bay-collection-views.test.mjs` and `bay-asset-card.test.mjs`:
16/16 pass with the standard loader/DOM guard through `run-light`.
