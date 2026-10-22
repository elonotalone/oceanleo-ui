/**
 * W02 (native editors wave): audio is one wavesurfer.js editor, no Pro page,
 * no hosted AudioMass, no waveform-playlist.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SRC = new URL("../src", import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

test("nothing under src imports waveform-playlist or the audio hosted frame", () => {
  const banned = [
    /["']waveform-playlist["']/,
    /AudioHostedFrame/,
    /audio-hosted-embed/,
    /AudioPlaylistStage/,
    /audio-playlist-(mount|engine)/,
  ];
  const hits = [];
  for (const file of files) {
    // w10-editor-mounts / editor-core-flags / client-editor-adapters registry
    // belong to W01; their stale audio entries are tracked in the W02 delivery.
    if (/w10-editor-mounts|editor-core-flags|client-editor-adapters/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const pattern of banned) {
      if (pattern.test(text)) hits.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("deleted pro-face files stay deleted", () => {
  for (const name of [
    "AudioHostedFrame.tsx",
    "audio-hosted-embed.ts",
    "AudioPlaylistStage.tsx",
    "AudioPlaylistToolbar.tsx",
    "audio-playlist-engine.ts",
    "audio-playlist-mount.ts",
    "audio-next-mode.ts",
    "waveform-playlist.d.ts",
  ]) {
    assert.equal(existsSync(join(SRC, "shell/media-editors", name)), false, name);
  }
});

test("AudioRoute is single-mode: no pro page, mode switch, or core flag", () => {
  const route = readFileSync(join(SRC, "shell/advanced-routes/AudioRoute.tsx"), "utf8");
  assert.doesNotMatch(route, /usePluginMode|PluginModeSwitchGate|resolveEditorCore|proLabel/);
  assert.doesNotMatch(route, /mode:\s*\{/);
  assert.doesNotMatch(route, /w19-handoff-store/);
  assert.match(route, /export function AudioRoute\(/);
  assert.match(route, /AudioTranscriptSection/);
});

test("the audio engine is wavesurfer.js and shows a real decode error", () => {
  const loader = readFileSync(join(SRC, "shell/media-editors/use-audio-wave-loader.ts"), "utf8");
  assert.match(loader, /import\("wavesurfer\.js"\)/);
  assert.match(loader, /setError\(/);
  const view = readFileSync(join(SRC, "shell/media-editors/AudioWorkbenchView.tsx"), "utf8");
  assert.match(view, /editor\.error/);
});
