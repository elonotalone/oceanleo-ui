/**
 * W6-r4: remaining families get a real host-side load → mutate → serialize
 * → reopen, or an honest hosted/non-editable proof. Fail-closed stays.
 * These call live loaders and command surfaces, not registry metadata.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { inspectPdf, rotatePdfPage } from "../src/shell/media-editors/pdf-operations.ts";
import { audioSourcePersistenceAdmitted, pdfSourcePersistenceAdmitted } from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { audioCommandDefinitions } from "../src/shell/media-editors/audio-command-surface.ts";
import { keepWindowsAfterCut } from "../src/shell/media-editors/audio-transcript.ts";
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

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

// 10-23 D4：批注由 EmbedPDF 写（浏览器验收）；字节级可在 node 里跑的只剩页面整理。
test("pdf: stored bytes load, page rotation mutates, reopen keeps the rotation", async () => {
  const created = await PDFDocument.create();
  created.addPage([400, 400]);
  const original = await created.save();
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

  const rotated = await rotatePdfPage(original, 0, 90);
  const committed = stubCommit(rotated);
  assert.equal(await inspectPdf(committed.payload), 1);
  const reopened = await PDFDocument.load(committed.payload);
  assert.equal(reopened.getPage(0).getRotation().angle, 90);
});

test("audio: stored project with source is admitted; cut windows serialize; no commands while loading", () => {
  const project = {
    schema: "oceanleo.audio-project.v1",
    sourceUrl: "https://files.example.test/clip.wav",
    operations: [{ type: "gain", value: 0.8 }],
  };
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
  const windows = keepWindowsAfterCut(10, 2, 4);
  const edited = {
    ...project,
    operations: [...project.operations, { type: "cut", start: 2, end: 4, keep: windows }],
  };
  const reopened = JSON.parse(stubCommit(JSON.stringify(edited)).payload);
  assert.equal(reopened.sourceUrl, project.sourceUrl);
  assert.deepEqual(reopened.operations[1].keep, [
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ]);
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
