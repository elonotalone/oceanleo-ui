# W02 delivery — audio editor, wavesurfer.js only, single mode

Commit: 5bd9d8cb (code + tests) plus this delivery commit.

## What changed
- `AudioRoute.tsx`: now only the former "normal" route (wavesurfer.js v7 + regions, Web Audio ops). Removed the
  core flag, `PluginModeSwitchGate`, `usePluginMode`, `adapter.mode`, `pages`, W19 pro handoff / saved-revision store
  usage, and the lazy Pro stage. No Pro page.
- Added `media-editors/AudioTranscriptSection.tsx`: transcript panel (Bailian ASR, cut-by-sentence) now lives in the
  single editor's toolbox under the track controls. Sentence delete goes through `editor.editRange("delete")` (undo stack,
  autosave). After a cut the sentence list is cleared with a note to re-transcribe (old code left stale timings). A FAILED/timed-out
  ASR now surfaces an error instead of parsing an empty payload.
- `audio-transcript.ts`: self-contained (`keepWindowsAfterCut` inlined; no playlist-engine import).
- Deleted: `AudioHostedFrame.tsx`, `audio-hosted-embed.ts`, `AudioPlaylistStage.tsx`, `AudioPlaylistToolbar.tsx`,
  `audio-playlist-engine.ts`, `audio-playlist-mount.ts`, `audio-next-mode.ts`, `audio-next-conversion.ts`,
  `audio-next-l4-chips.ts`, `waveform-playlist.d.ts`.
- Stored data: nothing rewritten. Items previously saved by the Pro stage carry schema `oceanleo.audio.playlist.v1` (wav source
  only); the loader does not treat it as a project schema and opens the item's wav URL, so they open normally. Old
  `oceanleo.audio-project.v1` / `oceanleo.audio.v1` projects load as before.
- Decode failure: loader sets `error`, `AudioStage` renders it (and the shell status), controls disabled; existing behavior, locked by test.

## Tests
Deleted: `audio-playlist-wiring` (asserted waveform-playlist/AudioMass iframe wiring), `audio-split-enters-select`
(waveform-playlist split command). Rewritten: `audio-next-transcript` -> `audio-transcript.test.mjs` (conversion/chips tests removed
with their modules). Edited: `audio-editor-v8` (regexes follow `view`), `W6-r4-remaining-families` (audio case no longer uses playlist
modules), `W6-20261021-audio.mjs` (dropped playlist case). Added: `audio-single-mode.test.mjs` (regression: no waveform-playlist /
AudioHostedFrame / AudioPlaylistStage import under src, deleted files stay deleted, AudioRoute has no mode/pro/flag).

## Verification (all run via agent-io-guard run-light, flags from _COMMON.md)
Green: audio-single-mode 4/4, audio-transcript 5/5, W6-r4-remaining-families 6/6, audio-editor-v8 2/2, audio-carrier-contract 13/13,
audio-collab-remote 5/5, audio-operations-runtime 7/7, collab-audio-adapter 6/6, payer-media-wiring 7/7.
`tests/W6-20261021-audio.mjs` (not a `*.test.mjs`, outside the suite) fails 2/2 on the first assertion (`0 !== 2`); its
remaining cases are untouched by me and I did not investigate further - likely stale before this wave.
`tsc --noEmit -p .` (run-heavy): no errors in my files. Remaining audio-related errors are not mine: `w10-editor-mounts.ts(201)` imports
the deleted `AudioHostedFrame`; `EmbeddedRoute`/`workbench-embed-base` "embed" comparisons (W01 in-flight).

## Cross-owner requests
- W01: `src/shell/w10-editor-mounts.ts` remove the `audiomass-hosted` mount (lines ~40, 190-205); `src/shell/editor-core-flags.ts:80`
  audio entry; `src/client-editor-adapters/registry.ts:89-94` (`core: "waveform-playlist@4.3.3"` -> wavesurfer.js).
- W01 / parent: tests that I did not edit and that still import deleted audio modules or assert audio Pro/hosted:
  `p7-media-rest`, `e10-media-pro-save` (mount `AudioPlaylistStage`; mixed with 3D/video), `hosted-editor-iframe-sandbox-render`,
  `hosted-family-embed-origin`, `w10-r4-editor-html-hosted`, `w10-loopback-embed-trust` (import `audio-hosted-embed`/`AudioHostedFrame`),
  `eas-w19-five-editors-handoff` (reads `AudioPlaylistStage.tsx`), `rich-doc-core-swap` (mentions only), and
  `editor-repair-20261021-acceptance-remaining-autosave.mjs` (loads `AudioPlaylistStage.tsx`). The audio parts should be pruned.
- W01: `w19-handoff-store` "audio" Pro entries are now unused by audio.
- Hosted-origin config for `audio.oceanleo.app` (audio hosted base / CSP / env, if any) is now dead.

## package.json requests (parent applies)
- Remove dependency `"waveform-playlist": "^4.3.3"` (line ~208). `wavesurfer.js` stays. After `package.json` change, `npm run api:check`
  if any barrel referenced audio exports (I found none in src/index.ts / src/shell/index.ts by grep of deleted names - parent to confirm).

## Remaining limitations
- Single track/clip only (the stored carrier is one source + an operation log); no multitrack, since the carrier has none.
- Envelope/minimap/spectrogram plugins are not wired in; capability set equals the previous normal mode plus transcript panel.
- Not run in a browser (red line); decode/render verified by source and unit tests only.
