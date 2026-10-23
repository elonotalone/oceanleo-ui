# W2 — all Bay collection cards and genuine list rows

Read `00-dispatch.md` first. Use the specified W1 shared components in Bay.
Remove descendant column-forcing CSS from LeoBayPage. Pass real view state
into the asset, app, lesson/bundle and feed shelves, so list renders compact
rows with 36px covers and shared list wrapper. Grid must match Library's
16:9 / 13px / 11px format too. Supply content to shared components, do not
copy their classes. W1 owns their implementation and exports; coordinate API
extensions through parent if needed.

Owned files: `src/shell/bay/shell/LeoBayPage.tsx`, `BayList.tsx`,
`src/shell/bay/asset/BayAssetLibrary.tsx`, `BayAssetCard.tsx`,
`src/shell/bay/apps/BayAppShelf.tsx`, `BayAppCard.tsx`,
`src/shell/bay/lessons/BayLessonShelf.tsx`, `BayLessonCard.tsx`,
`BayBundleCard.tsx`, directly associated shelf/row tests only.
Leave panel-specific existing supply/needs row implementations unchanged;
Bay page feed uses shared row/card for all feed kinds. Preserve detail
navigation, favorites, search, filters, load-more, empty/loading/error states
and metadata including prices. No chart, AppManage, network/auth or security
origin/iframe/injection edits. No package changes or generated CSS.

Run relevant focused shelf/page tests via run-light and add a meaningful
rendering check proving list has compact row markup (not a large grid card).
No browser. Return changed paths, test results and residual limitations in
W2-result.md. Do not commit; parent integrates after review.

