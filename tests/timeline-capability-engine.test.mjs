import assert from "node:assert/strict";
import test from "node:test";

import {
  TIMELINE_COMMAND_REGISTRY,
  TIMELINE_DOCUMENT_VERSION,
  applyTimelineCommand,
  createTimelineCompositeKernel,
  createTimelineKernelState,
  startTimelineRender,
} from "../src/shell/video-editor/timeline-capability-engine.ts";

function docFixture() {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [
      { id: "video-a", kind: "video", clips: [] },
      { id: "video-b", kind: "video", clips: [] },
      { id: "audio-a", kind: "audio", clips: [] },
      { id: "text-a", kind: "text", clips: [] },
      { id: "image-a", kind: "image", clips: [] },
    ],
  };
}

function clock() {
  let sequence = 0;
  return {
    now: () => "2026-07-23T12:00:00.000Z",
    makeId: (prefix) => `${prefix}-${++sequence}`,
  };
}

test("timeline registry names every immutable composite edit", () => {
  assert.deepEqual(
    TIMELINE_COMMAND_REGISTRY.map((entry) => entry.id),
    [
      "set-canvas",
      "add-track",
      "remove-track",
      "add-clip",
      "remove-clip",
      "move-clip",
      "trim-clip",
      "split-clip",
      "duplicate-clip",
      "patch-clip",
      "set-clip-speed",
    ],
  );
  for (const command of TIMELINE_COMMAND_REGISTRY) {
    assert.equal(command.mutates, "document");
    assert.equal(command.immutable, true);
  }
});

test("TimelineDoc is the single immutable kernel for every semantic edit", () => {
  const testClock = clock();
  let state = createTimelineKernelState(docFixture(), testClock);
  const original = state;
  const commands = [
    { id: "set-canvas", width: 1920, height: 1080, fps: 24 },
    { id: "add-track", kind: "video" },
    {
      id: "add-clip",
      trackId: "video-a",
      clip: {
        id: "clip-1",
        start_ms: 0,
        duration_ms: 2000,
        source_url: "https://cdn.example/source.mp4",
        source_duration_ms: 5000,
      },
    },
    {
      id: "patch-clip",
      clipId: "clip-1",
      patch: { brightness: 0.2, contrast: 1.3, saturation: 0.8 },
    },
    { id: "set-clip-speed", clipId: "clip-1", speed: 2 },
    {
      id: "move-clip",
      clipId: "clip-1",
      targetTrackId: "video-b",
      startMs: 500,
    },
    {
      id: "trim-clip",
      clipId: "clip-1",
      edge: "end",
      timeMs: 1200,
    },
    { id: "split-clip", clipId: "clip-1", timeMs: 800 },
    { id: "duplicate-clip", clipId: "clip-1" },
  ];
  const created = [];
  for (const command of commands) {
    const before = state;
    const result = applyTimelineCommand(state, command, testClock);
    assert.equal(result.changed, true, command.id);
    assert.equal(result.state.revision, before.revision + 1);
    assert.notEqual(result.state.doc, before.doc);
    assert.equal(Object.isFrozen(result.state.doc), true);
    assert.equal(Object.isFrozen(result.state.doc.tracks), true);
    if (result.createdClipId) created.push(result.createdClipId);
    state = result.state;
  }

  assert.equal(original.revision, 0);
  assert.equal(original.doc.width, 1280);
  assert.equal(original.doc.tracks[0].clips.length, 0);
  assert.equal(state.doc.width, 1920);
  assert.equal(state.doc.fps, 24);
  assert.ok(created.length >= 2);

  const duplicateId = created.at(-1);
  state = applyTimelineCommand(
    state,
    { id: "remove-clip", clipId: duplicateId },
    testClock,
  ).state;
  const addedTrack = state.doc.tracks.find(
    (track) =>
      track.kind === "video" &&
      track.id !== "video-a" &&
      track.id !== "video-b",
  );
  assert.ok(addedTrack);
  state = applyTimelineCommand(
    state,
    { id: "remove-track", trackId: addedTrack.id },
    testClock,
  ).state;
  assert.equal(state.doc.tracks.some((track) => track.id === addedTrack.id), false);
});

