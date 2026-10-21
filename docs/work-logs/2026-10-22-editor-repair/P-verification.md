# Parent independent verification

## Delivered units checked in the parent's shell

All tests below used the workstation IO guard. UI runtime tests used the canonical assert-dom-guard + strip-types + ts-extension-loader chain, not a child report or substituted source.

- W01 `cae64416` / `07bf3412`: Library/Task-history named acceptance **4/4**; single-row/dock/agent-drawer/v9 chrome **40/40**; v8/shared-bar + Library image runtime **11/11**. Hidden on fresh Library open, reopen and item switch; edit-bar agent click opens the existing Task conversation, closes/reopens it without re-creating the editor; no pin or AI-only chooser.
- W02 initial `7d3945a2`: e9 hosted runtime **12/12**, adjacent save contract/revision/autosave/registration/Umo **54/54**. V01 subsequently demonstrated a different late-cache request-ID reuse defect across A→B switch; owner is fixing it. These green results do not close W02.
- W03 UI `54c4b6fd` / `9b938cd3`, Design `3150851c8eddb2f5f7d8552ad6f0859ae33f6139`: UI design composite **15/15**; Design source-handshake + persistence **18/18**; affected Design typecheck exit0. Actual downloaded screenshot file verified against its SHA and the real server-pinned owner projection (51 layers). Full receipt: [P-received-design.md](./P-received-design.md).
- W05 `2b4252be` / `88726358`: promised files exist/nonempty, product diff inspected; grid-icons/facade/wiring/chips **58/58**. Every generated cell/range control has a nonempty glyph and accessible label, unknown glyph fallback is visible, existing facade command adapters remain exercised. Final shared typecheck outstanding until W04 convergence.

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

## Control-plane map integration

New narrow public Design schema entry is recorded in the existing typed-artifact-editing chain, alongside its focused regression. Only that chain changes semantically; its JSON formatting is compacted to remain inside the existing byte budget. No limits/inventory/other chains changed. Generated map hash matches projection. Commit `6a837c9e3` touches only manifest + generated map; unrelated dirty architecture docs preserved.

Parent checks: oceanleo-nav check green; map check green; front typecheck0; preview/staff node tests456/456; script node tests598 passed/6 skipped/0 failed; Lucy1325 passed +200 subtests; policy valid. Initial `python` launcher absent, retried using installed `python3` through the guard, green. Oceandino push only, no product portal/site/release push.

## Remaining acceptance

W02 stale-cache fix and W04 deliverables must pass independent parent/V01 review. Final UI/video typecheck and relevant focused tests, generated CSS, real dev HTTP compilation and zero-STALE freshness check remain. Browser consent absent, so no browser/screenshot acceptance is claimed. The unrelated pre-existing UC-5 backend security-gate failures are not represented as green.
