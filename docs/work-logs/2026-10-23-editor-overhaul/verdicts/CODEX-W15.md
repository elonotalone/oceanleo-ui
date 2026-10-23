# W15 — Codex iteration completion

## Implemented

- `oceanleo` aee0bb6: authenticated short `POST /v1/game-generate/{artifact}/iterations` (202), owner-bound latest/status/result GETs, durable receipt ledger on the gateway's persistent `/app/.runtime` bind mount. SQLite file mode 0600; transaction-serialized deterministic owner/artifact/base/payload claims across workers. Repeating a lost submission response does not invoke the paid chain again. Same-artifact concurrent work is rejected; global16/per-owner2 active limits,30minute worker deadline and31minute client confirmation budget.
- Existing generation model, moderation chain, payer binding, per-token billing and artifact CAS are reused, not replaced. The child task inherits the validated payer ContextVar. No credentials, provider keys or session tokens are persisted in receipts. Prompt contents remain private. A brief no longer renames the Library item; explicit `title` remains supported.
- Client exchanges have a15second request timeout; transient transport errors retry the same receipt, not a fresh generation. POST capacity rejection immediately explains the limit. Only a validated new saved revision reports success. Completed status refreshes signed renditions; provenance can repair a commit→receipt crash gap without regenerating, even after a subsequent head change.
- Closing/unmounting cancels browser polling, not paid server work. Reopening is GET-only. Only a runner that explicitly opts into `supportsResume` receives resume requests; legacy site runners cannot accidentally generate on open. `oceanleo-ui` efe3fd97 extracts the subscribed registration slot so late registration and route HMR do not leave the mounted editor unaware of the runner.419721dd fixes StrictMode effect replay aborting the first lookup before fetch while its already-set marker incorrectly suppressed the replay.
- Progress/reconnect notices have all16 non-simplified-Chinese locales. No CORS/cookie/sandbox/origin change, no production/twin push, no operator-account writes.

## Focused evidence

- `oceanleo/backend`:13 tests passed (`test_game_iteration_jobs.py` + `test_game_iteration_preflight.py`), including cross-worker atomic claim, owner isolation,0600 permissions, claimant fencing, per-owner/global capacity, expiry without replay, preflight failure before registration, early receipt before completion, inherited org payer, title preservation/explicit rename, failure without recharge, cancellation, actual overall deadline cancellation, exact saved revision recovery and refreshed rendition projection. Parent independently reran the earlier12/12; the extra deadline case also passes locally.
- `oceanleo`:9 client tests passed, including identical POST retry after a lost response, simulated elapsed time beyond180seconds, GET-only reload, abort without server cancel, unconfirmed result and immediate capacity errors. Parent independently reran9/9.
- `oceanleo-ui`: game-main-site20/20 (includes resume-only open, unmount abort, late registration and StrictMode), game-core-swap10/10 and draft-upload-key4/4 passed. The StrictMode async-runner regression first failed with0 surviving lookups vs expected1, then passed after the fix. i18n focused structure/coverage4/4 passed. Parent owns global typecheck/suite and slot freshness.

## Real dev acceptance — acceptance account only

Root `53931dfb-8ef2-4fb5-9db8-d88d98b990bf`, owner `2ffeef37-102a-431b-b2c2-51c5675dba79`.

| Task | Base | Confirmed saved revision | Ordinal | Real generation duration |
| --- | --- | --- | --- | --- |
| `game-iter-842a1444042aef67c747151c149227b9e3a2817daeef9dccd81f308e68a0f35b` | `b53d86a1-2938-458d-8732-0ad8852e858d` | `90437d4b-d1ea-4356-85a9-83401c8ecbf9` |9|about51s|
| `game-iter-940d151d384c5bb8bfd357903aa405b3bf0856a1a6d09af0c479658564aa1c78` | `90437d4b-d1ea-4356-85a9-83401c8ecbf9` | `41a99871-3b76-4062-be20-6f467cd5c5fa` |10|about80s|

Independent SQL joins roots/revisions/provenance and verifies each exact job saved once, current head ordinal10, and both titles remain `背景改成深蓝色。`. Second short POST202 is captured in `/tmp/codex-w15-job/codex-iteration-job.log`. Both server tasks completed after their initiating browser process had closed.

`bash harness/mint.sh | python3 evidence/W15/scenarios/codex-job-status.py` independently passed: authenticated latest GET and exact940d status GET both return200/succeeded, revision41a998 and preserved title; the same job under a different artifact locator returns404. This check sends no POST and logs no token or signed rendition URL.

Acceptance execution error: restarting the initial browser harness caused two **different-base** generation submissions, not one. The first process had already submitted just before termination although an earlier ledger check found no file. The initial “no submission” inference was withdrawn. No third submission was made. The scene now defaults to GET-only resume; generation requires an explicit `submit` argument. No evidence claims these two tasks are one idempotent retry.

Initial reopen acceptance did not observe a latest lookup although current modules were served. Code review exposed an unsubscribed registration race and added its regression test. That alone did not resolve the browser symptom. A subsequent read-only fiber probe confirmed the actual durable item and opted-in runner were present; the decisive cause was StrictMode replay aborting the initial async lookup while retaining its resume marker. The async StrictMode regression reproduced this exact failure before419721dd. Final browser now observes succeeded latest GET at13.6s with POST0. Unrelated transient `ProfilePageEditor.tsx` → `ProfilePageSettings` compilation overlays occurred during concurrent work; parent coordinated that batch before final verification.

Final stable scene `/tmp/codex-w15-resume-strict` **passed**,132.4s. Three latest GETs, zero POSTs throughout. After an intentional offline period and full-page reload, receipt940d remains succeeded, current revision41a998/title match, save state `saved`; a second full-page reload still has `saved` and no new task. Checked-in sanitized trace: `evidence/W15/codex-resume.log`; final screenshot `evidence/W15/codex-reopened.png` visibly shows the new green stars and light editor chrome. The offline segment was after the real task completed; it is not presented as real in-flight paid generation retry coverage. That transport case remains covered by the focused client tests.

## Limits and honest distinctions

- Actual model calls this round took51/80seconds, not more than180seconds. The >180second transport retry path is tested with injected time, not misrepresented as a real long model run. No extra paid task was submitted to force a slow response.
- A server process interruption does **not** automatically continue generation. The receipt survives; an already committed revision can be recovered; otherwise it becomes explicitly unconfirmed at cancellation/deadline and paid work is never automatically replayed. This deliberately favors no duplicate billing over silently restarting uncertain work.
- Public game fork availability and previous code/save acceptance are documented in `W15-delivery.md`; this continuation does not invent a newly available public template.
