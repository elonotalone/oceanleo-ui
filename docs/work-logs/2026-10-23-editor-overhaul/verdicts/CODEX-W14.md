# W14 Codex continuation

Code commit: `c1714249` (main; no push/deployment). Original W14 ownership only.

## What changed

- Strict website-source documents now save through a real server revision, advance their CAS baseline and autosave. The old `{ok:true,item}` local-only receipt was removed.
- The strict format gets canonical text-color and object controls; preview uses its own website theme. Undo pushes data through the existing Puck instance rather than remounting it.
- Site-document recovery now preserves replacement image bytes, filenames, MIME types and paths through JSON drafts. Async capture identifies its exact edit revision. Restore validates every image before changing the editor.
- Site-document material adapter copies library image bytes into private website dependencies; insertion is one editor history mutation, replacement uses the selected image target.

New owner modules: `website-site-recovery.ts`, `website-strict-save.ts`, `website-strict-bar.ts`, `use-site-material.ts`. Changed route, workbench, strict Puck config and focused tests. No iframe, postMessage, cookie, CORS or injection boundary was loosened.

## Verified

Focused command (repo root):

```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/editor-overhaul-w14-website-site.test.mjs
```

Result: 10/10 PASS. New regressions verify replacement byte recovery through JSON and strict schema-compatible controls. Existing data/closure/selection protections remain.

Browser uses only the acceptance user and the authorized LeoDev slot. Scenarios in `evidence/W14/scenarios/codex-accept.mjs` and `codex-reopen.mjs`.

- Initial browser: real images loaded; text color and alignment visibly changed; Undo and Redo restored alignment.
- Frozen light run: title, color and replacement image each produced a real revision 200. Shared session snapshot CAS race then left the bar saving after the third commit; parent fixed that shared race.
- Final dark reopen/retry PASS: `/tmp/codex-w14-reopen-dark-retry/codex-reopen.log`. Title, green color and replacement image survived a fresh browser open. Edit → Pro → Edit preserved the same stage DOM node and text selection. Offline mutation showed error; network restored and real Retry produced revision 200, session snapshot 200, then saved.
- Read-only acceptance SQL: original closure 23 files; image replacement adds one file (24); second replacement adds another (25). Revisions remain `integrity_status=ready`. Root `5540f78f-81fd-455f-bd5c-2a4c29bb8355` stays one active root.
- Evidence images: `evidence/W14/codex-light-normal.png`, `codex-dark-normal.png`, `codex-dark-pro.png`. Website colors stay independent of the dark chrome.

Full light repeat after the shared CAS fix: **PASS** (90s), `/tmp/codex-w14-full-light-final/codex-accept.log`. Four edits generated exactly four successful revision responses: title, color, replacement image, then offline/retry. The third save now settles. Mode switching preserved the same node; a full reload retained both text edits; offline error recovered through the real Retry control. SQL ordinals 9/10/11 correspond to the first three changes; image revision has 26 ready dependencies (all previous files retained). Offline retry committed ordinal 12.

## Limits and shared follow-up

- Parent owns the final full typecheck/full suite and dev-slot freshness. No independent child full suite was run.
- i18n gate: 17/19 PASS; failures are existing cross-owner missing keys and stale historical baseline; no W14 missing key appeared.
- Security gate: 25 PASS, 1 SKIP (oceanleo.app DNS), 1 FAIL because unrelated `backend/tests/test_im_call_captions.py:273` lacks a UC-n reference. Website/UI sandbox, origin and cross-repo injection scans passed. Logs `/tmp/oceanleo-security-gate-CVK3eh`.
- This continuation did not rerun the public-template fork-once browser case, every object/link/alt button, the strict carrier in a browser, or the new library material adapter in a browser. Pure regressions cover their document operations; parent integration acceptance must retain these cases.
- Toolbar capabilities remain honest: the deployed site schema supports section text color/alignment, button links, image replacement/alt, fill and section ordering/duplicate/delete. Font size, bold/italic, image crop/radius/opacity/fit are not stored by that runtime and remain absent. Strict carriers only expose schema-supported global text color and object operations.
- No tests were deleted and no external/shared files require an owner patch.
