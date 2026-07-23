import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL3D_DIRECTOR_COMMAND_REGISTRY,
  applyModel3DDirectorCommand,
  createModel3DDirectorDocument,
  model3DFovForLens,
  model3DLensForFov,
  model3DPrevisAvailability,
  normalizeModel3DDirectorDocument,
  startModel3DPrevis,
} from "../src/shell/media-editors/model3d-director.ts";
import {
  normalizeModel3DProjectRecovery,
} from "../src/shell/media-editors/model3d-project.ts";
import {
  DEFAULT_MODEL3D_VIEW,
} from "../src/shell/media-editors/model3d-workbench-defaults.ts";

function clock() {
  let sequence = 0;
  return {
    now: () => "2026-07-23T13:00:00.000Z",
    makeId: (prefix) => `${prefix}-${++sequence}`,
  };
}

function createBoundDirector() {
  const testClock = clock();
  let director = createModel3DDirectorDocument("scene-main", testClock);
  director = applyModel3DDirectorCommand(
    director,
    {
      id: "bind-scene",
      scene: {
        id: "scene-main",
        name: "Main Scene",
        sourceAssetId: "asset-model",
        sourceRevisionId: "revision-model-7",
      },
    },
    testClock,
  );
  director = applyModel3DDirectorCommand(
    director,
    {
      id: "create-shot",
      shot: {
        id: "shot-a",
        takeId: "take-a1",
        name: "Opening",
        startMs: 0,
        durationMs: 5000,
      },
    },
    testClock,
  );
  return { director, testClock };
}

test("3D director registry exposes document and honest capture semantics", () => {
  assert.deepEqual(
    MODEL3D_DIRECTOR_COMMAND_REGISTRY.map((entry) => entry.id),
    [
      "bind-scene",
      "create-shot",
      "remove-shot",
      "create-take",
      "select-take",
      "set-camera",
      "set-lighting",
      "set-pose",
      "upsert-keyframe",
      "remove-keyframe",
      "capture-screenshot",
      "capture-playblast",
    ],
  );
  const screenshot = MODEL3D_DIRECTOR_COMMAND_REGISTRY.find(
    (entry) => entry.id === "capture-screenshot",
  );
  const playblast = MODEL3D_DIRECTOR_COMMAND_REGISTRY.find(
    (entry) => entry.id === "capture-playblast",
  );
  assert.equal(screenshot.requiresRenderer, false);
  assert.equal(playblast.requiresRenderer, true);
});

