# W02 state
Facts: legacy AudioLegacyRoute already uses wavesurfer v7 (normal mode); pro = AudioPlaylistStage (waveform-playlist) + AudioHostedFrame (AudioMass).
Plan: AudioRoute -> single legacy route; delete Stage/Toolbar/HostedFrame/hosted-embed/playlist-*/next-*/d.ts; keep transcript, move into legacy toolbox (use-audio-transcript.ts); rewrite tests; delivery.
Current step: deleting pro path.
Repro: node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs
