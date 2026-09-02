import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

function identityTt(zh, vars) {
  if (!vars) return zh;
  return zh.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

async function loadMediaProbe() {
  return import(
    await compileModule("src/shell/video-editor/media-probe.ts", {
      "../../lib/media-proxy": dataModule(
        "export function canvasSafeUrl(value){ return value; }",
      ),
    })
  );
}

function installMediaDocument(media) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let timeoutDelay = null;
  globalThis.document = {
    createElement(kind) {
      media.createdKind = kind;
      return media;
    },
  };
  globalThis.window = {
    setTimeout(fn, delay) {
      timeoutDelay = delay;
      queueMicrotask(fn);
      return 1;
    },
    clearTimeout() {},
  };
  return {
    timeoutDelay: () => timeoutDelay,
    restore() {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

function mediaStub(handlers) {
  return {
    duration: 1.25,
    videoWidth: 640,
    videoHeight: 360,
    onloadedmetadata: null,
    onerror: null,
    createdKind: null,
    removeAttribute() {},
    load() {},
    set src(_value) {
      handlers.onSrc(this);
    },
  };
}

test("timeout: probe reports timeout, duration stays null, copy has no 解码", async () => {
  const media = mediaStub({ onSrc() {} });
  const env = installMediaDocument(media);
  try {
    const {
      probeMediaSource,
      probeMediaDuration,
      translateMediaProbeFailure,
    } = await loadMediaProbe();
    const outcome = await probeMediaSource("https://cdn.example/x.mp4", "video");
    assert.deepEqual(outcome, { ok: false, reason: "timeout" });
    assert.equal(env.timeoutDelay(), 15_000);
    assert.equal(
      await probeMediaDuration("https://cdn.example/x.mp4", "video"),
      null,
    );
    const timeoutCopy = translateMediaProbeFailure(
      identityTt,
      "timeout",
      "video",
      "initial",
    );
    const errorCopy = translateMediaProbeFailure(
      identityTt,
      "error",
      "video",
      "initial",
    );
    const noTrackCopy = translateMediaProbeFailure(
      identityTt,
      "no-track",
      "video",
      "initial",
    );
    assert.notEqual(timeoutCopy, errorCopy);
    assert.notEqual(timeoutCopy, noTrackCopy);
    assert.notEqual(errorCopy, noTrackCopy);
    assert.doesNotMatch(timeoutCopy, /解码/);
    assert.match(timeoutCopy, /15 秒/);
    assert.doesNotMatch(
      translateMediaProbeFailure(identityTt, "timeout", "video", "clip", "c1"),
      /解码/,
    );
  } finally {
    env.restore();
  }
});

test("error: probe reports error and copy differs from timeout", async () => {
  const media = mediaStub({
    onSrc(el) {
      el.onerror?.();
    },
  });
  const env = installMediaDocument(media);
  try {
    const {
      probeMediaSource,
      probeMediaDuration,
      translateMediaProbeFailure,
    } = await loadMediaProbe();
    const outcome = await probeMediaSource("https://cdn.example/broken.mp4", "video");
    assert.deepEqual(outcome, { ok: false, reason: "error" });
    assert.equal(
      await probeMediaDuration("https://cdn.example/broken.mp4", "video"),
      null,
    );
    const errorCopy = translateMediaProbeFailure(
      identityTt,
      "error",
      "video",
      "initial",
    );
    const timeoutCopy = translateMediaProbeFailure(
      identityTt,
      "timeout",
      "video",
      "initial",
    );
    assert.notEqual(errorCopy, timeoutCopy);
    assert.match(errorCopy, /加载失败/);
  } finally {
    env.restore();
  }
});

test("no-track: probe reports no-track and copy differs from the other two", async () => {
  const media = mediaStub({
    onSrc(el) {
      el.videoWidth = 0;
      el.videoHeight = 0;
      el.onloadedmetadata?.();
    },
  });
  const env = installMediaDocument(media);
  try {
    const {
      probeMediaSource,
      probeMediaDuration,
      translateMediaProbeFailure,
    } = await loadMediaProbe();
    const outcome = await probeMediaSource(
      "https://cdn.example/audio-only.mp4",
      "video",
    );
    assert.deepEqual(outcome, { ok: false, reason: "no-track" });
    assert.equal(
      await probeMediaDuration("https://cdn.example/audio-only.mp4", "video"),
      null,
    );
    const noTrackCopy = translateMediaProbeFailure(
      identityTt,
      "no-track",
      "video",
      "initial",
    );
    const timeoutCopy = translateMediaProbeFailure(
      identityTt,
      "timeout",
      "video",
      "initial",
    );
    const errorCopy = translateMediaProbeFailure(
      identityTt,
      "error",
      "video",
      "initial",
    );
    assert.notEqual(noTrackCopy, timeoutCopy);
    assert.notEqual(noTrackCopy, errorCopy);
    assert.match(noTrackCopy, /视频轨|时长为 0/);
  } finally {
    env.restore();
  }
});

test("probeMediaDuration still returns milliseconds on success and null on failure", async () => {
  const media = mediaStub({
    onSrc(el) {
      el.duration = 2.5;
      el.videoWidth = 1280;
      el.videoHeight = 720;
      el.onloadedmetadata?.();
    },
  });
  const env = installMediaDocument(media);
  try {
    const { probeMediaDuration, probeMediaSource } = await loadMediaProbe();
    const outcome = await probeMediaSource("https://cdn.example/ok.mp4", "video");
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.durationMs, 2_500);
    }
    assert.equal(
      await probeMediaDuration("https://cdn.example/ok.mp4", "video"),
      2_500,
    );
  } finally {
    env.restore();
  }
});
