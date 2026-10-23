import assert from "node:assert/strict";
import test from "node:test";
import { React, act, compileModule, dataModule, mount } from "./collab-media-sim.mjs";

// 2026-10-22 U5. Item 6cf6ec0a rev 2 was an audio-editor save that committed only
// `oceanleo.audio-project.v1` JSON + a waveform PNG: nothing playable, and its
// project embedded a 300 s signed access URL as the base clip (expired = 410).
// Contract pinned here:
//   1. a saved durable audio revision carries a playable `full` delivery;
//   2. a project-only revision is restored from the clip its project references,
//      even when the stored signed URL has expired (re-issued from the token);
//   3. editing/viewing hooks never crash on missing pieces.

class FakeAudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.channels[channel]; }
}
class FakeAudioContext {
  async decodeAudioData() { return new FakeAudioBuffer({ length: 20 * 8000, numberOfChannels: 1, sampleRate: 8000 }); }
  async close() {}
}
globalThis.AudioBuffer = FakeAudioBuffer;
globalThis.AudioContext = FakeAudioContext;

// Real token from the broken project JSON of 6cf6ec0a rev 2 (base clip = rev 1 source).
const SIGNED =
  "https://api.dev.oceanleo.com/v1/artifact-renditions/access/" +
  "eyJhcnRpZmFjdCI6IjZjZjZlYzBhLTFmYzgtNDY1My05MGUzLTZmNWVhYTlkYWU4MCIsImV4cCI6MTc5MjY0OTU4NCwibW9kZSI6InNvdXJjZSIsIm5vbmNlIjoiNVRFa1dSb1Z1dG8iLCJwdXJwb3NlIjoic291cmNlIiwicmV2aXNpb24iOiJiMTZmN2I0OC0zNzUyLTRmNmMtYThlNy01NmI2YzJmYjY0MTQiLCJzdWIiOiIzMjk2ODU1Zi01YWNkLTQ5YmMtYmJhMC02MjliYWQwODdjZGEiLCJ2IjoxfQ." +
  "s6tGNPPhfYrVMhlmVb4aqbHq8TaLtGKfOSZmDzxIpVEZ4";
const ARTIFACT = "6cf6ec0a-1fc8-4653-90e3-6f5eaa9dae80";
const REV1 = "b16f7b48-3752-4f6c-a8e7-56b6c2fb6414";
const REV2 = "72ba72b5-6592-4d2c-a507-0b5bf3edc9b7";

const mp3Bytes = () => new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4])], { type: "audio/mpeg" });

const sourceStubs = {
  "../../lib/media-proxy": dataModule(`
    export async function fetchMediaBlobRefreshing(url, options = {}) {
      globalThis.__fetches.push(url);
      if (url.includes("/access/") && !url.includes("fresh")) {
        const gone = new Error("媒体加载失败 HTTP 410");
        const next = options.refreshGoneUrl ? await options.refreshGoneUrl(url) : null;
        if (!next) throw gone;
        globalThis.__fetches.push(next);
        return globalThis.__sourceBlob();
      }
      return globalThis.__sourceBlob();
    }
  `),
  "../artifact-client": dataModule(`
    export async function refreshArtifactRendition(identity, purpose) {
      globalThis.__refreshes.push({ ...identity, purpose });
      return globalThis.__refreshOk === false
        ? { ok: false, error: "nope", status: 403 }
        : { ok: true, status: 200, data: { url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/fresh", purpose } };
    }
  `),
};
const source = await import(await compileModule("src/shell/media-editors/audio-project-source.ts", sourceStubs));
globalThis.__fetches = [];
globalThis.__refreshes = [];
globalThis.__sourceBlob = mp3Bytes;

test("artifactAccessIdentity reads artifact / revision / purpose out of the signed token", () => {
  assert.deepEqual(source.artifactAccessIdentity(SIGNED), {
    artifactId: ARTIFACT,
    revisionId: REV1,
    purpose: "source",
  });
  assert.equal(source.artifactAccessIdentity("https://cdn.example.com/a.mp3"), null);
  assert.equal(source.artifactAccessIdentity("https://x/v1/artifact-renditions/access/garbage"), null);
});

