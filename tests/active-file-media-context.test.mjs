// Adapter contract tests, not a substitute for the real Library composition test.
import assert from "node:assert/strict";
import test from "node:test";
import { boundedAgentContent } from "../src/shell/plugin-command/bounded-agent-content.ts";
import { createChartCommandSurface } from "../src/shell/chart-editor/chart-command-surface.ts";
import { createAudioCommandSurface } from "../src/shell/media-editors/audio-command-surface.ts";
import { createModel3DCommandSurface } from "../src/shell/media-editors/model3d-command-surface.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import { guardPluginSurface } from "../src/shell/collab/adapters/visual-readonly.ts";
import { model3dAgentSource, recolorModel3DMaterial } from "../src/shell/media-editors/model3d-agent-source.ts";
import { createVideoDesigncomboAgentSurface } from "../src/shell/video-editor/designcombo/agent-command-surface.ts";
import { emptyOpenVideoProject } from "../src/shell/video-editor/designcombo/schema.ts";

const deliver = async () => {};

test("chart Agent context reads current unsaved values, not only series counts", () => {
  const editor = { loading: false, sourceReady: true, activeSeriesId: "sales", document: {
    option: { title: { text: "本月营收" }, series: [{ id: "sales", data: [13, 27] }] },
  } };
  const surface = createChartCommandSurface({ editor, deliver });
  assert.deepEqual(surface.agentContext().content.document.option.series[0].data, [13, 27]);
  editor.document.option.series[0].data[1] = 91;
  assert.equal(surface.agentContext().content.document.option.series[0].data[1], 91);
  editor.sourceReady = false;
  assert.equal(surface.agentContext().ready, false);
});

test("chart content budget prioritizes actual selected data before large styling metadata", () => {
  const editor = { loading: false, sourceReady: true, activeSeriesId: "sales", document: {
    metadata: { theme: "x".repeat(20_000) },
    option: { xAxis: { data: ["一月", "二月"] }, series: [{ id: "sales", data: [13, 27] }] },
  } };
  const context = createChartCommandSurface({ editor, deliver }).agentContext();
  assert.deepEqual(context.content.selectedSeries.data, [13, 27]);
  assert.equal(context.truncated, true);
});

test("video Agent context carries actual clip text, source placement and current selection", () => {
  const editor = { sourceReady: true, loadingSource: false, playheadMs: 1200,
    selectedClipId: "caption", selected: null,
    doc: { tracks: [{ id: "text", kind: "text", clips: [
      { id: "caption", start_ms: 500, duration_ms: 3000, text: "这是尚未保存的新字幕" },
    ] }] },
  };
  const surface = createVideoCommandSurface({ editor, deliver });
  const context = surface.agentContext();
  assert.equal(context.content.timeline.tracks[0].clips[0].text, "这是尚未保存的新字幕");
  assert.equal(context.content.selectedClipId, "caption");
  assert.match(context.note, /不能据此声称看过/);
  editor.loadingSource = true;
  assert.equal(surface.agentContext().ready, false);
});

test("3D Agent context exposes actual node/material/annotation data rather than filenames", () => {
  const editor = { modelLoaded: true, loading: false,
    selectedNode: { id: "wheel", position: [1, 2, 3] },
    sceneNodes: [{ id: "wheel", name: "前轮", visible: true }],
    materials: [{ name: "轮胎", color: "#202020" }],
    annotations: [{ text: "这里要改成红色" }],
    operationJournal: [{ kind: "transform", nodeId: "wheel" }],
  };
  const surface = createModel3DCommandSurface({ editor, deliver });
  assert.deepEqual(surface.agentContext().content.selectedNode.position, [1, 2, 3]);
  assert.equal(surface.agentContext().content.materials[0].color, "#202020");
  editor.materials[0].color = "#ff0000";
  assert.equal(surface.agentContext().content.materials[0].color, "#ff0000");
  editor.modelLoaded = false;
  assert.equal(surface.agentContext().ready, false);
});

test("audio Agent context reads current edit operations and does not pretend to transcribe", () => {
  const project = { sourceUrl: "/authorized-audio-source", operations: [{ kind: "crop", start: 1, end: 4 }] };
  const editor = { loading: false, duration: 3, currentTime: 1, selection: { start: 0, end: 2 },
    captureRecovery: () => project,
  };
  const surface = createAudioCommandSurface({ editor, deliver });
  assert.equal(surface.agentContext().content.project.operations[0].end, 4);
  assert.match(surface.agentContext().note, /不是语音转写/);
  project.operations.push({ kind: "gain", percent: 80 });
  assert.equal(surface.agentContext().content.project.operations.length, 2);
  editor.loading = true;
  assert.equal(surface.agentContext().ready, false);
});

test("bounded source excerpts remain valid JSON, explicitly truncated and credential-free", () => {
  const source = { title: "当前项目", access_token: "do-not-send", tracks: Array.from({ length: 200 }, (_, i) => ({
    id: `clip-${i}`, text: '字幕\\"\n'.repeat(2000), nested: { visible: true },
  })) };
  source.cycle = source;
  const context = boundedAgentContent(source);
  assert.equal(context.ready, true);
  assert.equal(context.truncated, true);
  const encoded = JSON.stringify(context.content);
  assert.ok(encoded.length <= 5500, `actual JSON length ${encoded.length}`);
  assert.equal(JSON.parse(encoded).title, "当前项目");
  assert.match(encoded, /clip-0/);
  assert.doesNotMatch(encoded, /do-not-send/);
  assert.match(context.note, /节选/);
  assert.equal(source.access_token, "do-not-send", "source editor data is never mutated");
});

