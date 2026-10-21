# W02 state — shared editor save

Date: 2026-10-22

## Facts

- Bootstrap completed successfully before task reads.
- `oceanleo-ui` is on `main`, clean at start, ahead 16; current HEAD is `32509307` (the repair ownership/acceptance record).
- Operator evidence names document `cf20e79f-ed64-43c0-b0d5-303663c9965d` as showing “save failed”. No failure has yet been reproduced in this session.
- `oceanleo-library --target dev list/get` resolves that ID to a 2,116-byte DOCX. Downloaded SHA-256 `0fdbf3a8…e9e8b1` matches the current `artifact_sources`/`source` rendition digest; DB head is revision `3d2b0210-4b5e-44ad-a522-d98ec33952f9`, type `document`, editability `native`, integrity `ready`.
- Parent’s bounded gateway access-log read for 2026-10-21 16:27–16:32 UTC found no upload, creation, or revision write; only two collab ticket POSTs returned 200. This establishes a pre-save-HTTP failure signature, not the exact browser-side cause.
- W02 owns shared save/persistence, doc I/O, artifact save/registration API and directly required artifact/draft routes. No editor implementation, chrome, converter, video, package/lock, or unrelated backend files.
- Parent explicitly added the hosted save/recovery handshake in `src/shell/advanced-routes/RichDocHostedRoute.tsx` and `src/shell/advanced-routes/EmbeddedRoute.tsx`, plus focused tests, to W02. W01 owns chrome; W03/W04 design/video adapters remain outside W02.
- Parent additionally authorized the shared save-gate helper `src/shell/advanced-routes/editor-handoff.ts` (additive API, preserve design/video compatibility).
- Parent owns shared typecheck and final independent dev acceptance; W02 will not duplicate typecheck.

## Current

Loaded the kernel, workstation instructions, `oceanleo`, `parallel-rollout`, and `architecture-debug` packs, task books, code map, typed-artifact-editing navigation slice, and the per-editor plan. The plan requires host persistence to use typed `save(revision)` and preserve artifact/revision identity. Existing save-contract, revision-integrity, autosave-controller, session-registration, and Umo migration focused tests pass when run with the repository’s TypeScript loader (53/53).

The Umo bridge source is configured to answer each host `recovery-capture` synchronously with `editorRef.getJSON()` wrapped in a revisioned `recovery-snapshot`; it emits `ok:false` with an explicit message when editor JSON is unavailable. Umo's native Save uses a `umo-save-*` request ID and waits for a host `save-result`; its waiter times out after 15 seconds if not settled. No actual browser-side Umo error has been captured, so the screenshot cause is still unconfirmed. Concrete host defects: `RichDocHostedRoute` clears the whole capture map on every newer `dirty` event, including an in-flight save-gate request, and handles only successful `recovery-snapshot` messages. A valid old save capture can lose correlation; explicit negative snapshots are ignored and never settled. These paths are consistent with the observed pre-HTTP log signature, but are not yet attributed to the screenshot.

The route harness exercises a loaded inline source and checks `event.source`, exact origin, protocol and instance before delivering messages. The first race regression reproduced the route defect: `dirty(1) → flush/save-1 capture → dirty(2) → latest cache capture → delayed valid save-1 snapshot` ended with `hosted save timeout` and no durable producer call because the dirty handler erased save-1's correlation. A later independent V01 probe found a second ABA race: A's cache ID `rd-cache-${instanceId}-1` was reused by B after item switch and generation reset, so A's late same-revision payload was persisted as B. Both have route-level runtime reproductions, not browser captures. After repair, a bounded host-scoped request ID (item-scope epoch + capture sequence) is used for cache, draft and host save captures. The first race now persists/reopens the latest generation, native Umo save settles only after the latest receipt, and the second race ignores the old A request. Explicit `ok:false`, stale revision, mismatched revision/retry, no-overlap flush, foreign origin/source/instance, document switch and unmount cancellation are covered by the focused suite (13/13 pass).


Reran `/opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh` after the route change. All UI/embed/origin and other non-backend checks passed; the same two unrelated backend UC-5 checks remain red (RLS/quota hardening and live security-definer grant surface). The untrusted-content contract and regression matrix were read before editing; the matrix is already dirty from unrelated work and was not edited. Exact source/origin/instance/protocol validation remains closed. Parent auth review confirms only Supabase user bearer auth reaches revision-write routes; the Library machine token is limited to list/upload/download. Parent owns isolated dev acceptance; no operator artifact is to be written.

The durable producer is still the existing `persistUmoPayload → saveFileToLibrary → createArtifactRevision` path, not a new upload shortcut. The minimal valid 28px-bold Tiptap fixture was run through `convertUmoToRichDoc` and returned `ok:true`, schema `tiptap-json@1`, version 1, with marks preserved. Parent's isolated real-storage acceptance passed on a private synthetic DOCX: native DOCX + manifest content reread (text and bold 28px), same-root new head, same-request idempotency, and distinct stale expected-head `409`. Scope was machine HTTP create/download plus in-process revision write under verified owner identity—not browser-auth end-to-end. No user session was copied or auth expanded. Original screenshot attribution remains unconfirmed because historical gateway evidence is pre-save-HTTP only.

## Next

Shared typecheck and isolated real-storage acceptance are complete under parent ownership. This follow-up's focused suite and post-change security gate are complete; the W02 route code remains on `main` in its dedicated commits. No operator artifact was modified.

## Cross-document correlation follow-up

- V01's independent runtime probe reproduced an ABA collision: the route iframe `instanceId` survives an item switch, generation resets, and `rd-cache-${instanceId}-${generation}` was reused for A/revision 1 and B/revision 1. A delayed A snapshot could therefore satisfy B's newly registered cache capture and be persisted as B.
- W02 changed host request IDs to include a per-route item-scope epoch plus monotonic per-capture sequence for cache, draft, and save-gate captures. The epoch advances synchronously when `handoffItemKey(item)` changes, before the scope-reset effect; this distinguishes A→B and A→B→A even when editor revisions repeat. Origin/source/protocol/instance validation is unchanged.
- New route runtime test: `RichDoc ignores a late cache snapshot from the prior document when generation resets`. It proves B still requests its own save capture and that the only persisted item/payload is B. V01 independently reran the original route-level repro with no edits: A ID `rd-cache-rd-mvif1kq4-3nb0mf-0-1-1`, B ID `rd-cache-rd-mvif1kq4-3nb0mf-1-1-2`; delayed A response was ignored, and flush returned `{ok:true}` with only `document-B` + `B-payload` persisted.
- Full focused route suite after follow-up: 13/13 pass. Post-edit security gate retained all UI/embed passes and the same two preexisting backend UC-5 failures.
