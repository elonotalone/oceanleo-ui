# W16 Codex delivery

Product commits: `dddc5330`, `601e2cfd`, `87b01644` (main, no push/deployment).

## Result

The native video canvas now inserts real private media assets instead of storing an inert `materialRef`. Image, video and audio travel through fresh full-rendition access → private staging → verified immutable asset + node → typed revision closure. Reopening resolves that exact closure, with real image/video/audio content on the node. Temporary browser URLs never enter the project JSON.

The stage tracks its saved revision, refreshes expired source grants, refuses a writable-save receipt when read-only, and uses the parent's owner-private working-draft transport. Restoring a document is distinct from a new user edit. Media read failures show an honest notice. Undo/Redo preserves cached verified media URLs until the editor closes.

Canonical controls: `position`, `lock`, `duplicate`, `delete`. Special node settings: title, text/prompt, duration and ratio where the stored node actually supports them. Edges offer deletion. A flow graph has no layer arrangement or animation controls. There is no unsupported Run button.

## Browser evidence

Only the authorized LeoDev slot and acceptance account were used. Every browser has closed.

| Scene | Result | Evidence |
|---|---|---|
| Own file, two edits, reload, offline | Two distinct revision 200s and both changes retained; offline error shown. Automatic online recovery beat the original script's forced Retry click; corrected in final public scene. | `/tmp/codex-w16-save-light` |
| Public template, two edits, reload, offline recovery | PASS, 57.4s. One `:fork` response idempotently reused the acceptance derivative; all 3 real revisions stayed on one root. Open-only created no revision; both edits survived full reload; offline failure recovered to saved. | `/tmp/codex-w16-fork-dark/codex-save.log` |
| PNG material full pipeline | PASS, 90.8s. Insert + revision, atomic Undo/Redo, second revision, fresh reload retained real image. | `/tmp/codex-w16-pipeline-light/codex-pipeline.log` |
| MP4 material full pipeline | PASS, 56.3s. Verified staging, node video metadata/playable source, Undo/Redo immediately retained media, second revision, fresh reload. | `/tmp/codex-w16-pipeline-video/codex-pipeline.log` |
| MP3 material full pipeline, dark | PASS, 85.5s. Same complete path; native audio metadata loads after fresh reload. | `/tmp/codex-w16-pipeline-audio/codex-pipeline.log` |
| Native controls, dark | PASS, 61s. Add node, name/text, position, lock/unlock, duplicate/delete, Undo/Redo, connect, edge delete + Undo; saved and reloaded text and edge retained. | `/tmp/codex-w16-controls-dark-complete/codex-controls.log` |

Committed screenshots: `evidence/W16/codex-light-media.png`, `codex-dark-media.png`, `codex-controls.png`. Light canvas/node backgrounds were `rgb(243,244,246)` / white; dark canvas/node were `rgb(14,14,17)` / `rgb(31,35,41)`. Media colors are unchanged.

Read-only acceptance SQL: exactly **one active workflow root**, `1d2dbe1f-4507-4c7a-91dd-8612baf10b5f`. PNG, MP4 and MP3 increase the closure from entry-only to **4 dependencies (entry + 3 media)**, all `integrity_status=ready`. Every sampled recent revision has one preview rendition. Final controls reached ordinal 31. Repeated saves/fork did not create extra workflow Library items; explicit fixture uploads intentionally create their own media items.

## Focused verification

From the UI repo root, using the standard `run-light` + Node TS loader:

```
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/editor-overhaul-w16-video-canvas.test.mjs tests/video-canvas-durable-save.test.mjs tests/w16-media-recovery.test.mjs
```

Result: **12/12 PASS**. New tests cover private asset evidence and closure pinning, immutable core Asset shape, and URL lifecycle across Undo/Redo.

```
node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-name-pattern='^workflow draft' tests/e9-draft-safety.test.mjs
```

Result: **1/1 PASS**. The retired embedded-graph assertion was replaced by stronger checks on the actual source readiness/read-only guards and the editable v2 working document; unsafe captures still return null. No data-safety test was deleted or weakened. The unrelated 3D E9 test still needed its VM bindings updated at the last child run; parent/W13 owns it.

Global i18n check: 8/10 PASS; failures are cross-owner untranslated strings and historical baseline. No W16 missing key was reported. New visible media notices reuse existing translated text. Parent owns the final full typecheck, full suite, slot freshness and cross-editor acceptance.

## Shared integration

Parent repaired the shared insertion shelf (the old fallback displayed only the current workflow and never searched compatible media) and expanded backend workflow private staging to sniffed raster/audio/video types. Those fixes were exercised by the PNG/MP4/MP3 scenes above. SVG/HTML/JS remain refused; no CORS, cookie, iframe, postMessage or injection policy was changed.

The previous untracked `s7-material.mjs` was read, used unmodified and preserved. New reproducible scenarios are `codex-material.mjs`, `codex-save.mjs`, `codex-pipeline.mjs`, `codex-controls.mjs`.

No known W16 product failure remains in the executed paths. Existing application hydration mismatch messages appeared during fresh loads; they did not prevent completed assertions and belong to shared application hydration. No operator data was read or written, and no duplicate cleanup was performed.
