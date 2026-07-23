import assert from "node:assert/strict";
import test from "node:test";

import {
  model3DBokehSettings,
  model3DDepthOfFieldRuntimeCapability,
  model3DDirectorFrameAt,
  model3DPlayblastRuntimeCapability,
  model3DRecorderMime,
} from "../src/shell/media-editors/model3d-director-runtime.mjs";
import {
  applyModel3DDirectorCommand,
  createModel3DDirectorDocument,
  model3DPrevisAvailability,
  startModel3DPrevis,
} from "../src/shell/media-editors/model3d-director.ts";
import {
  MODEL3D_PLAYBLAST_TIMELINE_SCHEMA,
  createModel3DPlayblastAdapter,
  model3DPlayblastTimeline,
} from "../src/shell/media-editors/model3d-playblast.ts";

function clock() {
  let id = 0;
  return {
    now: () => "2026-07-23T12:00:00.000Z",
    makeId: (prefix) => `${prefix}-${++id}`,
  };
}

function directorDocument() {
  const deterministic = clock();
  let document = createModel3DDirectorDocument("", deterministic);
  document = applyModel3DDirectorCommand(
    document,
    {
      id: "bind-scene",
      scene: {
        id: "scene-1",
        sourceAssetId: "asset-1",
        sourceRevisionId: "revision-4",
      },
    },
    deterministic,
  );
  document = applyModel3DDirectorCommand(
    document,
    {
      id: "create-shot",
      shot: {
        id: "shot-1",
        takeId: "take-1",
        durationMs: 2_000,
      },
    },
    deterministic,
  );
  document = applyModel3DDirectorCommand(
    document,
    {
      id: "set-camera",
      shotId: "shot-1",
      patch: {
        fovDegrees: 50,
        apertureFStop: 2,
        depthOfFieldEnabled: true,
        focusDistance: 4,
      },
    },
    deterministic,
  );
  document = applyModel3DDirectorCommand(
    document,
    {
      id: "upsert-keyframe",
      shotId: "shot-1",
      takeId: "take-1",
      keyframe: {
        id: "keyframe-end",
        timeMs: 2_000,
        transform: {
          position: [10, 2, 4],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        target: [1, 0, 0],
        fovDegrees: 30,
        focalLengthMm: 60,
        apertureFStop: 8,
        easing: "linear",
      },
    },
    deterministic,
  );
  return document;
}

test("DOF mappings and runtime limitations are explicit and bounded", () => {
  const open = model3DBokehSettings(1.4, 3);
  const stoppedDown = model3DBokehSettings(11, 8);
  assert.ok(open.aperture > stoppedDown.aperture);
  assert.ok(open.maxBlur > stoppedDown.maxBlur);
  assert.equal(open.focus, 3);
  assert.equal(model3DBokehSettings(0.1, 0).apertureFStop, 0.7);

  assert.deepEqual(
    model3DDepthOfFieldRuntimeCapability({
      webgl2: false,
      renderableHalfFloatColorBuffer: true,
    }),
    { enabled: false, reason: "Depth of field requires WebGL2" },
  );
  assert.deepEqual(
    model3DDepthOfFieldRuntimeCapability({
      webgl2: true,
      renderableHalfFloatColorBuffer: false,
    }),
    {
      enabled: false,
      reason: "Depth of field requires a renderable half-float color buffer",
    },
  );
  assert.deepEqual(
    model3DPlayblastRuntimeCapability({
      canvasCaptureStream: true,
      mediaRecorder: false,
    }),
    {
      enabled: false,
      reason: "This browser does not expose MediaRecorder",
    },
  );
  assert.equal(model3DRecorderMime(null), "");
});

test("director camera interpolation carries lens aperture through keyframes", () => {
  const document = directorDocument();
  const shot = document.shots[0];
  assert.equal(shot.camera.depthOfFieldEnabled, true);
  const middle = model3DDirectorFrameAt(
    shot.camera,
    shot.takes[0].motionPath,
    1_000,
  );
  assert.deepEqual(middle.position, [5, 1.75, 4.5]);
  assert.deepEqual(middle.target, [0.5, 0, 0]);
  assert.equal(middle.fovDegrees, 40);
  assert.equal(middle.apertureFStop, 5);
});

test("playblast timeline is one immutable video source for gateway FFmpeg", () => {
  const timeline = model3DPlayblastTimeline(
    "https://cdn.example/source.webm",
    {
      durationMs: 2_000,
      fps: 24,
      width: 1_919,
      height: 1_081,
    },
    "request-1",
  );
  assert.equal(timeline.width, 1_918);
  assert.equal(timeline.height, 1_080);
  assert.equal(timeline.fps, 24);
  assert.equal(timeline.tracks.length, 1);
  assert.equal(timeline.tracks[0].kind, "video");
  assert.equal(timeline.tracks[0].clips[0].source_url, "https://cdn.example/source.webm");
  assert.equal(timeline.tracks[0].clips[0].duration_ms, 2_000);
  assert.equal(Object.isFrozen(timeline), true);
  assert.equal(Object.isFrozen(timeline.tracks[0].clips), true);
});

test("real playblast adapter captures, uploads and returns a durable render receipt", async () => {
  const document = directorDocument();
  const progress = [];
  let captured;
  let uploaded;
  let rendered;
  const runtime = {
    playblastCapability: () => ({ enabled: true, mimeType: "video/webm;codecs=vp9" }),
    async capturePlayblast(input) {
      captured = input;
      input.onProgress(0.5);
      input.onProgress(1);
      return {
        blob: new Blob(["webm"], { type: "video/webm" }),
        mimeType: "video/webm",
        durationMs: input.durationMs,
        fps: input.fps,
        frameCount: 48,
        width: 1280,
        height: 720,
      };
    },
  };
  const adapter = createModel3DPlayblastAdapter({
    getRuntime: () => runtime,
    siteId: "threed",
    title: "Robot",
    parentId: "asset-1",
    uploadSource: async (file, input) => {
      uploaded = { file, input };
      return { url: "https://cdn.example/playblast-source.webm" };
    },
    render: async (payload, onState, pollMs, signal) => {
      rendered = { payload, pollMs, signal };
      onState({ status: "queued" }, "render-job-1");
      onState({ status: "running" }, "render-job-1");
      onState({ status: "settling" }, "render-job-1");
      onState(
        { status: "done", url: "https://cdn.example/playblast.mp4" },
        "render-job-1",
      );
      return "https://cdn.example/playblast.mp4";
    },
  });
  const receipt = await startModel3DPrevis(document, "playblast", adapter, {
    ...clock(),
    onProgress: (value) => progress.push(value),
  }).result;
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.adapter, "three-mediarecorder-timeline-ffmpeg");
  assert.equal(receipt.sceneId, "scene-1");
  assert.equal(receipt.shotId, "shot-1");
  assert.equal(receipt.takeId, "take-1");
  assert.equal(receipt.media.url, "https://cdn.example/playblast.mp4");
  assert.equal(receipt.media.sourceUrl, "https://cdn.example/playblast-source.webm");
  assert.equal(receipt.media.renderJobId, "render-job-1");
  assert.equal(receipt.media.timelineSchema, MODEL3D_PLAYBLAST_TIMELINE_SCHEMA);
  assert.equal(receipt.media.durationMs, 2_000);
  assert.equal(receipt.media.frameCount, 48);
  assert.equal(captured.camera.depthOfFieldEnabled, true);
  assert.equal(captured.motionPath.length, 1);
  assert.equal(uploaded.file.type, "video/webm");
  assert.equal(uploaded.input.requestId, receipt.requestId);
  assert.equal(rendered.payload.timeline.tracks[0].kind, "video");
  assert.equal(rendered.payload.parent_id, "asset-1");
  assert.equal(progress.at(-1).phase, "complete");
});

