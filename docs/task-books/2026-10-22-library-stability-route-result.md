# Library stability route: verification result

## Cause

Opening a Library item writes its artifact and entry identity into the current URL. The close handlers only cleared component state: `WorkspaceLibrary` reset its selected entry, while `MyLibrary` cleared the standalone editor item. Neither cleared the URL identity, so a remount could restore the item after the grid was visible.

## Preserved fix

`library-current-identity.ts` now has one canonical clear operation. It removes `item`, `entry`, and preview `mode` through the existing identity writer, preserving unrelated query parameters, pathname, fragment, and the current history state. `WorkspaceLibrary` uses it on preview Back and marks route restoration as applied; `MyLibrary` uses it when the standalone editor closes and clears any preview intent. This continues through the existing `SiteCatalogConsole` writer (`router.replace`) rather than adding a router.

## Runtime evidence

- A DOM-mounted `WorkspaceLibrary` opened from `?item=item-x&entry=artifact%3Aitem-x&mode=preview&q=flowers&type=image#shelf` returns to the grid with `?q=flowers&type=image#shelf`; the history state remains unchanged. A fresh component mount stays on the grid and does not restore the item.
- A DOM-mounted `MyLibrary` editor clears item-specific URL state on close. A queued late save receipt does not reopen the editor or restore the closed route.
- Existing different-identity navigation cases continue opening X while the prior identity is Y, including after list refresh and late saves.
- The helper-level history test confirms the canonical writer receives the cleaned URL while preserving the router state object and fragment.

## Focused verification

Both commands ran through `agent-io-guard.sh run-light`; no browser or full suite was used.

```text
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/library-close-url-1022.test.mjs tests/library-open-intent-not-swallowed.test.mjs tests/library-ppt-late-save-bounce.test.mjs tests/library-stability.test.mjs
40 tests passed, 0 failed

node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/catalog-preview-deeplink.test.mjs tests/library-preview-landing.test.mjs tests/f3-open-material-keeps-tab.test.mjs tests/site-catalog-controlled-value.test.mjs
42 tests passed, 0 failed
```

The route behavior was verified in the DOM test harness and existing route tests; browser-level Back/Forward interaction was not exercised. `pnpm typecheck` and combined regressions remain with the parent per the task boundary.