test("a project whose stored signed URL expired still resolves its base clip (410 -> re-issue by token)", async () => {
  globalThis.__fetches = [];
  globalThis.__refreshes = [];
  const blob = await source.renderAudioProjectPlayable({ sourceUrl: SIGNED, operations: [] });
  assert.equal(blob.type, "audio/mpeg", "没有编辑时就是基础音频本身");
  assert.deepEqual(globalThis.__refreshes, [{ artifactId: ARTIFACT, revisionId: REV1, purpose: "source" }]);
  assert.equal(globalThis.__fetches.at(-1).endsWith("/access/fresh"), true);
});

test("a project with edits is rendered to a playable WAV with the edits applied", async () => {
  globalThis.__fetches = [];
  const blob = await source.renderAudioProjectPlayable({
    sourceUrl: SIGNED,
    operations: [{ type: "crop", start: 6.17, end: 15.5 }],
  });
  assert.equal(blob.type, "audio/wav");
  const head = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...head.slice(0, 4)), "RIFF");
  // 20 s * 8 kHz * 2 bytes = 320 000 uncropped; the crop must have shortened it.
  assert.ok(blob.size < 44 + 20 * 8000 * 2, `crop not applied (size ${blob.size})`);
  assert.ok(blob.size > 44 + 8 * 8000 * 2 - 8000);
});

test("a project with no base clip fails loudly instead of inventing silence", async () => {
  await assert.rejects(() => source.renderAudioProjectPlayable({ sourceUrl: "", operations: [] }), /没有引用任何基础音频/);
});

test("when the token cannot be re-issued the original failure surfaces", async () => {
  globalThis.__refreshOk = false;
  try {
    await assert.rejects(
      () => source.renderAudioProjectPlayable({ sourceUrl: SIGNED, operations: [] }),
      /HTTP 410/,
    );
  } finally { delete globalThis.__refreshOk; }
});

// ---- delivery builder ------------------------------------------------------

const delivery = await import(await compileModule("src/shell/media-editors/audio-delivery.ts", {
  "./audio-project-source": dataModule(`
    export async function fetchAudioProjectSourceBlob(url) {
      if (globalThis.__originalUnreachable) throw new Error("HTTP 410");
      return globalThis.__sourceBlob();
    }
  `),
}));
const decodedBuffer = () => new FakeAudioBuffer({ length: 800, numberOfChannels: 1, sampleRate: 8000 });

test("unedited audio carries the original bytes as the delivery (no re-encode)", async () => {
  const result = await delivery.buildAudioDelivery({ title: "The Accident", buffer: decodedBuffer(), operationCount: 0, sourceUrl: SIGNED });
  assert.equal(result.origin, "original");
  assert.equal(result.sourceFormat, "mp3");
  assert.equal(result.sourceMediaType, "audio/mpeg");
  assert.equal(result.file.name, "The Accident.mp3");
  assert.equal(result.file.type, "audio/mpeg");
});

test("edited audio is rendered to a WAV delivery", async () => {
  const result = await delivery.buildAudioDelivery({ title: "x/y", buffer: decodedBuffer(), operationCount: 2, sourceUrl: SIGNED });
  assert.equal(result.origin, "render");
  assert.equal(result.sourceFormat, "wav");
  assert.equal(result.file.type, "audio/wav");
  assert.match(result.file.name, /^x y\.wav$/);
  assert.equal(result.file.size, 44 + 800 * 2);
});

test("unedited audio whose original is unreachable still gets a rendered delivery", async () => {
  globalThis.__originalUnreachable = true;
  try {
    const result = await delivery.buildAudioDelivery({ title: "t", buffer: decodedBuffer(), operationCount: 0, sourceUrl: SIGNED });
    assert.equal(result.origin, "render");
    assert.equal(result.sourceFormat, "wav");
  } finally { delete globalThis.__originalUnreachable; }
});

// ---- persistence: the save itself -----------------------------------------

