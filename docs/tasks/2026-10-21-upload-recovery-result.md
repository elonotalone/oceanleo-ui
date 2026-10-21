# Upload recovery implementation result

## Scope

Implemented the upload transport recovery slice and the taskbook's scoped
integration follow-up from `2026-10-21-upload-recovery.md`. No auth, MyLibrary,
artifact-client, editor, browser, live upload, production, or push changes were
made.

## Finding

The remaining failure path was in the shared upload transport: a lost response,
network failure, or transient gateway error ended the request immediately, with
no safe replay and no `retryable` signal for the Library caller. Replaying is
safe only when the request carries a stable idempotency identity. Backend
inspection confirmed private multipart uploads bind identity to content when
the caller key is absent, while the large-upload init/finalize flow uses the
same supplied identity across phases. The signed object-storage PUT is
single-use, so it is not replayed in place; a transient failure is returned as
retryable so a whole upload attempt can initialize again with the same key.

## Changes

- `src/lib/database.ts`: added upload-only bounded transient retry (up to three
  attempts), a single fresh-token retry after 401, abort-aware backoff, and
  explicit `retryable` classification. Retries preserve the selected private
  route, request body, and idempotency key; definitive 4xx errors are not
  replayed. Signed PUT is not automatically replayed. All upload-only status-0
  fallbacks now use file-upload service wording, including the large-upload
  init fallback. Generic non-upload `authed`/catalog AI-gateway copy is
  unchanged.
- `src/lib/upload/progress.ts`: distinguish timeout from explicit cancellation
  and status-0 network errors while preserving progress and abort behavior.
  `uploadFile` does not impose an arbitrary request timeout, so legitimate large
  transfers are not cut off.
- `tests/upload-recovery.test.mjs`: request-level tests for ambiguous fetch
  failure then success without duplicate registration, XHR 503 recovery,
  refreshed-token 401 recovery, bounded attempts, definitive 422, timeout, and
  abort; also assert large-upload init transport failures use file-upload
  wording.
- `tests/private-library-upload.test.mjs`: assert bounded 502 retries remain
  on the private endpoint and expose `retryable`.
- `tests/upload-progress.test.mjs`: complete the auth stub with `signUp` so the
  upload progress module graph can register its tests against the current auth
  exports; add the newly required `isLeoDevPreviewHost` config stub and assert
  the current `data-attachment-spinner` marker instead of the stale `v-spinner`
  class selector.
- `tests/upload-resume.test.mjs`: replace its `.json()`-only fake fetch response
  with a native `Response`, matching the upload transport's `response.text()`
  contract.
- `src/shell/AttachmentStrip.tsx`: accept the existing progress snapshot prop;
  display the shared `AttachmentProgressChip` for live snapshots and keep the
  existing spinner fallback when no progress was supplied. Existing disabled,
  remove, preview, and file-id behavior is unchanged.
- `src/shell/LeoComposer.tsx` and `src/shell/InputCard.tsx`: render the existing
  `UploadProgressList` from `useAttachmentIntake().inFlight`; rows disappear on
  either successful completion or failure.
- `tests/upload-progress.test.mjs`: fix current auth/config fixture exports and
  spinner marker, plus assert the mounted consumer removes its progress row on
  failure as well as completion.

## Verification

- Focused command previously run through `agent-io-guard run-light`:
  `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/upload-recovery.test.mjs tests/private-library-upload.test.mjs`
  — **10/10 passed** before the final error-copy and unused-timeout-plumbing
  cleanup. Those final edits do not change retry behavior. Parent's shared
  typecheck passed; parent independently reports recovery/private/idempotency
  and W13 digest tests passing.
- The final large-upload init wording assertion was added after that test run;
  it has not been rerun in this follow-up because bootstrap reported saturated
  I/O and parent owns the final regression run.
- `tests/upload-resume.test.mjs` via `run-light` — **12/12 passed** after the
  response fixture correction.
- `tests/upload-progress.test.mjs` via `run-light` — **15/19 passed**; its
  initial import/consumer failures revealed the missing upload feedback. After
  wiring the three taskbook-authorized shell components, the rerun passed
  **19/19**, including mounted progress, chip rendering, and completion/error
  cleanup.
- `git diff --check` on owned source/test files passed after the final edits.
- No full suite, typecheck, browser check, or live upload was run by this owner.
  Parent owns full typecheck and final integration verification; the earlier
  shared typecheck preceded the scoped TSX follow-up changes.

## Limits

All upload effects were simulated at the request boundary; no Library artifact
was created. Actual network retry behavior remains bounded by the server and
browser transport. The signed PUT itself is deliberately not replayed; the
caller must retry the upload with its same deterministic key to obtain a fresh
signed URL or discover that the object already completed.
