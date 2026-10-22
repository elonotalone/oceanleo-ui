# W05 delivery — Deck single mode

## Changed
- Edited `src/shell/advanced-routes/DeckRoute.tsx`: now one native DeckStage route. Removed the flag dispatch (`resolveEditorCore`), lazy `DeckHostedRoute`, `PluginModeSwitchGate`/`usePluginMode`/`useModeSwitchReady`, `editor-handoff` (pro handoff binding, `useProSavedRevision`), `deckDocumentToPptist` use, the `mode` adapter and `pages: { proLabel: "PPTist" }`. No Pro page, no tabs.
- Deleted (git rm): `advanced-routes/DeckHostedRoute.tsx`, `DeckHostedContextToolbar.tsx`, `deck-hosted-save.ts`, `deck-hosted-selection-command.ts`.
- Kept `doc-editors/deck-pptist-carrier.ts`: its header documents it as a clean-room re-description of the public data format (field names only); no PPTist/AGPL code, no PPTist import. It is still the reader for stored PPTist-format decks (`advanced-draft-deck.ts`, `deck-aippt-schema.ts`). Stored decks open as before; nothing rewritten.
- Added `tests/deck-single-mode.test.mjs` (regression: DeckRoute has no hosted import / mode gate / proLabel / mode adapter; hosted files absent; carrier has no PPTist import).

## Tests deleted (all asserted only the removed hosted/Pro behavior)
d1-r4-deck-open-receipt-gate, g4-deck-hosted-reparse, d1-deck-open-receipt, d1-r4-deck-early-entry, deck-hosted-selection-origin, eas-w17-deck-handoff, d1-r5-deck-persistence (saveHostedDeck), deck-core-swap, deck-hosted-user-edit-session, editor-repair-acceptance-deck-hosted, W6-r2-commands-hosted-deck, W6-r3-hosted-deck-toolbar (.test.mjs), W5-20261021-hosted-deck-person-edit.mjs.

## Verification
- Focused run (run-heavy, node test runner) over all `tests/*deck*.test.mjs` + collab-deck-adapter + library-ppt-late-save-bounce + deck-single-mode: 254 tests, 249 pass, 4 fail.
  The 4 failures (`deck-delivery-family` file, and 3 in `deck-html-action`: "下载与收藏…", "下载在跑的时候…") mount `ArtifactActions.tsx` and do not touch any file I changed ("下载必须还在"). Not verified whether they fail on a clean HEAD; likely other owners' in-flight edits or pre-existing. Parent to check.
- `npx tsc --noEmit -p .`: no errors in my files. Remaining deck-related error: `src/shell/w10-editor-mounts.ts(161)` imports deleted `DeckHostedRoute`.

## Cross-owner requests
- W01: `src/shell/w10-editor-mounts.ts` (deck entry lines ~154-161 and `deckDocumentToPptist` import) must drop the deck hosted mount; `src/shell/editor-core-flags.ts` remove `deck` from the core-swap table (line ~73, ~176); `plugin-mode-store.ts` pro allowlist excludes deck.
- W01/parent: `src/client-editor-adapters/registry.ts:78` reason string mentions DeckHostedRoute; `src/shell/advanced-routes/RichDocHostedRoute.tsx:130` comment mentions it; `hosted-editor-origins.ts`, `hosted-local-origin.ts`, `editor-sandbox-origin.ts`, `advanced-background-saver.ts`, `hosted-editor/index.ts` still have PPTist/slides-origin plumbing.
- Tests not mine that still reference deleted files (will fail/need update): advanced-workbench-reachability, b16-read-failure-no-blank, hosted-editor-iframe-sandbox-render, hosted-family-embed-origin, w10-loopback-embed-trust, w10-hosted-local-origin, w10-r4-editor-html-hosted, p4-working-document, w10-r2-ui-offline, w10-agpl-boundary (check), `editor-repair-20261021-acceptance-remaining-autosave.mjs` ("hosted deck" case). `d1-r4-deck-handoff-readiness`, `g4-deck-expiry-handoff`, `library-ppt-late-save-bounce` test `editor-handoff.ts` (shared infra; pass today) — delete with that module if W01 removes it.
- Public barrels: none reference deleted deck files that I found (grep of src/index.ts, src/shell/index.ts not exhaustive; run `npm run api:check`).

## package.json
None.

## Limitations
- `editor.persistInBackground` in use-deck-editor is now unused by DeckRoute (still used by editor internals/tests; not removed).
- `deckDocumentToPptist` writer is now unused in production code except w10-editor-mounts (to be removed by W01); keep for carrier tests or delete later.
