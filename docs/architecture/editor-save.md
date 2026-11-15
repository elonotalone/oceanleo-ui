# Editor saving

Every user edit saves the editor's complete JSON working copy immediately with one authenticated PUT to `/v1/editor-working-copies/{root_id}`. There is no debounce, file build, preview, storage object, Library revision or session-pointer request in that path. One request runs at a time; edits arriving during it replace the queued document with the latest capture. The indicator shows Saving until the newest edit is acknowledged, Saved then, and Save failed with the reason on failure. Retry is 1, 2, 4…30 seconds and immediate when online. A sequence conflict requires reload; it never overwrites another tab.

Opening GETs the working copy, waits for the editor's recovery adapter to be ready and silently restores an unpublished newer copy. Recovery capture and restore operate on the editor's native document, including sidecars and media references. No IndexedDB editor recovery exists. Upload resumability may independently use IndexedDB.

## Publication and closing contract

A module-level background publisher builds Library revisions after 10 seconds without an acknowledged edit, on close, and before export/download/share/agent send/new conversation. Publishing never changes the working-copy indicator. Successful publication records its captured sequence with POST `/published`.

**`persistence.preparePublish()` synchronously captures the complete document and returns an asynchronous publication function.** That function must remain valid after unmount: retain JSON/media inputs, revision bookkeeping and auth/upload functions, never require a mounted canvas, DOM, iframe or live editor. Capture must happen before the UI tears down, including when an older publication is running. The publisher serializes publication and follows it with the latest prepared snapshot. `flush()` remains the existing public explicit publication gate. Editors whose flush already snapshots synchronously may omit preparePublish only when no earlier publication can make it return an older receipt. Publication callbacks must not resurrect a closed editor or replace a different open item.

Every editable collaboration tab owns its saver and publishes its current merged document. Existing viewer permissions and whole-document edit locks still apply. Saved means this tab's latest state, including merged remote updates, received a working-copy acknowledgement; room synchronization alone cannot supply it.

## Latency and rejected designs

The previous stack deliberately waited 500 ms, uploaded a storage draft, recorded a second session pointer, waited another 1.5 seconds, built files/previews and published before showing Saved. Its minimum intentional wait alone exceeded the 500 ms requirement.

Each working-copy acknowledgement records `editor_save` telemetry: edit-to-ack milliseconds, sequence and whether it exceeded 500 ms; development also logs this measurement without document contents. Test at 150 ms simulated RTT: every edit must reach Saved within 500 ms. Gateway handling p95 must be at most 120 ms; S1 supplies Server-Timing. Real network acceptance remains parent verification against S1's gateway. Delays over 500 ms are defects, not hidden by locally claiming success.

Rejected: retaining storage drafts while changing the icon (storage plus two requests); IndexedDB-first Saved (the server has nothing); rendering delivery files server-side on every edit (renderers live in the browser). The remaining architecture is the working-copy saver, background publisher and indicator.

Reopening while the previous editor's PUT is still pending waits for that retained saver before GET, so the reopened editor does not display an older server copy as Saved. A failed previous drain remains a visible read failure and retries. Device-only destinations use the same acknowledgement state machine with a host-local transport: no working-copy HTTP, session marker, or Library publisher. All editable room tabs save independently. The former elected-writer state, non-writer conflict fallback and Yjs acknowledgement barrier are removed.

## Browser repair evidence (2026-11-15)

Timer and fetch calls keep their browser receiver. The saver lifetime follows the item/schema, not transient source readiness; a readiness change must not reset its sequence or resend an acknowledged edit. Observation happens in the layout effect, and a revision seen before its dirty flag is not consumed. Each room tab observes both local and merged remote Yjs document updates, including edits that lack a separate mutation-feed notification. Source seeding and restore echoes are excluded from new edits.

`editor_save` now separates input-to-observation `render_ms`, wait behind the previous PUT `queue_ms`, `capture_ms`, `auth_ms`, JSON/UTF-8 `encode_ms`, `gzip_ms`, `request_ms`, and wire `bytes`. Coalesced edits retain the oldest unsent input time. Only scalar timings are logged. Slow saves can therefore be assigned to the correct phase without exposing document data.

Publication yields to queued input before preparing/building files. RichDoc DOCX conversion and preview rendering return control between approximately 8ms slices. These yields belong only to publication, never to the working-copy save path. The jsdom matrix measures each input against the first server acknowledgement containing that input; final-input-to-Saved is also measured separately for bursts.

Opening completes the GET/restore handshake before consuming model revisions as edits. Hydration dirtiness and initial room seeding never compete with the copy being opened. The first subsequent PUT uses the GET receipt's sequence. A genuine local input while that GET is pending stays unsaved; an unpublished existing copy produces a conflict rather than overwriting that input. Adapter identity/schema does not depend on room election messages.

Authentication reads the shared auth-state-updated in-memory token first. Only a cold cache or a token rejected with 401 invokes the SDK session lookup. Refresh/sign-out changes are read on every request; no second token store or persistence layer exists.

## Collaboration tabs (parent decision, 2026-11-15 09:18 CST)

Room documents merge through the existing editor adapter. A stale working-copy PUT in an active room reads only the latest sequence, then captures and PUTs the current merged model again; it never restores stale server JSON over that model. Each pending save gets at most three PUT attempts (two sequence refreshes), then a visible conflict with reload. Network/authentication failures retain the ordinary backoff. Schema mismatch is a conflict. Outside rooms a stale PUT still conflicts immediately. No retry timer, new persistence tier or additional acknowledgement protocol is introduced.