test("view-only guard preserves current-file identity/content while still refusing mutations", async () => {
  let writes = 0;
  const context = { ready: true, kind: "text", content: "可读但不能写的当前正文" };
  const target = { artifactId: "file-a", revisionId: "rev-1", surfaceInstanceId: "surface-a" };
  const guarded = guardPluginSurface({
    editorId: "richdoc", workspaceScopeId: "workspace-a",
    describe: () => [{ id: "richdoc.write", mutates: true }], state: () => ({}),
    target: () => target, agentContext: () => context,
    run: () => { writes += 1; return { ok: true }; },
  }, true);
  assert.equal(guarded.target(), target);
  assert.equal(guarded.agentContext(), context);
  assert.equal(guarded.workspaceScopeId, "workspace-a");
  assert.equal((await guarded.run("richdoc.write", {})).ok, false);
  assert.equal(writes, 0);
});

test("pro video commands modify the same native project, not a disconnected proposal", async () => {
  let project = emptyOpenVideoProject();
  let revision = 0;
  let readOnly = false;
  const surface = createVideoDesigncomboAgentSurface({
    project: () => project, revision: () => revision, ready: () => true,
    readOnly: () => readOnly, selectedClipId: () => "",
    commit: (next) => { project = next; revision += 1; },
  });
  assert.ok(surface.describe().every((command) => command.id.startsWith("video-timeline.")));
  const added = await surface.run("video-timeline.add-caption", { text: "真实写进右侧工程的字幕", atMs: 500 });
  assert.equal(added.ok, true, added.message);
  assert.equal(revision, 1);
  const caption = Object.values(project.clips).find((clip) => clip.text === "真实写进右侧工程的字幕");
  assert.ok(caption);
  assert.match(JSON.stringify(surface.agentContext().content), /真实写进右侧工程的字幕/);
  readOnly = true;
  assert.equal((await surface.run("video-timeline.delete-clip", { clipId: caption.id })).ok, false);
  assert.equal(revision, 1);
  readOnly = false;
  assert.equal((await surface.run("video-timeline.delete-clip", { clipId: caption.id })).ok, true);
  assert.equal(Object.values(project.clips).some((clip) => clip.text === caption.text), false);
});

test("3D next context reads source nodes/materials and rejects malformed or unavailable bytes", () => {
  const json = { asset: { version: "2.0" }, nodes: [{ name: "车门", translation: [1, 2, 3] }],
    materials: [{ name: "车漆", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }] };
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const context = model3dAgentSource(bytes.buffer, "gltf", { selectedNodeName: "车门" });
  assert.equal(context.ready, true);
  assert.equal(context.content.nodes[0].name, "车门");
  assert.deepEqual(context.content.materials[0].pbrMetallicRoughness.baseColorFactor, [1, 0, 0, 1]);
  assert.equal(model3dAgentSource(null, "glb", {}).ready, false);
  assert.equal(model3dAgentSource(new ArrayBuffer(10), "glb", {}).ready, false);
});

test("3D material mutation preserves the same GLB binary payload and unrelated source fields", () => {
  const source = { asset: { version: "2.0" }, extras: { important: "保留原工程信息" },
    nodes: [{ name: "车门", mesh: 0 }],
    materials: [{ name: "车漆", pbrMetallicRoughness: { metallicFactor: 0.7, baseColorFactor: [1, 1, 1, 0.5] } }] };
  const json = new TextEncoder().encode(JSON.stringify(source));
  const padded = Math.ceil(json.length / 4) * 4;
  const input = new Uint8Array(20 + padded + 16);
  const header = new DataView(input.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, input.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  input.fill(32, 20, 20 + padded);
  input.set(json, 20);
  const tail = new Uint8Array([8, 0, 0, 0, 66, 73, 78, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  input.set(tail, 20 + padded);
  const before = input.slice();
  const result = recolorModel3DMaterial(input.buffer, "glb", 0, "#ff0000");
  assert.equal(result.ok, true, result.reason);
  const output = new Uint8Array(result.bytes);
  assert.deepEqual(output.slice(-16), tail, "geometry/buffer chunk is byte-for-byte unchanged");
  const outputLength = new DataView(result.bytes).getUint32(12, true);
  const after = JSON.parse(new TextDecoder().decode(output.slice(20, 20 + outputLength)));
  assert.deepEqual(after.materials[0].pbrMetallicRoughness.baseColorFactor, [1, 0, 0, 0.5]);
  assert.equal(after.materials[0].pbrMetallicRoughness.metallicFactor, 0.7);
  assert.deepEqual(after.extras, source.extras);
  assert.deepEqual(after.nodes, source.nodes);
  assert.deepEqual(input, before, "pre-review/source bytes are not mutated in place");
  assert.equal(recolorModel3DMaterial(input.buffer, "glb", 99, "#ff0000").ok, false);
  assert.equal(recolorModel3DMaterial(input.buffer, "glb", 0, "red").ok, false);
});
