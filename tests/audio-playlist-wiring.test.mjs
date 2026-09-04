// 音频换核接线闸（W10 · editor-core-swap）。
//
// 读源码断言 + 真调用纯函数。真画出多轨波形归 V1（不许用浏览器验收）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import { UNTRUSTED_FRAME_SANDBOX, embedEditorFrameSandbox } from "../src/shell/editor-sandbox-origin.ts";
import {
  AUDIO_NEXT_DEFAULT_MODE,
  applyAudioNextMode,
} from "../src/shell/media-editors/audio-next-mode.ts";
import {
  audioAgentChipsAreValid,
  audioToolsManifestChips,
} from "../src/shell/media-editors/audio-next-l4-chips.ts";
import {
  AUDIO_HOSTED_EMBED_ORIGIN,
  audioHostedEmbedBase,
  canBuildAudioEmbedUrl,
  buildAudioEmbedUrl,
} from "../src/shell/media-editors/audio-hosted-embed.ts";
import {
  AUDIO_PLAYLIST_L1_IDS,
  keepWindowsAfterCut,
  runAudioPlaylistCommand,
} from "../src/shell/media-editors/audio-playlist-engine.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/AudioRoute.tsx");
const leaf = read("src/shell/media-editors/AudioPlaylistStage.tsx");
const frame = read("src/shell/media-editors/AudioHostedFrame.tsx");
const mount = read("src/shell/media-editors/audio-playlist-mount.ts");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("audio"\) === "next"\)/);
  assert.doesNotMatch(routeCode, /from ["']waveform-playlist["']/);
  assert.doesNotMatch(routeCode, /import\(["']waveform-playlist["']\)/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/AudioPlaylistStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<AudioPlaylistStage \{\.\.\.props\} \/>/);
  assert.match(route, /function AudioLegacyRoute/);
  assert.match(route, /useAudioWorkbench/);
  assert.match(route, /<AudioStage editor=\{editor\} accent=\{accent\} \/>/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("professional mode uses buildSetModeMessage and only then shows AudioMass", () => {
  assert.equal(AUDIO_NEXT_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(leaf, /applyAudioNextMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /mode: \{ current: mode, setMode: applyMode \}/);
  assert.doesNotMatch(routeCode, /postMessage/);

  const normal = applyAudioNextMode("oceanleo-audio-next", "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.showHostedEditor, false);

  const pro = applyAudioNextMode("oceanleo-audio-next", "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.showHostedEditor, true);
  assert.equal(pro.message.mode, "pro");
});

test("AudioMass iframe is untrusted: no allow-same-origin, exact targetOrigin", () => {
  assert.equal(
    embedEditorFrameSandbox("https://audio.oceanleo.app"),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.match(frame, /embedEditorFrameSandbox/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /postMessage\(checked, AUDIO_HOSTED_EMBED_ORIGIN\)/);
  assert.doesNotMatch(frame, /postMessage\([^,]+,\s*"\*"\)/);
  assert.doesNotMatch(frame, /allow-same-origin/);
  assert.equal(AUDIO_HOSTED_EMBED_ORIGIN, "https://audio.oceanleo.app");
  assert.equal(audioHostedEmbedBase(), AUDIO_HOSTED_EMBED_ORIGIN);
  assert.equal(canBuildAudioEmbedUrl(AUDIO_HOSTED_EMBED_ORIGIN), true);
  assert.throws(
    () =>
      buildAudioEmbedUrl({
        instanceId: "aud-1",
        hostOrigin: "https://oceanleo.com",
        extra: { token: "nope" },
      }),
    /凭据/,
  );
});

test("the eight audio chips satisfy the contract validator", () => {
  assert.equal(audioAgentChipsAreValid(), true);
  const fields = audioToolsManifestChips();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  assert.equal(new Set(fields.chips.map((chip) => chip.id)).size, 8);
  assert.ok(fields.chips.some((chip) => chip.id === "audio.chip.cut-by-text"));
  assert.match(leaf, /audioToolsManifestChips/);
  assert.match(leaf, /buildAudioReviewProposal/);
});

test("L1 ids map onto waveform-playlist events, not a homegrown engine", () => {
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("crop"));
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("delete"));
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("mute"));
  assert.match(mount, /import\("waveform-playlist"\)/);
  const events = [];
  const port = {
    emit(event, ...args) {
      events.push([event, ...args]);
    },
    getDuration: () => 10,
    getCurrentTime: () => 0,
    getTimeSelection: () => ({ start: 1, end: 3 }),
    trackCount: () => 2,
  };
  assert.equal(runAudioPlaylistCommand(port, "crop").event, "trim");
  assert.equal(runAudioPlaylistCommand(port, "fade-in").event, "fadein");
  assert.equal(runAudioPlaylistCommand(port, "mute").event, "mute");
  const cut = runAudioPlaylistCommand(port, "delete", {
    startSeconds: 2,
    endSeconds: 4,
  });
  assert.equal(cut.ok, true);
  assert.equal(cut.action, "delete-range");
  assert.deepEqual(keepWindowsAfterCut(10, 2, 4), [
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ]);
});

test("next-core sources do not embed a DashScope key", () => {
  for (const text of [leaf, frame, mount, route]) {
    assert.doesNotMatch(text, /sk-[a-zA-Z0-9]{8,}/);
    assert.doesNotMatch(text, /PLATFORM_DASHSCOPE_KEY\s*=\s*['"]/);
  }
});
