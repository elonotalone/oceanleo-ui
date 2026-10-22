# Library stability: render owner result

Task identity: `render_luna_1022`  
Date: 2026-10-22

## Findings

1. `useVirtualList` scheduled a render whenever the visible window had any
   finite row measurement, even if `RowMetrics` already held that exact height.
   Its effect depends on `measureRow`; when a caller supplies an inline callback,
   each nonce render changes the callback identity, reruns the effect, and
   schedules another nonce. With an uncapped mounted reproduction React emitted
   repeated `Maximum update depth exceeded` warnings. The bounded reproduction
   failed before the fix at 4 renders against a 3-render ceiling. The hook now
   compares the incoming values with `RowMetrics` and increments the nonce only
   if at least one accepted measurement changes the ledger.

2. `DocumentShelfCover` completed its excerpt read and called `onReady`. The
   parent callback then cleared `failed` and `solidRejected`, which made
   `documentShelfCover` false and remounted the same primary thumbnail that had
   just failed. A mounted test confirmed one source fetch followed by the
   primary `<img>` reappearing. The fallback callback now only marks the
   fallback ready. Its rendered excerpt stays mounted, the failed primary is
   not retried, and the source is fetched once. `document-shelf-cover.tsx` did
   not need a code change; its completion state exposed the parent reset.

## Changes

- `src/lib/virtual/use-virtual-list.ts`: nonce updates are idempotent for
  already measured row heights.
- `src/shell/workspace-library-thumbnail.tsx`: document fallback readiness no
  longer clears the failed primary rendition state.
- `tests/library-render-stability-1022.test.mjs`: added mounted React
  reproductions for both cases, with a measurement fuse that keeps the
  pre-fix infinite loop bounded in the test worker.

No caller changes are required. The only in-repository `useVirtualList` caller
is `useVirtualGrid`, whose `measureRow` is already memoized. The hook still
needs to tolerate callback identity changes as part of its public contract.
Memoizing callers alone would not address repeated measurements after other
effect dependencies change. Replacing the existing virtualizer is unsupported
by this evidence: the defect is the unnecessary state update, and the existing
`RowMetrics` path remains covered by virtualization tests.

## Verification

Before the fix, the bounded inline-callback test failed with 4 renders (ceiling
3). Before the fallback fix, the mounted fallback test failed because the
primary image reappeared after its source excerpt became ready. After both
changes, the focused runtime run passed 26 tests with 0 failures:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/library-render-stability-1022.test.mjs tests/virtual-grid.test.mjs tests/library-virtualization.test.mjs tests/document-cover-runtime.test.mjs
```

No full suite, typecheck, browser check, slot rebuild, install, or deploy was
run. Parent owns combined validation; these remain the limits of this report.
