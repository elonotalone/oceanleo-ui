# Library stability — implementation journal

Date: 2026-10-21

## Result

Implemented the Library stability repair in the assigned Library/auth scope. The confirmed refresh-lock failure was that any error thrown from the lock callback was treated like acquisition failure, which could steal another tab's lock and replay token refresh. Same-user token refresh also reset the Library surface. The data API itself was healthy: read-only dev verification showed the Library backend returning many distinct files.

The refresh lock now distinguishes lock acquisition from callback execution. Busy/aborted acquisitions throw Supabase's compatible `NavigatorLockAcquireTimeoutError`; refresh callback errors propagate unchanged, and no path steals or reruns the callback. Auth events carry the resolved user ID when available. Same-user refreshes leave list/editor state mounted; sign-out or a verified user switch clears that user's cache/editor. A missing identity snapshot is not treated as proof of sign-out.

Library refresh failures now keep owner-verified usable state for the same account on retryable transport failures and refresh-time 401s, while real authority loss/account changes still clear it. An auxiliary/detail-only error with a usable list is shown as a compact status, not a red cold-load failure. Category fallback data is not accepted as a successful list snapshot.

Integration follow-up: later favorites pages now distinguish a failed request from a successful response that proves the page belongs to a different owner. The latter clears only the favorite items/cursor and rejects the merge; the independently verified owned list remains visible. Retryable favorite transport failures continue to preserve the same-owner favorite cache. The regression now includes a valid owned row to guard that boundary.

Favorite, time, and size sorting now use the complete owned and favorite result sets. Pagination is bounded and cancellable and rejects owner/total changes, discontinuous cursors, duplicate artifact identities, and early termination rather than sorting a partial/deduplicated subset. Source-size ordering uses original/source/upload metadata and rendition source bytes, never thumbnail bytes. The selected sort survives same-account refreshes; account boundaries reset it. Both Library search placeholders are exactly `search`.

Selecting a read-only preview now starts the matching registered editor-route preload and source prefetch before Edit is clicked. The preview path remains read-only; the mounted test observes no `ensureArtifact` call. This removes the route-loader/source-prefetch start from the first-edit critical path; no browser latency was measured or claimed, and the editor's fresh durable revision validation remains intact.

MyLibrary now exposes retry for upload results explicitly marked retryable. The retry carries the same `File`, private-upload flag, and deterministic idempotency key. Transport retryability behavior is being implemented in the separately owned upload transport scope; the Library call-site contract is covered with a focused mock.

## Approach choice

- Auth: retain cross-tab Web Locks because token rotation must stay serialized. The old catch-and-steal/replay behavior is rejected; removing locking would reintroduce concurrent refreshes. The chosen fix only converts acquisition timeout/abort into the SDK's recognized timeout error and lets operation failures pass through.
- Sorting: a backend global-sort API would require expanding the server contract. Sorting only the first page is incorrect. The chosen client path hydrates all pages under explicit row/page bounds, validates stable pagination and identity, and only then replaces the visible set.
- Cache/error UX: hiding every error would conceal real sign-out and cold-load failures. The chosen path retains data only when the current/last verified principal is still the same or identity cannot be established during a retryable failure; confirmed authority loss still clears state.
- Preview/editor: delaying all editor setup until Edit preserves work but adds two serial waits on first edit. The chosen preview-time preload starts the typed route and matching source read in advance without invoking mutation/fork operations.

## Files in this ownership slice

- `src/lib/auth/client.ts`
- `src/lib/auth/refresh-lock.ts`
- `src/shell/MyLibrary.tsx`
- `src/shell/LibraryLayout.tsx`
- `src/shell/WorkspaceLibrary.tsx`
- `src/shell/artifact-client.ts`
- `src/shell/collection-chrome.tsx`
- `src/shell/library-data.ts`
- `tests/artifact-surface-rendered.test.mjs` (auth mock compatibility and favorite owner-boundary regression)
- `tests/library-preview-landing.test.mjs` (read-only preview callback assertion)
- `tests/library-virtualization.test.mjs` (auth event/snapshot exports in the mounted fixture)
- `tests/library-stability.test.mjs`

No production/dev backend writes, browser automation, installs, commits, or pushes were performed by this owner.

## Verification

`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/library-stability.test.mjs` — **22/22 passed**. Coverage includes callback error propagation/no lock steal or replay, SDK-compatible lock acquisition timeout, serial refreshes, same-user refresh and account isolation, transient 503 and detail-only failure UX, preview-time route/source preloading before Edit with no ensure mutation, private upload retry identity, >100-row sorting, source-vs-thumbnail bytes, same-account sort preservation, duplicate/early pagination rejection, and exact search placeholders.

Targeted integration cases passed with the repository's test loader: `favorites pagination fails closed when a later page changes owner` (clears old favorites, preserves owned row), `预览落点只走 GET，绝不在挂载时 fork` (updated for the explicit identity reconciler), and `素材库 legacy：一次只拉一页 60 行（不再是 500），网格同样窗口化` (fixture exports the auth event and identity snapshot used by nested MyLibrary). The virtualization case was rerun after adding its missing auth-event export.

The existing rendered Library/auth/upload regressions and full typecheck were left to the parent integration run after the host reported high I/O pressure. No browser performance measurement was attempted.
