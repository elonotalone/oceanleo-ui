# CODEX-W06 — Latin/CJK PDF text continuation

## Result

PASS for the remaining text problem. Latin/CJK text entered into a standard FreeText annotation survives clicking away, server save, closing/reopening and a full reload. This continues `71638f5a`; it does not replace the earlier W06 delivery or claim a fresh acceptance of all older tools.

## Changes

- `PdfStage.tsx`: capture the editable text before blur and explicitly update the selected FreeText if the vendor blur did not commit it. Avoid a duplicate update when it already committed. Click-away, Escape, tool change and mode switch share the same flusher.
- `tests/editor-overhaul-w06-pdf-instance.test.mjs`: regression now checks the exact mixed-script text reaches the annotation capability, beyond merely observing a blur event.
- Added strict `codex-text.mjs`, read-only `codex-reopen.mjs`, and independent `inspect-downloaded.py` evidence helpers. Preserved the previous untracked `r3-reopen.mjs` without changing or staging it.

## Evidence

Acceptance account only; dev slot `p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com`.

Strict browser run (exit 0):

```sh
cd docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/codex-w06-final THEME=light node harness/run.mjs evidence/W06/scenarios/codex-text.mjs 44811dab-4734-48ec-b640-266d7eb31f4b 'Codex 李四 789' 470
```

- Exact input remains after clicking away; save has POST `/revisions` 200 and PUT session `/snapshot` 200.
- Close/reopen reads both `Chen 张三 Codex 456` (preceding save) and `Codex 李四 789`; full reload succeeds at 142.6 seconds.
- Read-only SQL on the acceptance-owned root: revision count/ordinal 6 before these two successful edits, 7 after first, 8 after second. Same root throughout; both changes persist.
- Screenshots: `/tmp/codex-w06-final/{saved,reopened,reloaded}.png`. The reloaded screenshot visibly shows both mixed-script annotations and the original PDF page.
- Dark reopen screenshot `/tmp/codex-w06-dark/reopen-basic.png` also visibly retains both mixed-script annotations, with dark chrome and white paper. Its optional pro-toggle probe initially used the wrong accessible role and is excluded from mode-switch evidence; the existing jsdom single-instance test passes.
- Self-hosted font: dev `/pdfium-fonts/sc.ttf` GET 200, 8,364,644 bytes; browser logs show same-origin font 200. `pdf-engine-host.ts` resolves the same-origin font directory; `pdf-next-runtime.ts` maps SC to charset 134; no shared configuration patch required for this dev slot.
- Download: `/tmp/codex-w06-final/download.pdf`.

Independent check (exit 0, existing environment, no dependency installation):

```sh
/tmp/be-venv/bin/python docs/work-logs/2026-10-23-editor-overhaul/evidence/W06/inspect-downloaded.py /tmp/codex-w06-final/download.pdf 'Chen 张三 Codex 456' 'Codex 李四 789'
```

`pypdf` verifies each exact `/Contents` appears once in a standard `/FreeText`, with exact UTF16 text in `/AP`, Type0 font and predefined CJK CMap. Independent `pypdfium2` rendering `/tmp/codex-w06-final/independent.png` visibly shows both texts; no pdf.js used.

Focused tests: 50/50 pass. Run through `agent-io-guard.sh run-light`, Node flags `--import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test`:

- `tests/editor-overhaul-w06-pdf{,-commands,-instance,-cjk}.test.mjs`: 26/26.
- `tests/pdf-carrier-contract.test.mjs tests/collab-pdf-readonly.test.mjs`: 24/24.

Full suite/typecheck/slot freshness belong to the parent under the continuation task book.

## Limits and earlier failed probes

- Old r3 scripts did not verify text focus or wait for real page images. Their apparent success can be false: clicking an already existing text annotation may not start a fresh editor, and plugin-ready occurs before font/page rendering. New scenarios assert both.
- An earlier probe overlapped the same document and hit CAS 409; it is excluded. Another reopen ran during the parent-announced gateway restart; it is excluded. Final pass used one Chromium and stable gateway.
- Uploading a new synthetic PDF via the shared upload helper returned 415 while the helper reported uploaded. Parent was informed; this is outside W06 and the final run used the existing W06-owned acceptance fixture.
- Browser still logs a host hydration warning and vendor revoked-blob load errors. Final screenshots and text checks pass; these logs are not suppressed.
- Previous delivery's broader unverified claims (material-card drag, every formatting button, library card thumbnail) are not newly marked passed by this continuation.
