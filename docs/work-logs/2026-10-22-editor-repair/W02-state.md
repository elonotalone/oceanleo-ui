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

The Umo bridge source is configured to answer each host `recovery-capture` synchronously with `editorRef.getJSON()` wrapped in a revisioned `recovery-snapshot`; its bridge rejects missing editor JSON with an explicit failure message. No actual browser-side Umo error has been captured, so the screenshot cause is still unconfirmed. A concrete host defect is identified for a runtime regression: `RichDocHostedRoute` clears the whole capture map on every newer `dirty` event, including any in-flight save-gate request. A valid earlier snapshot can therefore lose correlation before persistence starts; the same handler also discards valid `ok:false` snapshots. Both paths match the observed pre-HTTP log signature, but neither is yet attributed to the screenshot.

## Next

Turn the pre-network Umo save signature into a runnable race regression; carry a save through to the latest generation instead of dropping its capture, then verify valid snapshot → durable typed revision/reopen plus conflict/retry controls. Do not mutate the operator’s original Library item.
