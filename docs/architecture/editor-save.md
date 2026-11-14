# Editor saving

Every user edit saves the editor's complete JSON working copy immediately with one authenticated PUT to `/v1/editor-working-copies/{root_id}`. There is no debounce, file build, preview, storage object, Library revision or session-pointer request in that path. One request runs at a time; edits arriving during it replace the queued document with the latest capture. The indicator shows Saving until the newest edit is acknowledged, Saved then, and Save failed with the reason on failure. Retry is 1, 2, 4…30 seconds and immediate when online. A sequence conflict requires reload; it never overwrites another tab.

Opening GETs the working copy, waits for the editor's recovery adapter to be ready and silently restores an unpublished newer copy. Recovery capture and restore operate on the editor's native document, including sidecars and media references. No IndexedDB editor recovery exists. Upload resumability may independently use IndexedDB.

## Publication and closing contract

A module-level background publisher builds Library revisions after 10 seconds without an acknowledged edit, on close, and before export/download/share/agent send/new conversation. Publishing never changes the working-copy indicator. Successful publication records its captured sequence with POST `/published`.

**`persistence.preparePublish()` synchronously captures the complete document and returns an asynchronous publication function.** That function must remain valid after unmount: retain JSON/media inputs, revision bookkeeping and auth/upload functions, never require a mounted canvas, DOM, iframe or live editor. Capture must happen before the UI tears down, including when an older publication is running. The publisher serializes publication and follows it with the latest prepared snapshot. `flush()` remains the existing public explicit publication gate. Editors whose flush already snapshots synchronously may omit preparePublish only when no earlier publication can make it return an older receipt. Publication callbacks must not resurrect a closed editor or replace a different open item.

Only the collaboration room's saver writes working copies and Library revisions. Other members rely on room acknowledgement.

## Latency and rejected designs

The previous stack deliberately waited 500 ms, uploaded a storage draft, recorded a second session pointer, waited another 1.5 seconds, built files/previews and published before showing Saved. Its minimum intentional wait alone exceeded the 500 ms requirement.

Each working-copy acknowledgement records `editor_save` telemetry: edit-to-ack milliseconds, sequence and whether it exceeded 500 ms; development also logs this measurement without document contents. Test at 150 ms simulated RTT: every edit must reach Saved within 500 ms. Gateway handling p95 must be at most 120 ms; S1 supplies Server-Timing. Real network acceptance remains parent verification against S1's gateway. Delays over 500 ms are defects, not hidden by locally claiming success.

Rejected: retaining storage drafts while changing the icon (storage plus two requests); IndexedDB-first Saved (the server has nothing); rendering delivery files server-side on every edit (renderers live in the browser). The remaining architecture is the working-copy saver, background publisher and indicator.

Reopening while the previous editor's PUT is still pending waits for that retained saver before GET, so the reopened editor does not display an older server copy as Saved. A failed previous drain remains a visible read failure and retries. Device-only destinations use the same acknowledgement state machine with a host-local transport: no working-copy HTTP, session marker, or Library publisher. Collaboration peers that are not the room's saver follow its existing Yjs sync barrier; only the saver writes working copies.

## Browser repair evidence (2026-11-15)

Timer and fetch calls keep their browser receiver. The saver lifetime follows the item/schema, not transient source readiness; a readiness change must not reset its sequence or resend an acknowledged edit. Observation happens in the layout effect, and a revision seen before its dirty flag is not consumed. The room saver observes remote Yjs document updates as well as its own editor revision. A non-writer tab with local changes shows conflict/reload: room-sync acknowledgement alone cannot claim that its document reached the working-copy endpoint.

`editor_save` now separates input-to-observation `render_ms`, wait behind the previous PUT `queue_ms`, `capture_ms`, `auth_ms`, JSON/UTF-8 `encode_ms`, `gzip_ms`, `request_ms`, and wire `bytes`. Coalesced edits retain the oldest unsent input time. Only scalar timings are logged. Slow saves can therefore be assigned to the correct phase without exposing document data.

Publication yields to queued input before preparing/building files. RichDoc DOCX conversion and preview rendering return control between approximately 8ms slices. These yields belong only to publication, never to the working-copy save path. The jsdom matrix measures each input against the first server acknowledgement containing that input; final-input-to-Saved is also measured separately for bursts.