test("camera FOV, lens, aperture, lighting and pose commands validate immutably", () => {
  const { director: initial, testClock } = createBoundDirector();
  let director = applyModel3DDirectorCommand(
    initial,
    {
      id: "set-camera",
      shotId: "shot-a",
      patch: { fovDegrees: 60, apertureFStop: 4 },
      authority: "fov",
    },
    testClock,
  );
  let shot = director.shots[0];
  assert.equal(shot.camera.fovDegrees, 60);
  assert.ok(Math.abs(shot.camera.focalLengthMm - model3DLensForFov(60)) < 1e-9);
  assert.equal(shot.camera.apertureFStop, 4);
  assert.equal(initial.shots[0].camera.apertureFStop, 2.8);

  director = applyModel3DDirectorCommand(
    director,
    {
      id: "set-camera",
      shotId: "shot-a",
      patch: { focalLengthMm: 85 },
      authority: "lens",
    },
    testClock,
  );
  shot = director.shots[0];
  assert.equal(shot.camera.focalLengthMm, 85);
  assert.ok(Math.abs(shot.camera.fovDegrees - model3DFovForLens(85)) < 1e-9);

  assert.throws(
    () =>
      applyModel3DDirectorCommand(
        director,
        {
          id: "set-camera",
          shotId: "shot-a",
          patch: { fovDegrees: 180 },
        },
        testClock,
      ),
    /field of view/,
  );
  assert.throws(
    () =>
      applyModel3DDirectorCommand(
        director,
        {
          id: "set-camera",
          shotId: "shot-a",
          patch: { apertureFStop: 0.5 },
        },
        testClock,
      ),
    /aperture/,
  );

  director = applyModel3DDirectorCommand(
    director,
    {
      id: "set-lighting",
      shotId: "shot-a",
      lighting: {
        environmentUrl: "https://cdn.example/studio.hdr",
        environmentIntensity: 1.5,
        exposure: 1.2,
        lights: [
          {
            id: "key-light",
            kind: "spot",
            color: "#ffeecc",
            intensity: 1200,
            transform: {
              position: [3, 4, 5],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          },
        ],
      },
    },
    testClock,
  );
  director = applyModel3DDirectorCommand(
    director,
    {
      id: "set-pose",
      shotId: "shot-a",
      takeId: "take-a1",
      pose: {
        id: "hero-pose",
        nodeId: "node-hero",
        nodePath: "Scene/Hero",
        transform: {
          position: [1, 2, 3],
          rotation: [0, 0.5, 0],
          scale: [1, 1, 1],
        },
      },
    },
    testClock,
  );
  assert.equal(director.shots[0].lighting.lights[0].kind, "spot");
  assert.equal(director.shots[0].takes[0].poses[0].nodePath, "Scene/Hero");
  assert.equal(Object.isFrozen(director.shots[0].camera), true);
  assert.equal(Object.isFrozen(director.shots[0].takes[0].poses), true);
});

test("motion path keyframes are bounded, unique by time, ordered, and durable", () => {
  const { director: initial, testClock } = createBoundDirector();
  const camera = initial.shots[0].camera;
  const keyframe = (id, timeMs, x) => ({
    id,
    timeMs,
    transform: {
      ...camera.transform,
      position: [x, 1.5, 5],
    },
    target: camera.target,
    fovDegrees: camera.fovDegrees,
    focalLengthMm: camera.focalLengthMm,
    apertureFStop: camera.apertureFStop,
    easing: "ease-in-out",
  });
  let director = applyModel3DDirectorCommand(
    initial,
    {
      id: "upsert-keyframe",
      shotId: "shot-a",
      takeId: "take-a1",
      keyframe: keyframe("key-3", 3000, 3),
    },
    testClock,
  );
  director = applyModel3DDirectorCommand(
    director,
    {
      id: "upsert-keyframe",
      shotId: "shot-a",
      takeId: "take-a1",
      keyframe: keyframe("key-1", 1000, 1),
    },
    testClock,
  );
  director = applyModel3DDirectorCommand(
    director,
    {
      id: "upsert-keyframe",
      shotId: "shot-a",
      takeId: "take-a1",
      keyframe: keyframe("key-replace", 1000, 2),
    },
    testClock,
  );
  assert.deepEqual(
    director.shots[0].takes[0].motionPath.map((entry) => [
      entry.id,
      entry.timeMs,
    ]),
    [
      ["key-replace", 1000],
      ["key-3", 3000],
    ],
  );
  const reopened = normalizeModel3DDirectorDocument(
    JSON.parse(JSON.stringify(director)),
    "scene-fallback",
  );
  assert.deepEqual(reopened, director);
  assert.throws(
    () =>
      applyModel3DDirectorCommand(
        director,
        {
          id: "upsert-keyframe",
          shotId: "shot-a",
          takeId: "take-a1",
          keyframe: keyframe("late", 6000, 6),
        },
        testClock,
      ),
    /keyframe time/,
  );
});

test("director bindings survive the real model3d project sidecar recovery", () => {
  const { director } = createBoundDirector();
  const checkpointUrl = "https://cdn.example/scene.glb";
  const recovered = normalizeModel3DProjectRecovery(
    {
      checkpointUrl,
      operations: [],
      view: {
        ...DEFAULT_MODEL3D_VIEW,
        sourceUrl: checkpointUrl,
        director,
      },
    },
    {
      ...DEFAULT_MODEL3D_VIEW,
      sourceUrl: checkpointUrl,
    },
    checkpointUrl,
  );
  assert.deepEqual(recovered.view.director, director);
  assert.equal(recovered.view.director.scene.sourceRevisionId, "revision-model-7");
  assert.equal(recovered.view.director.activeShotId, "shot-a");
  assert.equal(recovered.view.director.activeTakeId, "take-a1");
});

test("screenshot and playblast receipts pin scene, shot, take and revision", async () => {
  const { director } = createBoundDirector();
  const screenshot = await startModel3DPrevis(
    director,
    "screenshot",
    {
      id: "three-screenshot",
      availability: (kind) => ({
        enabled: kind === "screenshot",
        ...(kind === "playblast"
          ? { reason: "No playblast executor is configured" }
          : {}),
      }),
      async capture(_kind, _document, context) {
        context.onProgress({ phase: "capturing", progress: 0.5 });
        context.onProgress({ phase: "uploading", progress: 0.9 });
        return {
          url: "https://cdn.example/previs.png",
          mimeType: "image/png",
          width: 1280,
          height: 720,
        };
      },
    },
    clock(),
  ).result;
  assert.equal(screenshot.status, "succeeded");
  assert.equal(screenshot.sceneId, "scene-main");
  assert.equal(screenshot.shotId, "shot-a");
  assert.equal(screenshot.takeId, "take-a1");
  assert.equal(screenshot.directorRevision, director.revision);
  assert.equal(screenshot.media.mimeType, "image/png");
  assert.equal(screenshot.progress.progress, 1);

  const playblast = await startModel3DPrevis(
    director,
    "playblast",
    {
      id: "real-playblast-proof",
      availability: () => ({ enabled: true }),
      async capture(_kind, _document, context) {
        context.onProgress({ phase: "encoding", progress: 0.7 });
        return {
          url: "https://cdn.example/playblast.mp4",
          mimeType: "video/mp4",
          durationMs: 5000,
          fps: 24,
          frameCount: 120,
        };
      },
    },
    clock(),
  ).result;
  assert.equal(playblast.status, "succeeded");
  assert.deepEqual(
    {
      durationMs: playblast.media.durationMs,
      fps: playblast.media.fps,
      frameCount: playblast.media.frameCount,
    },
    { durationMs: 5000, fps: 24, frameCount: 120 },
  );
});

test("missing renderer and cancellation behavior remain explicit", async () => {
  const { director } = createBoundDirector();
  const availability = model3DPrevisAvailability(
    director,
    "playblast",
    null,
  );
  assert.equal(availability.enabled, false);
  assert.equal(
    availability.reason,
    "No playblast executor is configured",
  );
  const unsupported = await startModel3DPrevis(
    director,
    "playblast",
    null,
    clock(),
  ).result;
  assert.equal(unsupported.status, "unsupported");
  assert.equal(
    unsupported.disabledReason,
    "No playblast executor is configured",
  );

  let cancelCalls = 0;
  const handle = startModel3DPrevis(
    director,
    "playblast",
    {
      id: "cancel-playblast",
      availability: () => ({ enabled: true }),
      capture(_kind, _document, context) {
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
      async cancel() {
        cancelCalls += 1;
      },
    },
    clock(),
  );
  handle.cancel();
  const canceled = await handle.result;
  assert.equal(canceled.status, "canceled");
  assert.equal(cancelCalls, 1);
});
