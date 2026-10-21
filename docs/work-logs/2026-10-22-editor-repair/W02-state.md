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

The route harness exercises a loaded inline source and checks `event.source`, exact origin, protocol and instance before delivering messages. The first race regression reproduced the route defect: `dirty(1) → flush/save-1 capture → dirty(2) → latest cache capture → delayed valid save-1 snapshot` ended with `hosted save timeout` and no durable producer call because the dirty handler erased save-1's correlation. This is a code-level reproduction, not a browser capture. After the route repair, that sequence now persists/reopens the latest generation; the Umo native-save race likewise settles the original `umo-save-*` waiter only after the latest receipt. Explicit `ok:false`, stale revision, mismatched revision/retry, no-overlap flush, foreign origin/source/instance, document switch and unmount cancellation are covered by the focused suite (12/12 pass).


Reran `/opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh` after the route change. All UI/embed/origin and other non-backend checks passed; the same two unrelated backend UC-5 checks remain red (RLS/quota hardening and live security-definer grant surface). The untrusted-content contract and regression matrix were read before editing; the matrix is already dirty from unrelated work and was not edited. Exact source/origin/instance/protocol validation remains closed. Parent auth review confirms only Supabase user bearer auth reaches revision-write routes; the Library machine token is limited to list/upload/download. Parent owns isolated dev acceptance; no operator artifact is to be written.

The durable producer is still the existing `persistUmoPayload → saveFileToLibrary → createArtifactRevision` path, not a new upload shortcut. For acceptance, the minimal valid 28px-bold Tiptap fixture was run through `convertUmoToRichDoc` and returned `ok:true`, schema `tiptap-json@1`, version 1, with the marks preserved. Parent owns real dev receipt/reopen checks under existing auth; no browser login/session or auth expansion is in scope. Original screenshot attribution remains unconfirmed because the only production-like evidence is the pre-save-HTTP signature.

## Next

Parent is running isolated dev request/reopen acceptance using the production producer/auth contract; do not mutate the operator's original Library item or broaden machine-token auth. Shared typecheck/final dev acceptance remain parent-owned. W02's route code and focused tests are complete pending that independent durable-storage evidence.