test("playblast capability failures and cancellation return precise receipts", async () => {
  const document = directorDocument();
  const unsupportedAdapter = createModel3DPlayblastAdapter({
    getRuntime: () => ({
      playblastCapability: () => ({
        enabled: false,
        reason: "This browser does not expose MediaRecorder",
      }),
    }),
  });
  const availability = model3DPrevisAvailability(
    document,
    "playblast",
    unsupportedAdapter,
  );
  assert.deepEqual(availability, {
    enabled: false,
    reason: "This browser does not expose MediaRecorder",
  });
  const unsupported = await startModel3DPrevis(
    document,
    "playblast",
    unsupportedAdapter,
    clock(),
  ).result;
  assert.equal(unsupported.status, "unsupported");
  assert.match(unsupported.disabledReason, /MediaRecorder/);

  const dofUnavailable = createModel3DPlayblastAdapter({
    getRuntime: () => ({
      playblastCapability: () => ({ enabled: true }),
      depthOfFieldCapability: () => ({
        enabled: false,
        reason: "Depth of field requires a renderable half-float color buffer",
      }),
    }),
    getDocument: () => document,
  });
  assert.deepEqual(
    model3DPrevisAvailability(document, "playblast", dofUnavailable),
    {
      enabled: false,
      reason:
        "Depth of field requires a renderable half-float color buffer",
    },
  );

  const cancelingAdapter = createModel3DPlayblastAdapter({
    getRuntime: () => ({
      playblastCapability: () => ({ enabled: true }),
      capturePlayblast: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    }),
  });
  const handle = startModel3DPrevis(
    document,
    "playblast",
    cancelingAdapter,
    clock(),
  );
  handle.cancel();
  const canceled = await handle.result;
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.progress.phase, "canceling");
});
