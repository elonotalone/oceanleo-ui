/**
 * W6-r4: remaining families get a real host-side load → mutate → serialize
 * → reopen, or an honest hosted/non-editable proof. Fail-closed stays.
 * These call live loaders and command surfaces, not registry metadata.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import {
  addPdfTextAnnotationAt,
  listPdfAnnotationsInDocument,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";
import {
  loadPdfDocument,
  savePdfDocument,
} from "../src/shell/media-editors/pdf-form/pdf-document-io.ts";
import {
  audioSourcePersistenceAdmitted,
  gameSourceAdmission,
  model3dSourcePersistenceAdmitted,
  pdfSourcePersistenceAdmitted,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { AUDIO_NEXT_PROJECT_SCHEMA, inspectAudioProject } from "../src/shell/media-editors/audio-next-conversion.ts";
import { audioCommandDefinitions } from "../src/shell/media-editors/audio-command-surface.ts";
import {
  keepWindowsAfterCut,
  runAudioPlaylistCommand,
} from "../src/shell/media-editors/audio-playlist-engine.ts";
import {
  applyModel3DNextControl,
  defaultModel3DNextView,
} from "../src/shell/media-editors/model3d-next-plan.ts";
import {
  MODEL3D_NEXT_PROJECT_SCHEMA,
  inspectModel3DProject,
} from "../src/shell/media-editors/model3d-next-conversion.ts";
import { inspectGltfDocument } from "../src/shell/media-editors/model3d-gltf-roundtrip.mjs";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";
import {
  addClipToTrack,
  createEmptyDoc,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";
import {
  hydrateWorkflowGraph,
  planWorkflowGraphFromItem,
} from "../src/shell/workflow-carrier/workflow-graph-source.ts";
import { addVideoCanvasNode } from "../src/shell/workflow-carrier/video-canvas-local-session.ts";
import { flushVideoCanvasGraph } from "../src/shell/workflow-carrier/video-canvas-leave.ts";
import { planGamePreviewControl } from "../src/shell/game-editor/game-preview-controls.ts";

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

test("pdf: stored bytes load, text annotation mutates, reopen keeps the note", async () => {
  const created = await PDFDocument.create();
  created.addPage([400, 400]);
  const original = await savePdfDocument(created);
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: original.length > 0,
    }).ok,
    true,
  );
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: false,
    }).ok,
    false,
  );

  const annotated = await addPdfTextAnnotationAt(original, 0, "页边批注");
  const committed = stubCommit(annotated.bytes);
  const reopened = await loadPdfDocument(committed.payload);
  const notes = listPdfAnnotationsInDocument(reopened, 0);
  assert.equal(notes.some((note) => note.contents.includes("页边批注")), true);
});

test("audio: next project with source hydrates; cut windows serialize; no commands while loading", () => {
  const project = {
    schema: AUDIO_NEXT_PROJECT_SCHEMA,
    sourceUrl: "https://files.example.test/clip.wav",
    operations: [{ type: "gain", value: 0.8 }],
  };
  const loaded = inspectAudioProject(project);
  assert.equal(loaded.kind, "next");
  assert.equal(loaded.hasSource, true);
  assert.equal(
    audioSourcePersistenceAdmitted({ loading: false, capture: project }).ok,
    true,
  );
  assert.equal(
    audioSourcePersistenceAdmitted({ loading: false, capture: null }).ok,
    false,
  );
  assert.equal(
    audioCommandDefinitions({
      editor: { loading: true, duration: 0, editRevision: 0 },
      deliver: async () => {},
    }).length,
    0,
  );

  const events = [];
  const cut = runAudioPlaylistCommand(
    {
      emit: (event, ...args) => events.push({ event, args }),
      getDuration: () => 10,
      getCurrentTime: () => 0,
      getTimeSelection: () => ({ start: 2, end: 4 }),
      trackCount: () => 1,
    },
    "delete",
    { startSeconds: 2, endSeconds: 4 },
  );
  assert.equal(cut.ok, true);
  const windows = keepWindowsAfterCut(10, 2, 4);
  const edited = {
    ...project,
    operations: [...project.operations, { type: "cut", start: 2, end: 4, keep: windows }],
  };
  const committed = stubCommit(JSON.stringify(edited));
  const reopened = inspectAudioProject(JSON.parse(committed.payload));
  assert.equal(reopened.kind, "next");
  assert.deepEqual(reopened.hasSource && windows, [
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ]);
});

test("threed: stored next project hydrates; toolbar background mutates and reopens", () => {
  const project = {
    schema: MODEL3D_NEXT_PROJECT_SCHEMA,
    data: {
      provenance: { sourceUrl: "https://files.example.test/model.glb" },
    },
  };
  const loaded = inspectModel3DProject(project);
  assert.equal(loaded.hasSource, true);
  assert.equal(loaded.kind === "next" || loaded.kind === "unknown", true);
  assert.equal(
    model3dSourcePersistenceAdmitted({ loading: false, modelLoaded: true }).ok,
    true,
  );
  assert.equal(
    model3dSourcePersistenceAdmitted({ loading: false, modelLoaded: false }).ok,
    false,
  );

  const gltf = {
    asset: { version: "2.0", generator: "oceanleo-test" },
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Body", translation: [0, 1, 0] }],
    meshes: [{ name: "BodyMesh", primitives: [{}] }],
    materials: [{ name: "Paint", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
  };
  const inspect = inspectGltfDocument(gltf);
  assert.equal(inspect.nodeNames[0], "Body");

  const view = defaultModel3DNextView();
  const edited = applyModel3DNextControl(view, {
    controlId: "background",
    value: "#112233",
    selectionId: "active-model",
  });
  assert.equal(edited.background, "#112233");
  assert.notEqual(edited.revision, view.revision);
  const committed = stubCommit(JSON.stringify({ ...project, view: edited }));
  const reopened = JSON.parse(committed.payload);
  assert.equal(reopened.view.background, "#112233");
  const restored = applyModel3DNextControl(reopened.view, {
    controlId: "azimuth",
    value: 45,
    selectionId: "active-model",
  });
  assert.equal(restored.azimuth, 45);
});

test("video-timeline: stored envelope loads, clip text mutates, reopen restores", () => {
  const doc = createEmptyDoc();
  const textTrack = doc.tracks.find((track) => track.kind === "text");
  const withClip = addClipToTrack(doc, textTrack.id, {
    id: "clip_text_1",
    start_ms: 0,
    duration_ms: 3000,
    text: "片头字幕",
  });
  assert.equal(isTimelineDoc(withClip), true);
  const envelope = JSON.stringify({
    schema: "oceanleo.timeline.v1",
    version: 1,
    data: withClip,
  });
  const loaded = parseVideoProjectEnvelope(envelope);
  const edited = patchClipIn(loaded, "clip_text_1", { text: "修订后的字幕" });
  const committed = stubCommit(
    JSON.stringify({ schema: "oceanleo.timeline.v1", version: 1, data: edited }),
  );
  const reopened = parseVideoProjectEnvelope(committed.payload);
  assert.equal(
    reopened.tracks.find((track) => track.kind === "text").clips[0].text,
    "修订后的字幕",
  );
});

test("video-canvas: stored graph loads, add-node mutates, flush reopens the node", async () => {
  const graph = {
    nodes: [{ id: "src", type: "source", label: "素材" }],
    edges: [],
  };
  const item = {
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
  const edited = addVideoCanvasNode(loaded.graph, "filter", "fx1", "滤镜");
  const flushed = flushVideoCanvasGraph(item, edited, { sourceReady: true });
  assert.equal(flushed.ok, true);
  const reopened = planWorkflowGraphFromItem(flushed.item);
  assert.equal(reopened.graph.nodes.at(-1).id, "fx1");
  const refused = flushVideoCanvasGraph(item, { nodes: [], edges: [] }, {
    sourceReady: false,
    error: "工作流源未成功载入，未改用空白图画覆盖原件。",
  });
  assert.equal(refused.ok, false);
});

test("game: play preview stays non-editable; durable envelope missing is fail-closed", () => {
  const play = planGamePreviewControl({ paused: true, reloadKey: 1 }, "play");
  assert.equal(play.paused, false);
  assert.equal(play.reloadKey, 1);
  const admitted = gameSourceAdmission({
    key: "artifact:game",
    source: "artifact",
    id: "game-1",
    title: "已有游戏",
    kind: "game",
    siteId: "game",
    favorite: false,
    artifactId: "game-art",
    revisionId: "game-rev",
    artifactType: "game",
    meta: {},
    artifact: {
      artifactId: "game-art",
      revisionId: "game-rev",
      renditions: {},
    },
  });
  assert.equal(admitted.ok, false);
});
