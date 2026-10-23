# W12 Codex audio continuation

Commits: `a30efaa9`, `0c665c64`, `f18d9320`.

## What changed

- Light/dark waveform, cursor and region palettes follow the host. Theme updates use the existing WaveSurfer instance and preserve audio/history. Gain is represented honestly with normalization disabled.
- Audio trim uses its own `audio-trim` icon, separate from image crop; fade/gain/EQ panels have distinct icons. Shared parent fix treats `audio-track` as a page-level context, making the audio tools drawer reachable without suppressing whole-track editing controls.
- A saved edit includes its playable WAV and editable project in one revision. Removed the eight-second timer that manufactured a second dirty state/revision. Titles stay unchanged. Subsequent saves use this tab's committed head.
- Typed library audio reopens its project manifest, retaining original source and operation log instead of treating the cover or rendered file as the project.
- Material replacement is registered through the real command/history contract. Replacement preserves sample and source history, records a user mutation and reports failures. Undo/redo restore both sound and durable source identity.
- Import, checkpoint and blob recovery now use the parent's immutable authenticated private audio source transport. Initial load, recovery, delivery and remote replay use the authenticated source reader. No public fallback. The transport currently caps new raw sources at 20 MB; larger input fails while preserving the current track.
- Initial and edited waveforms now use the same authoritative decoded samples, avoiding a separate decoder/resampling path. Supplied waveform peaks clamp a copy for out-of-range audio to prevent WaveSurfer's in-place normalization from changing actual samples. The earlier observed 0.707 waveform-area discrepancy was ultimately an evidence timing issue: the inspector resized the canvas after the baseline snapshot. Final evidence waits for the panel and waveform layout to settle.
- Eleven toolbar strings plus nine legacy transcript notices translated in all 16 non-Chinese locales. Parent also requested and received the five missing W11 route translations.

Files changed are confined to the original W12 route/media-editor boundary, its copybook, supporting modules, focused tests and evidence; W11 copybook edits were explicitly requested by parent. Shared transport and drawer policy are parent's changes. `AudioWorkbench.tsx` stays below 600 lines.

## Focused verification

Run from repo root with the standard guard/loader:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/w12-audio-overhaul.test.mjs tests/audio-playable-revision.test.mjs tests/audio-editor-v8.test.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/audio-carrier-contract.test.mjs tests/audio-collab-remote.test.mjs tests/audio-operations-runtime.test.mjs
```

The groups passed before the final waveform helper; its additional non-mutating peak regression and full-hook source replacement history passed (6/6 including the two editor tests). Parent owns final full typecheck/suite.

Old tests asserting delayed delivery/extra revision were changed to require one playable revision per real edit and no idle revision. Superseded-render protection, stable references, 501-operation checkpoint safety, private-read failure without public fallback, readonly and collaboration protections remain tested. The palette test follows the new theme module while retaining the dark specification values. The old image-crop icon assertion now requires audio trim. No tests deleted.

Translation gates for dictionary completeness, placeholder parity and non-Chinese values pass. Whole-repo new-key gate now reports only three unrelated `LeoAssistant.tsx` call notices; W11/W12 gaps are gone. Historical unreferenced-gap ledger failures belong to parent.

## Browser and actual saved audio

All runs use the provided harness, LeoDev portal slot and acceptance account only. From this work-log directory:

```sh
bash harness/mint.sh | OUT_DIR=/tmp/codex-w12-save-final THEME=dark node harness/run.mjs evidence/W12/scenarios/codex-save.mjs ea2e3d75-8caf-445a-aa4e-2e3c71cc1008
bash harness/mint.sh | OUT_DIR=/tmp/codex-w12-offline THEME=dark node harness/run.mjs evidence/W12/scenarios/codex-offline.mjs ea2e3d75-8caf-445a-aa4e-2e3c71cc1008
bash harness/mint.sh | OUT_DIR=/tmp/codex-w12-material-final THEME=light node harness/run.mjs evidence/W12/scenarios/codex-material.mjs ea2e3d75-8caf-445a-aa4e-2e3c71cc1008
```

Acceptance-owned root `ea2e3d75-8caf-445a-aa4e-2e3c71cc1008`:

| Check | Measured result |
| --- | --- |
| Trim then save | Revision `3b40d96e-a6c5-4f5b-b054-ff40d46f99a8`, ordinal 5, HTTP 200 |
| Apply 50% gain then save | Revision `8555ddcf-34df-49e6-979d-50bd5abd185c`, ordinal 6, HTTP 200 |
| Wait 11 seconds | No extra revision |
| Close/reopen, full-page reload | Retains shortened audio and project; host hides a kept-alive editor on close rather than immediately detaching it |
| Offline fade | Explicit error, no committed revision |
| Network restored and retry | Exactly one HTTP 200 revision `6428e6e3-1660-4775-8785-89752d1694ae`, ordinal 7, then saved |
| Source material card replacement | 1 private `/editor-sources` upload, 0 public/database uploads; changes duration to six seconds |
| Source Undo and awaited Redo | Restore old and new durations respectively |
| Save/reload replaced private source | Revision `ba6dcda9-037b-463a-a344-e493dffee360` HTTP 200; full reload retains six-second audio and authenticated private source |

Read-only database verification confirms revisions and unchanged title `[W12] sample.mp3` on the same acceptance root. Independent download of the A/B WAV renditions confirms both contain 250832 bytes and 1.42170068 seconds. RMS ratio B/A is **0.49974847**, confirming the saved/downloaded sound includes the requested 50% gain. Project manifests carry the applied crop/gain operations.

The first offline script stopped too quickly while Retry was still starting; the separate retry scenario waits for a new revision and saved state and passes. Earlier bar scripts captured a waveform before the inspector finished resizing it; those failed comparisons are not counted as passing evidence.

Final button evidence: `/tmp/codex-w12-bars-settled` confirms gain, fade-in and fade-out change the waveform and Undo restores exact raster hashes. `/tmp/codex-w12-bars-remaining` confirms speed/EQ changes the selected region and Undo restores duration and waveform area (normalized for inspector width); transport Play advances to 0:01 and Stop returns to 0:00. Trim and delete were clicked and undone; uniform-tone waveform shape is unchanged by cuts, so the updated reusable scenario now explicitly requires a duration change rather than accepting selection-label changes. The separate trim/save/download check above provides independent trim evidence; delete sample semantics are covered by the focused runtime tests.

Light/dark evidence retained as `evidence/W12/codex-light.png`, `evidence/W12/codex-dark.png` (each under 300 KB). Larger logs and before/after screenshots remain at the `/tmp/codex-w12-*` paths above.

## Boundaries and remaining integration acceptance

No deployment, push, dependency installation, operator-account access/write or test-data cleanup. No new unsupported controls; speed/EQ sliders configure a selected region and their explicit Apply button renders it. Transcript actions still depend on the existing transcription service and were not invoked against speech in these runs. Public-material fork-once/library-card update remain parent integration checks; own-library revision/save and private material replacement are measured here.
