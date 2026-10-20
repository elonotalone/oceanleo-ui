/**
 * W6-r4: remaining host-side families load stored source, honor a shown
 * command, serialize the mutation, and reopen it. Missing/unreadable source
 * stays fail-closed. Game play preview has no host edit model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

import {
  audioSourcePersistenceAdmitted,
  gameSourceAdmission,
  model3dSourcePersistenceAdmitted,
  pdfSourcePersistenceAdmitted,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { buildPdfCommandSurface } from "../src/shell/doc-editors/doc-family-commands.ts";
import {
  addBlankPdfPage,
  createBlankPdf,
  inspectPdf,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";
import { loadInitialPdfSource } from "../src/shell/media-editors/pdf-source.ts";
import {
  applyAudioSampleOperation,
  isAudioEditOperation,
} from "../src/shell/media-editors/audio-operations.ts";
import { validAudioOperationProject } from "../src/shell/media-editors/audio-checkpoint.mjs";
import { createAudioCommandSurface } from "../src/shell/media-editors/audio-command-surface.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import {
  addClipToTrack,
  createEmptyDoc,
  docDurationMs,
  findClip,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";
import {
  VIDEO_TIMELINE_MISSING_MEDIA,
  VIDEO_TIMELINE_MISSING_PROJECT,
  hydrateVideoTimelineDoc,
  planVideoTimelineSource,
  serializeVideoProjectEnvelope,
} from "../src/shell/video-editor/video-timeline-source.ts";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";
import { createModel3DCommandSurface } from "../src/shell/media-editors/model3d-command-surface.ts";
import {
  DEFAULT_MODEL3D_VIEW,
  isModel3DSourceItem,
} from "../src/shell/media-editors/model3d-workbench-defaults.ts";
import { normalizeModel3DRecovery } from "../src/shell/media-editors/model3d-project.ts";
import {
  applyVideoCanvasCommand,
  createVideoCanvasCommandSurface,
} from "../src/shell/workflow-carrier/video-canvas-command-surface.ts";
import {
  hydrateWorkflowGraph,
  planWorkflowGraphFromItem,
} from "../src/shell/workflow-carrier/workflow-graph-source.ts";
import {
  exportVideoCanvasProject,
  parseVideoCanvasProject,
} from "../src/shell/workflow-carrier/video-canvas-local-session.ts";
import { flushVideoCanvasGraph } from "../src/shell/workflow-carrier/video-canvas-leave.ts";
import {
  buildGameEnvelope,
  inspectGameDraft,
  readGameEnvelope,
} from "../src/shell/game-editor/game-source.ts";
import { createGameAgentSurface } from "../src/shell/game-editor/game-agent-gate.ts";
import { planGamePreviewControl } from "../src/shell/game-editor/game-preview-controls.ts";
import { registerGamePreviewHost } from "../src/shell/game-editor/preview-host.ts";

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

async function pageRotation(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(bytes);
  return document.getPage(pageIndex).getRotation().angle;
}

function livePdfEditor(initialBytes, pageCount) {
  let bytes = initialBytes;
  const editor = {
    loading: false,
    processing: false,
    pageCount,
    pageNumber: 1,
    rotation: 0,
    zoom: 100,
    readerState: "paged",
    textLayer: { present: true },
    annotations: [],
    dirty: false,
    error: "",
    failure: null,
    editRevision: 0,
    currentBytes: () => bytes,
    goToPage(page) {
      editor.pageNumber = page;
    },
    async rotateCurrentPage(direction = 1) {
      bytes = await rotatePdfPage(bytes, editor.pageNumber - 1, direction * 90);
      editor.rotation = ((editor.rotation + direction * 90) % 360 + 360) % 360;
      editor.editRevision += 1;
      editor.dirty = true;
    },
    async extractPages() {},
    async deleteCurrentPage() {},
    async addBlankPage() {},
    async movePage() {},
    async saveCopy() {
      return null;
    },
    searchFullText: () => [],
  };
  return editor;
}

function liveAudioEditor(samples, sourceUrl) {
  let current = {
    sampleRate: samples.sampleRate,
    channels: samples.channels.map((channel) => Float32Array.from(channel)),
  };
  const operations = [];
  const editor = {
    loading: false,
    error: "",
    dirty: false,
    editRevision: 0,
    duration: current.channels[0].length / current.sampleRate,
    currentTime: 0,
    playing: false,
    selection: null,
    fadeDuration: 0.2,
    gain: 100,
    samples: () => current,
    project: () => ({ sourceUrl, operations: [...operations] }),
    applyFade(edge) {
      const operation = {
        type: "fade",
        edge,
        duration: editor.fadeDuration,
      };
      current = applyAudioSampleOperation(current, operation);
      operations.push(operation);
      editor.editRevision += 1;
      editor.dirty = true;
    },
    async editRange() {
      return false;
    },
    async applyGainRange() {
      return false;
    },
    seekTo(seconds) {
      editor.currentTime = seconds;
    },
  };
  return editor;
}

function liveVideoEditor(initialDoc) {
  let doc = structuredClone(initialDoc);
  const editor = {
    loadingSource: false,
    sourceReady: true,
    exporting: false,
    error: "",
    dirty: false,
    editRevision: 0,
    playheadMs: 0,
    playing: false,
    selectedClipId: "",
    get doc() {
      return doc;
    },
    get durationMs() {
      return docDurationMs(doc);
    },
    patchClip(clipId, patch) {
      doc = patchClipIn(doc, clipId, patch);
      editor.editRevision += 1;
      editor.dirty = true;
    },
    deleteClip() {
      return false;
    },
    cutRange() {
      return false;
    },
    setClipSpeed() {},
    async addMediaUrl() {},
    seek(ms) {
      editor.playheadMs = ms;
    },
  };
  return editor;
}

function liveModel3DEditor(initialView) {
  const view = { ...initialView };
  const editor = {
    loading: false,
    modelLoaded: true,
    downloading: false,
    capturing: false,
    saving: false,
    dirty: false,
    editRevision: 0,
    sourceFormat: "glb",
    get azimuth() {
      return view.azimuth;
    },
    get elevation() {
      return view.elevation;
    },
    get zoom() {
      return view.zoom;
    },
    get autoRotate() {
      return view.autoRotate;
    },
    background: view.background,
    animations: [],
    animationPlaying: false,
    sceneNodes: [{ id: "mesh-1" }],
    materials: [],
    annotations: [],
    view: () => ({ ...view }),
    setOrbit(azimuth, elevation) {
      view.azimuth = azimuth;
      view.elevation = elevation;
      editor.editRevision += 1;
      editor.dirty = true;
    },
    setZoom(percent) {
      view.zoom = percent;
      editor.editRevision += 1;
    },
    resetCamera() {},
    setAutoRotate(enabled) {
      view.autoRotate = enabled;
      editor.editRevision += 1;
    },
    selectAnimation() {},
    setAnimationPlaying() {},
  };
  return editor;
}

function durableGame(item = {}) {
  return {
    key: "artifact:game",
    source: "artifact",
    id: "game-1",
    title: "已有游戏",
    kind: "game",
    artifactId: "game-art",
    revisionId: "game-rev",
    artifactType: "game",
    meta: {},
    artifact: {
      artifactId: "game-art",
      revisionId: "game-rev",
      renditions: {},
    },
    ...item,
  };
}

test("pdf: stored bytes hydrate, rotate command mutates, reopen restores rotation", async () => {
  let bytes = await createBlankPdf();
  bytes = await addBlankPdfPage(bytes, 0);
  const pageCount = await inspectPdf(bytes);
  assert.equal(pageCount, 2);
  assert.equal(await pageRotation(bytes, 0), 0);

  const editor = livePdfEditor(bytes, pageCount);
  const surface = buildPdfCommandSurface(editor, {
    download: async () => "",
  });
  assert.ok(surface.describe().some((spec) => spec.id === "pdf.rotate-page"));
  const result = await surface.run("pdf.rotate-page", { direction: "cw" });
  assert.equal(result.ok, true);

  const mutated = editor.currentBytes();
  assert.equal(await pageRotation(mutated, 0), 90);
  const committed = stubCommit(mutated);
  const reopenedCount = await inspectPdf(committed.payload);
  assert.equal(reopenedCount, 2);
  assert.equal(await pageRotation(committed.payload, 0), 90);

  await assert.rejects(
    () =>
      loadInitialPdfSource({
        source: "",
        siteId: "oceanleo",
        title: "缺源 PDF",
        signal: new AbortController().signal,
        allowBlank: false,
      }),
    /缺少可验证的源文件/,
  );
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: "PDF 源未成功载入",
      hasBytes: false,
    }).ok,
    false,
  );
});

test("audio: operations journal hydrates, fade command mutates, reopen replays", async () => {
  const stored = {
    sourceUrl: "https://cdn.test/voice.wav",
    operations: [],
  };
  assert.equal(validAudioOperationProject(stored, isAudioEditOperation), true);
  const samples = {
    sampleRate: 10,
    channels: [Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])],
  };
  const editor = liveAudioEditor(samples, stored.sourceUrl);
  const surface = createAudioCommandSurface({
    editor,
    deliver: async () => {},
  });
  assert.ok(surface.describe().some((spec) => spec.id === "audio.fade"));
  const result = await surface.run("audio.fade", { edge: "in" });
  assert.equal(result.ok, true);
  const faded = editor.samples();
  assert.ok(faded.channels[0][0] < samples.channels[0][0]);

  const project = editor.project();
  assert.equal(project.operations.length, 1);
  assert.equal(project.operations[0].type, "fade");
  const committed = stubCommit(JSON.stringify(project));
  const reopened = JSON.parse(committed.payload);
  assert.equal(validAudioOperationProject(reopened, isAudioEditOperation), true);
  const replayed = reopened.operations.reduce(
    (block, operation) => applyAudioSampleOperation(block, operation),
    {
      sampleRate: samples.sampleRate,
      channels: samples.channels.map((channel) => Float32Array.from(channel)),
    },
  );
  assert.equal(replayed.channels[0][0], faded.channels[0][0]);
  assert.equal(
    audioSourcePersistenceAdmitted({ loading: false, capture: null }).ok,
    false,
  );
  assert.equal(
    validAudioOperationProject({ sourceUrl: "", operations: [{}] }, isAudioEditOperation),
    false,
  );
});

test("video-timeline: envelope hydrates, volume command mutates, reopen restores", async () => {
  const doc = createEmptyDoc();
  const videoTrack = doc.tracks.find((track) => track.kind === "video");
  const withClip = addClipToTrack(doc, videoTrack.id, {
    id: "clip_video_1",
    start_ms: 0,
    duration_ms: 4000,
    source_url: "https://cdn.test/clip.mp4",
    volume: 1,
  });
  assert.equal(isTimelineDoc(withClip), true);
  const stored = serializeVideoProjectEnvelope(withClip);
  const loaded = hydrateVideoTimelineDoc(stored);
  assert.equal(findClip(loaded, "clip_video_1").clip.volume ?? 1, 1);

  const editor = liveVideoEditor(loaded);
  const surface = createVideoCommandSurface({
    editor,
    deliver: async () => {},
  });
  assert.ok(
    surface.describe().some((spec) => spec.id === "video-timeline.set-clip-volume"),
  );
  const result = await surface.run("video-timeline.set-clip-volume", {
    clipId: "clip_video_1",
    percent: 40,
  });
  assert.equal(result.ok, true);
  assert.equal(findClip(editor.doc, "clip_video_1").clip.volume, 0.4);

  const committed = stubCommit(serializeVideoProjectEnvelope(editor.doc));
  const reopened = parseVideoProjectEnvelope(committed.payload);
  assert.equal(findClip(reopened, "clip_video_1").clip.volume, 0.4);

  const missingProject = planVideoTimelineSource({
    artifactId: "vid-art",
    source: "artifact",
    kind: "video",
    meta: { editor_project_schema: "oceanleo.timeline.v1" },
  });
  assert.equal(missingProject.kind, "fail");
  assert.equal(missingProject.error, VIDEO_TIMELINE_MISSING_PROJECT);

  const missingMedia = planVideoTimelineSource({
    artifactId: "vid-art",
    revisionId: "vid-rev",
    source: "artifact",
    kind: "video",
    artifactType: "video",
    artifact: { artifactId: "vid-art", revisionId: "vid-rev" },
    meta: {},
  });
  assert.equal(missingMedia.kind, "fail");
  assert.equal(missingMedia.error, VIDEO_TIMELINE_MISSING_MEDIA);

  assert.throws(
    () => parseVideoProjectEnvelope("{not-json"),
    /无法解析/,
  );
});

test("threed: view sidecar hydrates, set-view command mutates, reopen restores", async () => {
  const stored = {
    ...DEFAULT_MODEL3D_VIEW,
    sourceUrl: "https://cdn.test/model.glb",
    azimuth: 35,
    elevation: 65,
  };
  const loaded = normalizeModel3DRecovery(stored, DEFAULT_MODEL3D_VIEW);
  assert.ok(loaded);
  assert.equal(loaded.azimuth, 35);

  const editor = liveModel3DEditor(loaded);
  const surface = createModel3DCommandSurface({
    editor,
    deliver: async () => {},
  });
  assert.ok(surface.describe().some((spec) => spec.id === "threed.set-view"));
  const result = await surface.run("threed.set-view", {
    azimuth: 120,
    elevation: 20,
  });
  assert.equal(result.ok, true);
  assert.equal(editor.azimuth, 120);
  assert.equal(editor.elevation, 20);

  const committed = stubCommit(JSON.stringify(editor.view()));
  const reopened = normalizeModel3DRecovery(
    JSON.parse(committed.payload),
    DEFAULT_MODEL3D_VIEW,
  );
  assert.equal(reopened.azimuth, 120);
  assert.equal(reopened.elevation, 20);

  assert.equal(
    model3dSourcePersistenceAdmitted({ loading: false, modelLoaded: false }).ok,
    false,
  );
  assert.equal(
    isModel3DSourceItem({
      kind: "threed",
      url: "https://cdn.test/sky.hdr",
      meta: { subtype: "hdri" },
    }),
    false,
  );
});

test("video-canvas: graph hydrates, add-node command mutates, flush reopens", async () => {
  const graph = {
    nodes: [
      {
        id: "src",
        kind: "source",
        label: "素材",
        x: 0,
        y: 0,
        ports: { outputs: [{ name: "out", dataType: "video" }] },
      },
    ],
    edges: [],
  };
  const item = {
    key: "local:wf",
    id: "wf-1",
    title: "流程图",
    kind: "video_canvas",
    meta: { graph },
  };
  const plan = planWorkflowGraphFromItem(item);
  assert.equal(plan.kind, "ready");
  const loaded = await hydrateWorkflowGraph(plan, async () => {
    throw new Error("inline graph must not fetch");
  });
  assert.equal(loaded.ok, true);

  let current = loaded.graph;
  let revision = 0;
  const surface = createVideoCanvasCommandSurface({
    graph: () => current,
    revision: () => revision,
    sourceReady: () => true,
    sourceError: () => "",
    apply(next) {
      current = next;
      revision += 1;
    },
  });
  assert.ok(surface.describe().some((spec) => spec.id === "workflow.add-node"));
  const ran = await surface.run("workflow.add-node", { label: "滤镜" });
  assert.equal(ran.ok, true);
  assert.equal(current.nodes.length, 2);
  assert.equal(current.nodes.at(-1).label, "滤镜");

  const applied = applyVideoCanvasCommand(current, "workflow.add-node", {
    label: "第二节点",
  }, revision);
  assert.equal(applied.ok, true);
  const flushed = flushVideoCanvasGraph(item, applied.graph, { sourceReady: true });
  assert.equal(flushed.ok, true);
  const committed = stubCommit(exportVideoCanvasProject(flushed.item.meta.graph));
  const reopened = parseVideoCanvasProject(JSON.parse(committed.payload));
  assert.equal(reopened.nodes.length, 3);
  assert.equal(reopened.nodes.at(-1).label, "第二节点");

  const durableMissing = planWorkflowGraphFromItem({
    key: "artifact:wf",
    source: "artifact",
    id: "wf-2",
    title: "库里的流程",
    artifactId: "wf-art",
    revisionId: "wf-rev",
    artifactType: "workflow",
    meta: {},
    artifact: { artifactId: "wf-art", revisionId: "wf-rev", renditions: {} },
  });
  assert.equal(durableMissing.kind, "fail");
  const refused = flushVideoCanvasGraph(item, { nodes: [], edges: [] }, {
    sourceReady: false,
    error: "工作流源未成功载入，未改用空白图画覆盖原件。",
  });
  assert.equal(refused.ok, false);
});

test("game play is hosted-iframe-only: fail-closed, no command surface, preview host is the adopted API", () => {
  const missing = gameSourceAdmission(durableGame());
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未改用空白稿覆盖原件/);

  const play = readFileSync("src/shell/advanced-routes/GameRoute.tsx", "utf8");
  assert.doesNotMatch(play, /usePluginCommandSurface/);
  assert.match(play, /registerGamePreviewHost/);
  assert.match(play, /useGamePreviewHost/);
  assert.match(play, /PreviewHost/);

  let received = null;
  registerGamePreviewHost((props) => {
    received = props;
    return null;
  });
  registerGamePreviewHost(null);
  assert.equal(received, null);

  const code = readFileSync("src/shell/game-editor/GameCodeStage.tsx", "utf8");
  assert.match(code, /planGamePreviewControl/);
  const stopped = planGamePreviewControl({ paused: false, reloadKey: 2 }, "stop");
  assert.equal(stopped.paused, true);
});

test("game code: envelope hydrates and serializes; agent write parks without a token", async () => {
  const source =
    "<!doctype html><html><body><script>window.score=1</script></body></html>";
  const stored = buildGameEnvelope({
    source,
    origin: "ai",
    manifest: { engine: "v1" },
  });
  const loaded = readGameEnvelope(stored);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.envelope.source, source);
  const inspected = inspectGameDraft(loaded.envelope.source);
  assert.equal(inspected.publishable, true);

  const edited = buildGameEnvelope({
    source: source.replace("score=1", "score=9"),
    origin: loaded.envelope.origin,
    manifest: loaded.envelope.manifest,
  });
  const reopened = readGameEnvelope(edited);
  assert.equal(reopened.ok, true);
  assert.match(reopened.envelope.source, /score=9/);
  assert.equal(reopened.envelope.origin, "ai");

  assert.equal(readGameEnvelope({ origin: "ai" }).ok, false);
  assert.equal(readGameEnvelope({ source: "<html></html>" }).ok, false);

  let current = loaded.envelope.source;
  const surface = createGameAgentSurface({
    source: () => current,
    revision: () => 1,
    writeSource(next) {
      current = next;
    },
    params: () => null,
  });
  const parked = await surface.run("game.set-source", {
    source: edited.source,
  });
  assert.equal(current, loaded.envelope.source);
  assert.match(String(parked.message), /审阅|一个字/);
});
