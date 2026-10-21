# Parent independent verification

## Delivered units checked in the parent's shell

All tests below used the workstation IO guard. UI runtime tests used the canonical assert-dom-guard + strip-types + ts-extension-loader chain, not a child report or substituted source.

- W01 `cae64416` / `07bf3412`: Library/Task-history named acceptance **4/4**; single-row/dock/agent-drawer/v9 chrome **40/40**; v8/shared-bar + Library image runtime **11/11**. Hidden on fresh Library open, reopen and item switch; edit-bar agent click opens the existing Task conversation, closes/reopens it without re-creating the editor; no pin or AI-only chooser.
- W02 `7d3945a2` / `c5e2ffc7` / `dfeec117` / `164cb12f`: final e9 hosted runtime **14/14**, adjacent save contract/revision/autosave/registration/Umo **54/54**. The final runtime explicitly rejects a late host-cache capture and a late native Umo save from A after A→B, and accepts B's own native save. Item-scoped protocol instances plus scoped capture IDs close V01's independently reproduced cross-document defects.
- W03 UI `54c4b6fd` / `9b938cd3`, Design `3150851c8eddb2f5f7d8552ad6f0859ae33f6139`: UI design composite **15/15**; Design source-handshake + persistence **18/18**; affected Design typecheck exit0. Actual downloaded screenshot file verified against its SHA and the real server-pinned owner projection (51 layers). Full receipt: [P-received-design.md](./P-received-design.md).
- W05 `2b4252be` / `88726358`: promised files exist/nonempty, product diff inspected; grid-icons/facade/wiring/chips **58/58**. Every generated cell/range control has a nonempty glyph and accessible label, unknown glyph fallback is visible, existing facade command adapters remain exercised. Final shared typecheck outstanding until W04 convergence.
- W06 Video `cf00d30` / `c71a559`: parent inspected the original-kind/port/parameter projection and command boundaries, then independently ran **4/4** actual-project legacy workflow tests. Original graph edges now attach to the original named handles. Supported scalar edits update the retained original source fields; unsupported values remain visible read-only. Legacy records cannot accidentally invoke native paid generation/Run. This is a faithful editable graph, not a new legacy execution engine.
- Interim shared UI typecheck exit0 and guarded `build:css` exit0 before the last W04 shared changes; generated CSS had no diff then. Final checks will run after W04 convergence.

## Final W04 / parent integration

- W04 video`38379dc` + type narrowing`f5721df`, UI`e2c62ee2` + permission-loss correction`32625b41`: parent forced-actual-source UI group21/21, final dirty/clean gate-transition controls2/2, canonical-v2 host reopen4/4 with explicit actual fixture (no skip), video migration/dependency/staging/legacy group30/30 and real hosted hook2/2. W06 hook typing correction is`f5e1cf8`; it introduces no suppression/non-null assertions. Final full Video typecheck exit0.
- Parent`895ae82c`: mounted-close synchronously observes the latest render, repeats explicit draining when another edit renders during a receipt, and keeps per-source serializers/session/draft/recovery/ledger refs for background jobs. Real layout-before-passive and two independently reproduced A→B counterexamples are now covered; hook7/7, mounted/structural/native/pipeline/Image19/19, autosave/recovery/draft/session36/36. V01 independently reran both cross-source cases green. Full shared UI typecheck after extraction/source isolation exit0. No load-only autosave gate was weakened.
- Final generated CSS passes without a generated diff; public API snapshot check passes. All three dev HTTP compilation routes return200: portal`/library`, Design`/embed/editor`, Video`/canvas-board?embed=1&editor=1`. These are compile/HTTP checks, not browser rendering proof.
- Backend expanded group111/111 after bounded staging lifecycle/quota floor`725424c`. Reused private video fixture final accepted revision`e7c9b7e2-74b3-4276-8fc1-b5e10998a75c`, exact source, closure4, all3 media exact, prior pin/original unchanged; simulated-expiry dry-run6 candidates/0 deletions. See [P-private-video-decision.md](./P-private-video-decision.md) for the explicit platform accounting limitation and no-live-deletion boundary.

## Actual private storage / revision / reopen acceptance

Helper: `tests/helpers/verify-private-editor-save.py`, run inside the already-running dev gateway. It imports the existing Library helper's runtime guard; credentials remain inside the gateway. Real machine-authenticated local dev HTTP creates/downloads; the normal deployed revision route is invoked in-process for the helper-verified owner. No auth overrides are installed and this is **not** browser/user-bearer end-to-end proof.

Command (repeat reuses the same exact-title owner-checked fixture):

```sh
docker exec -i oceanleo-api python - --fixture 3495599f-4145-4312-8d69-25fbfcdec13d < tests/helpers/verify-private-editor-save.py
```

Final run passed all assertions:

- Only private `project-assets`; synthetic document root `3495599f-4145-4312-8d69-25fbfcdec13d`, new durable revision `d372d30a-9da2-4971-b63e-50ccc4696016`.
- Native DOCX source and TipTap editor manifest reread byte-for-byte from actual storage. Text, bold and 28px survive. Real machine HTTP download 200/hash match.
- Exact retry returns the same revision (idempotent); a genuinely distinct stale edit returns 409/revision-conflict and leaves head unchanged. Earlier harness attempt incorrectly expected an identical retry to conflict; corrected to match the established idempotent contract, not a product change.
- Source access uses the repository's actual `source` permission. First harness run used nonexistent `export_source`, failed after successful commit, then was corrected. One existing fixture was reused for all retries; no extra Library roots were created.
- Prior pinned revision still readable. Screenshot Design/document/video heads unchanged throughout the final run; no original was edited/deleted.
- Temporary machine credential revoked in `finally` on every run.

