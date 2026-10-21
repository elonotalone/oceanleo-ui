# Parent independent verification

## Delivered units checked in the parent's shell

All tests below used the workstation IO guard. UI runtime tests used the canonical assert-dom-guard + strip-types + ts-extension-loader chain, not a child report or substituted source.

- W01 `cae64416` / `07bf3412`: Library/Task-history named acceptance **4/4**; single-row/dock/agent-drawer/v9 chrome **40/40**; v8/shared-bar + Library image runtime **11/11**. Hidden on fresh Library open, reopen and item switch; edit-bar agent click opens the existing Task conversation, closes/reopens it without re-creating the editor; no pin or AI-only chooser.
- W02 `7d3945a2` / `c5e2ffc7` / `dfeec117`: final e9 hosted runtime **14/14**, adjacent save contract/revision/autosave/registration/Umo **54/54**. The final runtime explicitly rejects a late host-cache capture and a late native Umo save from A after A→B, and accepts B's own native save. Item-scoped protocol instances plus scoped capture IDs close V01's independently reproduced cross-document defects.
- W03 UI `54c4b6fd` / `9b938cd3`, Design `3150851c8eddb2f5f7d8552ad6f0859ae33f6139`: UI design composite **15/15**; Design source-handshake + persistence **18/18**; affected Design typecheck exit0. Actual downloaded screenshot file verified against its SHA and the real server-pinned owner projection (51 layers). Full receipt: [P-received-design.md](./P-received-design.md).
- W05 `2b4252be` / `88726358`: promised files exist/nonempty, product diff inspected; grid-icons/facade/wiring/chips **58/58**. Every generated cell/range control has a nonempty glyph and accessible label, unknown glyph fallback is visible, existing facade command adapters remain exercised. Final shared typecheck outstanding until W04 convergence.
- W06 Video `cf00d30` / `c71a559`: parent inspected the original-kind/port/parameter projection and command boundaries, then independently ran **4/4** actual-project legacy workflow tests. Original graph edges now attach to the original named handles. Supported scalar edits update the retained original source fields; unsupported values remain visible read-only. Legacy records cannot accidentally invoke native paid generation/Run. This is a faithful editable graph, not a new legacy execution engine.
- Interim shared UI typecheck exit0 and guarded `build:css` exit0 before the last W04 shared changes; generated CSS had no diff then. Final checks will run after W04 convergence.

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

W04's final deliverables must pass independent parent/V01 review. Final UI/video typecheck and relevant focused tests, generated CSS, real dev HTTP compilation and zero-STALE freshness check remain. Browser consent absent, so no browser/screenshot acceptance is claimed. The unrelated pre-existing UC-5 backend security-gate failures are not represented as green.
