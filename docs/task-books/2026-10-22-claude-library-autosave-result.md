# Library automatic save result (claude_autosave_1022)

## Causes (evidence from code + runtime tests)
1. Toast `N changes still not saved` + Retry: `advanced-background-saver.ts` `finish()` marked a handed-off job "failed" once the controller stopped retrying; controllers gave up after 3 attempts (1.5/4/9 s, background 5/10/15 s) into a manual-only `error`, and `advanced-background-save-notice.ts` rendered the count with a Retry button (`retryAllFailed`). Transient failures (network, 5xx, session CAS) therefore became a user chore. Now: no retry cap, capped backoff 1.5/4/9/20/30 s (background 5/10/15/30/60 s) for the page lifetime, saver re-arms its own capped retry if a caller-capped controller gives up, nudges on `online`, tab visible and auth-state events. Toast shows only for failures retrying cannot fix, without a button.
2. Previous owner's `this.version = input.revision` for restored server drafts (draft controller) was wrong: a gate flush (`flushLatest`) then saw "already published" and published nothing (broke `e9-draft-hook-runtime` #13/#21). Reverted; the `autosaveEligible` flag alone keeps restored/hydration state out of "unconfirmed work".
3. Yellow ~10 s on a tiny Umo edit (not reproducible without the live app; derived from the code path): when no workspace session exists yet (`draftEnabled` needs `session.sessionId`, and an in-flight legacy save keeps the legacy tier) the Umo edit takes the full-version path: 500 ms debounce, then serially in `persistUmoPayload`/`doc-io.ts`: project JSON upload, delivery docx build + upload, cover render + upload, then backend `save_revision` (~4.5 s measured by parent) and the session record. State is "saving" for all of it. With a session (draft tier) saved turns at 400 ms + draft upload. Client changes: docx build and cover render now start at the top of `persistUmoPayload` and overlap the project upload (docx build alone is 40-260 ms in node: 262/104/41 ms cold/warm; cover render cannot run in node, no canvas, browser time unmeasured); idempotency key was `Date.now()`-based so an automatic retry after a lost response would publish a duplicate, now `umo:<baseRevision>:<content fingerprint>` so retries replay (backend replay 1.2 s vs 4.5 s). The remaining big term is backend `save_revision` (other owner) plus the serial upload ordering inside `doc-io.ts` (not mine, see below).
4. No artificial minimum yellow time exists anywhere in the cluster (tests assert `saved` at exactly the debounce: 500 ms legacy, 400 ms draft tier).

## Changed files
- `src/shell/advanced-persistence-controller.ts` (reviewed/kept previous edits; infinite retries, new delays, `failure` in snapshot, `nudge()`, `now` option, auth classification `describePersistenceFailure`)
- `src/shell/advanced-draft-controller.ts` (same, plus revert of the bad `version` shortcut; version failure is not cleared by a later draft success)
- `src/shell/advanced-autosave-nudge.ts` (new: online / visible / auth-state subscription)
- `src/shell/advanced-background-saver.ts` (permanent vs transient jobs, own capped retry, nudges, `reason: "auth" | "blocked"`, notice view gets `auth` count)
- `src/shell/advanced-background-save-notice.ts` (no button, two messages)
- `src/shell/use-advanced-autosave.ts` (mounted controllers subscribe to nudges)
- `src/shell/advanced-routes/richdoc-pro-source.ts` (overlap + stable idempotency key)
- `src/i18n/ui/messages/eas-w14-copy.ts` (old unsaved/retry keys removed; two new keys, all 17 locales)
- tests: new `tests/library-automatic-save-1022.test.mjs`; updated `tests/e6-autosave-draft-tier.test.mjs`, `tests/eas-w14-leave-nonblocking.test.mjs` (user-edit simulated, auto-recovery instead of Retry), `tests/advanced-native-editors.test.mjs`.
`RichDocHostedRoute.tsx` unchanged (its flush already reuses the cached snapshot, serializes passes by generation).

## Commands (run-light, guard) and results
- new + controller/retry/user-edit: `advanced-persistence-controller, W2-persistence-retry, W2-20261021-user-edit-gate, library-automatic-save-1022` 35/35 pass (new file 14/14).
- `e9-draft-hook-runtime, e6-draft-hook-runtime, e6-autosave-draft-tier, W3-r3-library-receiver-collab-triggers`: 37 pass, 1 fail (W3-r3 file fails to load: `ModuleBenchError` import cycle `material-library-standalone.tsx` <-> `MaterialLibrary`/`ResultCanvas`, outside my files).
- `eas-w14-leave-nonblocking, advanced-native-editors`: 11/11. Earlier batch: `advanced-autosave-hook-runtime, W2-20261021-autosave-hook` pass; `inline-advanced-leave-flush, inline-mounted-leave-runtime` pass; `eas-w18-richdoc-handoff, e9-hosted-draft-runtime, advanced-recovery-hook-runtime, library-autosave-registration` 30/30; `d4-r7-library-background-restore, rich-doc-hosted-pro-toolbar, advanced-project-autosave` pass; `hosted-editor-iframe-sandbox-render, w10-r4-editor-html-hosted, advanced-autosave-error-message, b16-read-failure-no-blank` 16/16; `d4-inline-shell-page-feedback, plugin-chrome-save-menu, W1-richdoc-image-empty-admission, p4-working-document` 16/16.
- `rich-doc-core-swap, W1-richdoc-source-import, rich-doc-hosted-review, library-richdoc-project-reopen`: 46/47; the one failure (`#18 jsdom 挂上 RichDocRoute`) is a stub in the test missing the export `cacheableRenditionTwin` (other owner's code), not these files.
- `pnpm typecheck` via run-heavy: no errors (tsc exit clean).
- Not run: `one-task-library-*` acceptance tests (heavy; they reference the saver), full suite.

## Timing numbers (fake clock, in tests)
Legacy tier: edit -> saved at 500 ms, one write, none later. Draft tier: saved at 400 ms, one version at 20.4 s. Retry delays measured 500, 1.5, 4, 9, 20, 30, 30 s then continues. Online nudge skips the wait (rate limit 1 s). Before: retries ended after 14.9 s into manual error.

## Uncertain / not verifiable here
- Real browser timing of cover render/upload and the true split of the 10 s (no browser allowed, no live gateway): conclusion 3 is code-derived.
- A flush whose scope was switched (`文档已关闭或切换`) is classed transient and would retry forever at 30-60 s; harmless but not ideal.

## Parent must / may change (files I do not own)
- `src/shell/doc-editors/doc-io.ts` `saveFileToLibraryWithDependencies`: project upload, delivery upload and cover upload are serial; the three uploads are independent and could run with `Promise.all` (saves two upload round-trips on the critical path). Not done (not my file).
- `AdvancedWorkspaceActionBar.tsx` still shows "保存失败，点击重试" and an `onRetrySave` for the mounted `error` state (only permanent failures reach it now); left as is.
- Callers using `maxRetries: 0` keep working; the saver now retries for them.