Retained evidence fixture title: `[Editor repair acceptance 2026-10-22] 23fafdea`. No material cleanup performed; it remains privately recoverable in Library. Staged test objects are private and contain synthetic bytes only.

## Video storage, media grants and local dev backend

Parent portal commit `053f825` stages canonical workflow v2 media in every new revision closure. Stable owner-bound `sourceDependency` references are verified against storage; capability URLs, blob/data locators and conflicting same-hash MIME metadata are rejected. The final focused dependency/typed-save/Library-wire/revision-integrity group passed **70/70**. Full details and exact fixture/source identifiers: [P-received-video-backend.md](./P-received-video-backend.md).

The actual screenshot video source migrated **19/19** under the forced pinned-source test, without a fixture skip. A private fork was then saved as v2 through the real revision route; all four manifest entries and all three media reread with exact SHA/size from the new revision. Root `16e11caf-1c6d-4e67-8b8a-d9bff2527ded`, revision `4723e956-b9be-4421-bd1f-929a1ebc4dbf`, title `[Editor repair video acceptance 2026-10-22] afb9aa8b`. Original and prior pins remain unchanged. This real-storage test uses an in-process verified-owner route, not browser authentication.

The existing owner-authenticated source-dependency endpoint generated fresh grants for the screenshot's coffee.webp/hearts.mp4/music.mp3. Local dev HTTP returned direct200 for all three with the expected MIME, size and SHA. No grant URLs, tokens or file bytes were printed. The local dev API was refreshed after guarded zero-active-turn and route-isolation checks, then `/health` returned 200 and all dependency readiness fields true. No production API/page was requested.

Security gate result recorded by W02: **23 PASS / 2 FAIL / 1 SKIP**. The two pre-existing UC-5 failures concern backend RLS/quota hardening and security-definer grants; apex-cookie coverage skipped because `oceanleo.app` DNS did not resolve. Relevant UI/embed/origin checks pass. This is not a fully green security gate.

## Control-plane map integration

New narrow public Design schema entry is recorded in the existing typed-artifact-editing chain, alongside its focused regression. Only that chain changes semantically; its JSON formatting is compacted to remain inside the existing byte budget. No limits/inventory/other chains changed. Generated map hash matches projection. Commit `6a837c9e3` touches only manifest + generated map; unrelated dirty architecture docs preserved.

Parent checks: oceanleo-nav check green; map check green; front typecheck0; preview/staff node tests456/456; script node tests598 passed/6 skipped/0 failed; Lucy1325 passed +200 subtests; policy valid. Initial `python` launcher absent, retried using installed `python3` through the guard, green. Oceandino push only, no product portal/site/release push.

## Remaining acceptance

Final broad Node-only/security sweep and latest zero-STALE check are being recorded. Three preliminary UI sweeps were intentionally stopped (only parent-owned Node test processes): to fix confirmed source-lifetime bugs, correct a shell wrapper's light misclassification, and exclude four real-browser suites before they ran. No interrupted run is claimed complete. The final sweep invokes897 Node test files directly through heavy admission; it excludes chart-editor-browser-export, w10-r2-ui-offline, w10-design-canvas-offline and model3d-three-roundtrip because browser consent is absent. No browser/screenshot acceptance is claimed.

V01 read-only `git archive 11780390` reproduction proved the named Artifact-surface3/W3-loader-cycle/Audio-v8/Auth-captcha2/Bay-layout failures already exist on the unchanged pre-task snapshot. The W3 file registers0 cases because stale stubs create a data-module import cycle; it is not represented as coverage. The new named Library/Task-host and save/leave/runtime cases above execute independently and pass. Unrelated pre-existing UC-5 security-gate failures likewise remain red, not represented as green. Final broad sweep results are recorded separately rather than silently repairing unrelated product/test contracts.

Final security gate rerun completed **23 PASS / 2 FAIL / 1 SKIP**, logs`/tmp/oceanleo-security-gate-2jLXLV`. Same two UC-5 baseline failures; apex cookie probe skipped DNS resolution. All relevant iframe/origin/cookie, cross-repo render-surface and policy-reference checks pass. No product/twin push or release is performed. Final full Design typecheck also exits0; all three affected repositories have full typecheck proof.

During final freshness acceptance the unused Website slot expired normally (`stopReason: idle-timeout`), leaving3 live slots with dead Website embed mappings. The canonical `--rebuild` helper is serially relaunching those slots to remove stale mappings; this is local dev only, not product distribution. The final freshness result and post-refresh HTTP checks are recorded below when complete.

Freshness repair completed successfully: Design77s, Video82s, portal87s, same preview addresses, correct live Design/Video embed mapping. Canonical final status at2026-10-21T19:54:47Z: **3 FRESH(dev), 0 STALE**. After the refresh, portal Library, Design editor embed and Video canvas embed each returned HTTP200; dev API health also200. Website remains correctly idle rather than an invalid iframe target. No protected agent/terminal process was stopped.