test("timeline validation fails closed before a version can be saved or rendered", () => {
  assert.throws(
    () =>
      createTimelineKernelState({
        ...docFixture(),
        tracks: [
          {
            id: "video-a",
            kind: "video",
            clips: [
              {
                id: "unsafe",
                start_ms: 0,
                duration_ms: 1000,
                source_url: "data:video/mp4;base64,AAAA",
              },
            ],
          },
        ],
      }),
    /Invalid TimelineDoc/,
  );
  const state = createTimelineKernelState(docFixture());
  assert.throws(
    () =>
      applyTimelineCommand(state, {
        id: "add-clip",
        trackId: "video-a",
        clip: {
          id: "no-source",
          start_ms: 0,
          duration_ms: 1000,
        },
      }),
    /requires a source URL/,
  );
});

test("save and render adapters receive the exact same version-pinned TimelineDoc", async () => {
  const kernel = createTimelineCompositeKernel(docFixture(), clock());
  kernel.dispatch({
    id: "add-clip",
    trackId: "video-a",
    clip: {
      id: "clip-1",
      start_ms: 0,
      duration_ms: 1000,
      source_url: "https://cdn.example/source.mp4",
    },
  });
  const version = kernel.version();
  let saveVersion;
  let renderVersion;
  const saveStates = [];
  const saveHandle = kernel.save({
    id: "draft-store",
    async execute(snapshot, context) {
      saveVersion = snapshot;
      context.onProgress({ phase: "saving", progress: 0.5 });
      return {
        versionId: `version-${snapshot.revision}`,
        projectUrl: "https://cdn.example/timeline.json",
        projectSchema: "oceanleo.timeline.v1",
      };
    },
  });
  const renderHandle = kernel.render({
    id: "ffmpeg-proof",
    async execute(snapshot, context) {
      renderVersion = snapshot;
      context.setExternalRunId("render-job-1");
      context.onProgress({ phase: "queued", progress: 0.2 });
      context.onProgress({ phase: "rendering", progress: 0.7 });
      return {
        jobId: "render-job-1",
        url: "https://cdn.example/output.mp4",
        mimeType: "video/mp4",
      };
    },
    async cancel() {},
  });
  void saveStates;
  const [saved, rendered] = await Promise.all([
    saveHandle.result,
    renderHandle.result,
  ]);
  assert.equal(saveVersion, version);
  assert.equal(renderVersion, version);
  assert.equal(saveVersion.doc, renderVersion.doc);
  assert.equal(JSON.stringify(saveVersion), JSON.stringify(renderVersion));
  assert.equal(version.documentVersion, TIMELINE_DOCUMENT_VERSION);
  assert.equal(saved.status, "succeeded");
  assert.equal(saved.delivery.versionId, "version-1");
  assert.equal(rendered.status, "succeeded");
  assert.equal(rendered.externalRunId, "render-job-1");
  assert.equal(rendered.delivery.url, "https://cdn.example/output.mp4");
  assert.equal(rendered.version.revision, 1);
});

test("render cancellation reaches the adapter and returns a pinned canceled receipt", async () => {
  const kernel = createTimelineCompositeKernel(docFixture(), clock());
  const version = kernel.version();
  let canceled;
  const handle = startTimelineRender(
    {
      id: "cancel-proof",
      execute(_snapshot, context) {
        context.setExternalRunId("job-cancel");
        context.onProgress({ phase: "rendering", progress: 0.4 });
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
      async cancel(runId, externalRunId, snapshot) {
        canceled = { runId, externalRunId, snapshot };
      },
    },
    version,
  );
  handle.cancel();
  const receipt = await handle.result;
  assert.equal(receipt.status, "canceled");
  assert.equal(receipt.version, version);
  assert.equal(canceled.externalRunId, "job-cancel");
  assert.equal(canceled.snapshot, version);
  assert.equal(handle.snapshot().status, "canceled");
});

test("missing timeline render support is explicitly unavailable", async () => {
  const kernel = createTimelineCompositeKernel(docFixture(), clock());
  const receipt = await kernel.render(null).result;
  assert.equal(receipt.status, "unsupported");
  assert.match(receipt.disabledReason, /No timeline render adapter/);
  assert.equal(receipt.version.revision, 0);
});