const calls = { file: [], projectOnly: [] };
const persistenceStubs = {
  "../../i18n/ui/useUI": dataModule(`export const useUI = () => (t) => String(t);`),
  "../advanced-private-source": dataModule(`export const uploadPrivateEditorSource = async () => ({ ok: false });`),
  "../../lib/media-proxy": dataModule(`
    export const importMediaUrl = async (u) => u;
    export const isFirstPartyMediaUrl = () => true;
  `),
  "./source-integrity.mjs": dataModule(`export const assertBlobSource = async () => "mp3";`),
  "../doc-editors/doc-io": dataModule(`
    const ok = (extra) => ({ ok: true, url: "https://signed/x", versionId: "v2", projectUrl: "https://p", projectSchema: "oceanleo.audio-project.v1", artifactId: "a", revisionId: "r2", previousRevisionId: "r1", ...extra });
    export const saveFileToLibrary = async (input) => { globalThis.__saves.file.push(input); return ok({}); };
    export const saveProjectWorkingHead = async (input) => { globalThis.__saves.projectOnly.push(input); return ok({}); };
  `),
  "../doc-editors/artifact-save-contract": dataModule(`export const artifactSaveStepMessage = (s, d) => String(d || s);`),
  "../doc-editors/editor-preview-raster": dataModule(`export const renderAudioWaveformPng = async () => new Blob([new Uint8Array(4)], { type: "image/png" });`),
  "../library-data": dataModule(`export const isDurableLibraryItem = (item) => Boolean(item.artifactId && item.revisionId && item.artifactType);`),
};
persistenceStubs["./audio-project-source"] = dataModule(`
  export async function fetchAudioProjectSourceBlob() { return globalThis.__sourceBlob(); }
  export function artifactAccessIdentity(url) {
    const m = /access\\/([^/?#.]+)/.exec(url);
    if (!m) return null;
    const p = JSON.parse(Buffer.from(m[1], "base64url").toString());
    return { artifactId: p.artifact, revisionId: p.revision, purpose: p.purpose };
  }
`);
globalThis.__saves = calls;
const { useAudioPersistence } = await import(
  await compileModule("src/shell/media-editors/use-audio-persistence.ts", persistenceStubs)
);

/**
 * Mounts the real hook once and hands back its `save` plus the refs/spies, so a
 * test can drive "autosave, then idle, then autosave again" like the controller.
 */
async function harness(item, operations, { idleMs = 15 } = {}) {
  calls.file.length = 0;
  calls.projectOnly.length = 0;
  const state = { dirty: [], api: null, supersede: false };
  const refs = {
    buffer: { current: decodedBuffer() },
    sourceUrl: { current: SIGNED },
    operations: { current: operations },
    undoOps: { current: [] },
    redoOps: { current: [] },
    workingHead: { current: "" },
    undo: { current: [] },
    redo: { current: [] },
    revision: { current: 3 },
    saving: { current: false },
  };
  function Probe() {
    state.api = useAudioPersistence({
      item,
      siteId: "audio",
      requiresExistingSource: true,
      deliveryIdleMs: idleMs,
      bufferRef: refs.buffer,
      sourceUrlRef: refs.sourceUrl,
      operationsRef: refs.operations,
      undoOperationsRef: refs.undoOps,
      redoOperationsRef: refs.redoOps,
      workingHeadUrlRef: refs.workingHead,
      undoRef: refs.undo,
      redoRef: refs.redo,
      revisionRef: refs.revision,
      savingRef: refs.saving,
      reloadWaveform: async () => undefined,
      setSaving() {}, setError(e) { if (e) throw new Error(e); }, setSavedUrl() {},
      setDirty(value) { state.dirty.push(value); },
      setCanUndo() {}, setCanRedo() {},
      tt: (t) => String(t),
    });
    return null;
  }
  const mounted = await mount(React.createElement(Probe));
  const save = async () => {
    let result;
    await act(async () => { result = await state.api.save(); });
    return result;
  };
  const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  return { state, refs, save, wait, unmount: () => mounted.unmount() };
}

const durableAudio = {
  id: ARTIFACT, key: `artifact:${ARTIFACT}:${REV1}`, title: "The Accident", kind: "audio", source: "artifact",
  artifactId: ARTIFACT, revisionId: REV1, artifactType: "audio", artifact: {}, url: SIGNED, meta: {},
};
const CROP = [{ type: "crop", start: 1, end: 2 }];

test("autosave includes playable audio and a stable project reference in the same revision", async () => {
  const h = await harness(durableAudio, CROP, { idleMs: 10_000 });
  try {
    assert.ok(await h.save());
    assert.equal(calls.file.length, 1);
    assert.equal(calls.projectOnly.length, 0);
    assert.equal(calls.file[0].title, durableAudio.title);
    const project = calls.file[0].project;
    assert.deepEqual(project.data.sourceRef, { artifactId: ARTIFACT, revisionId: REV1, purpose: "source" });
    assert.equal(project.data.sourceUrl, SIGNED, "签名地址继续保留作兼容");
  } finally { await h.unmount(); }
});

