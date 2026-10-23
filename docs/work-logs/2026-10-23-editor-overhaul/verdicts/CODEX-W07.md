# CODEX-W07 — deck continuation

## Changes and outcome

Commit `3c3b9c32` fixes phantom versions when merely opening/closing/reloading a deck. Two separate causes were confirmed: the first forced close flush exported an unchanged document because no receipt existed yet; collaboration reconstructed formatted text in a different object-key order, and JSON.stringify treated that order as an edit.

- `DeckRoute.tsx`: a clean first flush returns the existing item.
- `use-deck-editor.ts` + `deck-save-echo.ts`: seed a receipt from an existing durable version; refuse export while the real source is still loading. Genuine unpublished server drafts retain the original recovery/promotion behavior.
- `DeckMutationPolicy.ts`: compare object values independent of key order; preserve array order and actual formatting differences.
- `DeckStage.tsx`: expose edit revision and dirty state for acceptance diagnostics.
- Regression tests prove formatted collaboration hydration is unchanged, real text/layer changes differ, and a clean durable hook flush performs zero uploads.
- Fixed two parent-reported test harness failures: isolate the standalone editor cycle in `deck-delivery-family`, and inject the real `loadDeckServerDraft` fetch boundary in `e6-deck-draft-runtime` after private storage transport was introduced. All security/data-preservation assertions remain.

## Browser and SQL evidence

Acceptance account only, existing dev slot; no production/twin operations.

All scenario commands run from this work-log root using:

```sh
bash harness/mint.sh | OUT_DIR=<directory> THEME=light node harness/run.mjs evidence/W07/scenarios/<scenario> <args>
```

| Check | Evidence and result |
| --- | --- |
| Open/close/reopen/reload without editing | `codex-open.mjs 0dac8934-1f2e-454f-badc-3ff6a33a768f`, `/tmp/codex-w07-open-fixed`, exit 0; 98.6 seconds, zero revision POSTs; SQL ordinal 18 remained 18. Before the fix the same scenario produced an extra revision. |
| Two real edits and persistence | `codex-save.mjs` on the same root, `/tmp/codex-w07-stable`, exit 0; bold and strike visibly change, each saves, reopen and full reload retain both. |
| Offline error/retry | Same strict run: italic while offline reports error, restoring connectivity and clicking the precise Retry action reaches saved; reopening retains italic. Exactly three revision POSTs, all 200, SQL ordinal 22→25. |
| Public source / one stable fork | `codex-fork.mjs 8886a2d9-2869-4ae0-a806-0ff2c6429b15 codex-fork`, `/tmp/codex-w07-fork`, exit 0; one fork request resolves the existing acceptance-owned `a67bdb59`; three edits write the same copy and URL, ordinal 24→27. Matching library entries remained one. This checks idempotent reuse of the existing fork; it does not claim a newly created second copy. |
| Library card | `codex-card.mjs '[W07] sample.pptx'`, `/tmp/codex-w07-card-done`, exit 0; title matches and latest saved first-slide cover loads at 1280×960. Screenshot `library-card.png` visibly shows the formatted title. Early probes filled the server-rendered filter before hydration and were excluded; the final probe waits for the live collection. |

Strict logs and screenshots are in the listed `/tmp` directories: `codex-open.log`, `codex-save.log`, `codex-fork.log`, `reopened-final.png`, `two-edits.png`, `offline-error.png`, `codex-fork-after-edits.png`.

## Toolbar and theme

The canon control/command/layout code is unchanged by this continuation. Reused and visually inspected the existing `evidence/W07/light-bar-text.png` and `dark-bar-image.png`; the same directory also contains light/dark empty, image/text bars, element drawer and full-height-stage evidence. The rail and stage chrome follow theme; slide colors remain unchanged and the bar clears the rail.

Existing canon IDs and supported controls remain: text `font-family/font-size/bold/italic/underline/strike/text-color/highlight/align/list/line-height/link/letter-spacing/clear-format`; suitable shape controls; image replace/flip/rotate/fit/adjust/opacity/border; object arrange/position/animation/lock/duplicate/delete. Canon projection, command mutation, native PPTX visual/style round-trip and material history tests pass. This turn directly clicked bold, strike, italic and Retry through actual server saves; it does not relabel the original unfinished full per-button visual matrix as freshly retested. Parent owns shared bar projection acceptance.

## Tests

Focused commands use `agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test`.

- `deck-save-echo.test.mjs`: 9 pass.
- `e6-deck-draft-runtime.test.mjs`: 6 pass, including the new actual-hook zero-upload test.
- `deck-delivery-family.test.mjs`: 15 pass; previously the file could not load.
- `deck-unified-edit-bar.test.mjs`, `deck-material-adapter.test.mjs`, `deck-preview-layout.test.mjs`: 24 pass combined.
- `deck-editor-integrity.test.mjs`, `collab-deck-adapter.test.mjs`, `W5-20261021-deck-person-edit.mjs`, `deck-source-style-ooxml.test.mjs`: 30 pass combined.

84 unique focused assertions pass. Parent owns full typecheck/full suite/slot freshness. No dependency changes or public export/snapshot edits; no new user-facing copy.

## Limits

- A probe during the parent-announced gateway restart and another during a full dev HMR reload were excluded. A subsequent stable-source run completed the full strict save protocol.
- Host hydration warnings remain in browser logs. One session snapshot 409 occurred in the stable run; all three artifact commits and the final saved/reopened assertions succeeded without duplicate revisions.
- No operator data was read or changed; unrelated dirty files were preserved. No cleanup, push or deployment.