test("a saved edit stays saved after idle time without manufacturing another revision", async () => {
  const h = await harness(durableAudio, CROP, { idleMs: 15 });
  try {
    await h.save();
    assert.equal(calls.file.length, 1);
    const revisionBefore = h.refs.revision.current;
    await h.wait(60);
    assert.equal(h.refs.revision.current, revisionBefore);
    assert.equal(h.state.dirty.at(-1), false);
    assert.equal(calls.file.length, 1);
    assert.equal(calls.file[0].file.type, "audio/wav");
    assert.equal(calls.file[0].sourceFormat, "wav");
    assert.equal(calls.file[0].artifactRevision.artifactType, "audio");
    assert.equal(calls.file[0].project.schema, "oceanleo.audio-project.v1");
    // Delivered once: no further idle round is scheduled.
    const after = h.refs.revision.current;
    await h.wait(60);
    assert.equal(h.refs.revision.current, after);
    assert.equal(calls.file.length, 1);
  } finally { await h.unmount(); }
});

test("two real edits publish two playable saves without a timer adding a third", async () => {
  const h = await harness(durableAudio, CROP, { idleMs: 30 });
  try {
    await h.save();
    h.refs.revision.current += 1; // user keeps editing
    await h.wait(80);
    assert.equal(h.refs.revision.current, 4, "不能再被计时器改写 revision");
    assert.equal(calls.file.length, 1);
    await h.save();
    assert.equal(calls.file.length, 2);
    assert.equal(calls.projectOnly.length, 0);
  } finally { await h.unmount(); }
});

test("unmounting the editor cancels the pending render", async () => {
  const h = await harness(durableAudio, CROP, { idleMs: 30 });
  await h.save();
  const revision = h.refs.revision.current;
  await h.unmount();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(h.refs.revision.current, revision);
});

test("a render superseded by an edit mid-flight is dropped and saved project-only", async () => {
  const h = await harness(durableAudio, CROP, { idleMs: 10 });
  try {
    // An edit lands while the WAV is being encoded (encodeWav reads the channel data).
    h.refs.buffer.current = new Proxy(h.refs.buffer.current, {
      get(target, prop, receiver) {
        if (prop === "getChannelData") h.refs.revision.current += 1;
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    calls.file.length = 0;
    await h.save();
    assert.equal(calls.file.length, 0, "已经过时的渲染不能上传");
    assert.equal(calls.projectOnly.length, 1);
  } finally { await h.unmount(); }
});

test("an unedited durable item keeps the original mp3 as the delivery right away", async () => {
  const h = await harness(durableAudio, [], { idleMs: 10_000 });
  try {
    assert.ok(await h.save());
    assert.equal(calls.file.length, 1);
    assert.equal(calls.file[0].sourceFormat, "mp3");
    assert.equal(calls.file[0].file.type, "audio/mpeg");
    assert.equal(calls.file[0].meta.audio_delivery_origin, "original");
  } finally { await h.unmount(); }
});

test("a non-durable audio draft autosaves project-only and never schedules a render", async () => {
  const h = await harness({ id: "d1", key: "d1", title: "draft", kind: "audio", source: "local", url: "", meta: {} }, CROP, { idleMs: 10 });
  try {
    assert.ok(await h.save());
    const revision = h.refs.revision.current;
    await h.wait(50);
    assert.equal(h.refs.revision.current, revision);
    assert.equal(calls.file.length, 0);
    assert.equal(calls.projectOnly.length, 1);
  } finally { await h.unmount(); }
});

// ---- stable reference ------------------------------------------------------

test("expiry is read from the token; sourceRef re-issues a clip whose URL carries no token", async () => {
  globalThis.__fetches = [];
  globalThis.__refreshes = [];
  const ref = { artifactId: ARTIFACT, revisionId: REV1, purpose: "source" };
  // The token in SIGNED carries exp 1792649584 (2026-10-22); pretend it is long past.
  assert.equal(source.artifactAccessUrlExpired(SIGNED, 1792649584 * 1000 + 1), true);
  assert.equal(source.artifactAccessUrlExpired(SIGNED, 1792649584 * 1000 - 1000), false);
  assert.deepEqual(source.normalizeAudioSourceRef(ref), ref);
  assert.equal(source.normalizeAudioSourceRef({ artifactId: "a" }), null);
  assert.equal(source.normalizeAudioSourceRef("x"), null);
  await source.renderAudioProjectPlayable({ sourceUrl: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/opaque", sourceRef: ref, operations: [] });
  assert.deepEqual(globalThis.__refreshes, [{ artifactId: ARTIFACT, revisionId: REV1, purpose: "source" }], "没有 token 的地址 410 后按 sourceRef 换发");
});
