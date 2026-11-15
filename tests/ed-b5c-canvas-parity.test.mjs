import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { addProjectNode, createVideoProject, deriveLocalAsset, projectHead, parseVideoProject, projectSourceForStorage, runContinuityQc, updateProjectNode } from "../src/shell/video-canvas/engine/project-model.ts";
import { canvasSelectionContext, canvasSelectionDispatch } from "../src/shell/video-canvas/engine/canvas-selection-adapter.ts";
import { canvasCompositionDocument, executeCanvasCommand, commandAvailability } from "../src/shell/video-canvas/engine/command-registry.ts";
import { hydrateVideoTimelineDoc } from "../src/shell/video-editor/video-timeline-source.ts";
import { saveVideoProject } from "../src/shell/workflow-carrier/video-project-save.ts";
import { canonicalSelectionControls } from "../src/shell/edit-bar-canon.ts";
import { partitionSelectionInspectorControls } from "../src/shell/selection-inspector-groups.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const rootId = "11111111-1111-4111-8111-111111111111";
let serial = 0;
function fixture() {
  const project = createVideoProject("Canvas parity");
  const head = project.versions[project.headVersionId];
  head.scenes = [{ sceneId: "scene", title: "Scene", shotIds: ["shot", "rejected"] }];
  head.shots = ["shot", "rejected"].map((shotId) => ({ shotId, sceneId: "scene", title: shotId, intendedDurationSeconds: 3,
    storyboardId: `sb-${shotId}`, takeIds: [`take-${shotId}`], approvedTakeId: `take-${shotId}` }));
  head.storyboards = head.shots.map((shot) => ({ storyboardId: shot.storyboardId, shotId: shot.shotId, frameAssetIds: [] }));
  head.takes = head.shots.map((shot) => ({ takeId: `take-${shot.shotId}`, shotId: shot.shotId, assetId: "video",
    status: shot.shotId === "shot" ? "approved" : "rejected" }));
  project.assets.video = { assetId: "video", kind: "video", origin: "import", immutable: true, title: "Video",
    url: "https://cdn.example.test/video.mp4", durationSeconds: 3, createdAt: new Date().toISOString() };
  return project;
}
function engine(project, execute = executeCanvasCommand) {
  let selected = null;
  let epoch = 1;
  const env = { getProject: () => project, setProject: (value) => { project = value; },
    getSelectedNodeId: () => selected, setSelectedNodeId: (value) => { selected = value; epoch++; },
    getSelectionEpoch: () => epoch, getImageMode: () => "retouch", setImageMode() {},
    setStatus() {}, setWorkspaceView() {}, screenCenter: () => ({ x: 0, y: 0 }) };
  return { env, get project() { return project; }, select(id) { selected = id; epoch++; },
    context() { return canvasSelectionContext({ project, node: projectHead(project).graph.nodes.find((n) => n.nodeId === selected) || null,
      selectionEpoch: epoch, imageMode: "retouch", tt: (value) => value, availability: (id, args) => commandAvailability(id, env, args) }); },
    run(id, args = {}, incoming = {}) { return execute({ commandId: id, requestId: `canvas-parity-${++serial}`,
      projectVersionId: project.headVersionId, selectionEpoch: epoch, surface: "protocol", args, ...incoming }, env); },
    async change(id, value) {
      const context = this.context();
      const mapped = canvasSelectionDispatch({ controlId: id, value, selectionId: context.id, selectionRevision: context.revision,
        selectionEpoch: context.epoch, requestId: `canvas-style-${++serial}` }, context);
      assert.ok(mapped, id);
      const result = await this.run(mapped.commandId, mapped.args, mapped.incoming);
      assert.equal(result.status, "succeeded", result.message);
    } };
}
async function saveReopen(project) {
  let text;
  const base = { id: rootId, key: rootId, artifactId: rootId, revisionId: "r1", artifactType: "workflow", kind: "workflow", title: project.title, meta: {} };
  const outcome = await saveVideoProject({ base, doc: projectSourceForStorage(project), editRevision: projectHead(project).revision }, async (input) => {
    assert.equal(input.item.revisionId, "r1");
    text = await input.file.text();
    return { ok: true, revisionId: "r2", item: { ...base, revisionId: "r2" } };
  });
  assert.equal(outcome.ok, true, outcome.error);
  return parseVideoProject(text);
}

test("text/script/subtitle expose only renderer-supported canon styles and round-trip through actual save, compose and timeline hydration", async () => {
  let project = fixture();
  const ids = {};
  for (const kind of ["text", "script", "subtitle"]) {
    const added = addProjectNode(project, kind, { x: 0, y: 0 }, { text: `${kind} content`, shotId: "shot" });
    project = added.project; ids[kind] = added.nodeId;
  }
  const rejected = addProjectNode(project, "text", { x: 0, y: 0 }, { text: "Never export", shotId: "rejected" });
  const runtime = engine(rejected.project);
  for (const [kind, id] of Object.entries({ ...ids, rejected: rejected.nodeId })) {
    runtime.select(id);
    const context = runtime.context();
    assert.equal(context.bar, "text");
    for (const id of ["font-size", "bold", "text-color", "highlight", "align"]) assert.ok(context.controls.some((c) => c.id === id), id);
    for (const id of ["font-family", "italic", "underline", "strike", "line-height", "letter-spacing", "opacity"]) assert.ok(!context.controls.some((c) => c.id === id), id);
    assert.deepEqual([context.controls.find((c) => c.id === "font-size").unit, context.controls.find((c) => c.id === "font-size").step], ["px", 1]);
    await runtime.change("font-size", 72);
    await runtime.change("bold", true);
    await runtime.change("text-color", "#123456");
    await runtime.change("highlight", "#abcdef");
    await runtime.change("align", "right");
    if (kind !== "subtitle") await runtime.change("canvas.selection.include-in-video.set", true);
  }
  const reopened = await saveReopen(runtime.project);
  const cut = canvasCompositionDocument(reopened);
  const clips = cut.document.tracks.find((t) => t.kind === "text").clips;
  assert.deepEqual(clips.map((clip) => clip.text), ["text content", "script content", "subtitle content"]);
  for (const clip of clips) assert.deepEqual(clip.style, { font_size: 72, color: "#123456", background: "#abcdef", bold: true, align: "right", x: 0.5, y: 0.85 });
  assert.deepEqual(hydrateVideoTimelineDoc(cut.projectDocument), cut.document);
  assert.equal(projectHead(reopened).graph.nodes.find((n) => n.nodeId === ids.script).kind, "script");
});

test("scripts and text are excluded from the film until explicitly included; unsupported style and stale commands cannot mutate", async () => {
  const added = addProjectNode(fixture(), "script", { x: 0, y: 0 }, { text: "Agent prompt", shotId: "shot" });
  const runtime = engine(added.project); runtime.select(added.nodeId);
  assert.equal(canvasCompositionDocument(runtime.project).document.tracks.some((t) => t.kind === "text"), false);
  const head = runtime.project.headVersionId;
  assert.equal((await runtime.run("canvas.node.text-style.update", { field: "italic", value: true })).status, "failed");
  assert.equal(runtime.project.headVersionId, head);
  assert.equal((await runtime.run("canvas.node.text-style.update", { field: "font_size", value: 60 }, { selectionEpoch: 0 })).status, "rejected");
  assert.equal(runtime.project.headVersionId, head);
});

test("clear-format resets the supported text styles while preserving text, overlay role and timing through save/reopen", async () => {
  const added = addProjectNode(fixture(), "script", { x: 0, y: 0 }, { text: "Keep content", shotId: "shot" });
  Object.assign(added.project.versions[added.project.headVersionId].graph.nodes.find((node) => node.nodeId === added.nodeId), {
    params: { includeInVideo: true, startMs: 100, durationMs: 700, unrelated: "keep" },
  });
  const runtime = engine(added.project); runtime.select(added.nodeId);
  for (const [id, value] of [["font-size", 96], ["bold", true], ["text-color", "#123456"], ["highlight", "#abcdef"], ["align", "left"]]) await runtime.change(id, value);
  const styled = runtime.project.headVersionId;
  await runtime.change("clear-format");
  const reopened = await saveReopen(runtime.project);
  const node = projectHead(reopened).graph.nodes.find((node) => node.nodeId === added.nodeId);
  assert.equal(node.text, "Keep content");
  assert.deepEqual(node.params, { includeInVideo: true, startMs: 100, durationMs: 700, unrelated: "keep", textStyle: {} });
  assert.equal(reopened.versions[styled].graph.nodes.find((node) => node.nodeId === added.nodeId).params.textStyle.font_size, 96);
  const clip = canvasCompositionDocument(reopened).document.tracks.find((track) => track.kind === "text").clips[0];
  assert.deepEqual([clip.start_ms, clip.duration_ms, clip.text], [100, 700, "Keep content"]);
  assert.deepEqual(clip.style, { font_size: 48, color: "#ffffff", x: 0.5, y: 0.85, align: "center", bold: false });
});

test("image replace is a real asset switch in a new version, appears only with an alternate and survives save/reopen", async () => {
  let project = fixture();
  for (const id of ["image-a", "image-b"]) project.assets[id] = { assetId: id, kind: "image", origin: "import", immutable: true,
    title: id, url: `https://cdn.example.test/${id}.png`, createdAt: new Date().toISOString() };
  const added = addProjectNode(project, "image", { x: 0, y: 0 }, { assetId: "image-a", localEditRecipe: [{ operation: "rotate", parameters: { degrees: 90 } }] });
  const runtime = engine(added.project); runtime.select(added.nodeId);
  const { controls } = canonicalSelectionControls(runtime.context(), (value) => value);
  assert.ok(partitionSelectionInspectorControls(controls).compact.some((c) => c.id === "replace"));
  const old = runtime.project.headVersionId;
  const snapshot = JSON.stringify(runtime.project.versions[old]);
  await runtime.change("canvas.selection.asset.replace", "image-b");
  assert.equal(JSON.stringify(runtime.project.versions[old]), snapshot);
  const reopened = await saveReopen(runtime.project);
  assert.equal(projectHead(reopened).graph.nodes.find((n) => n.nodeId === added.nodeId).assetId, "image-b");
  assert.deepEqual(projectHead(reopened).graph.nodes.find((n) => n.nodeId === added.nodeId).localEditRecipe, []);
  assert.deepEqual(projectHead(reopened).storyboards[0].frameAssetIds, ["image-b"]);
  assert.ok(reopened.assets["image-a"]);
  delete project.assets["image-b"];
  const image = addProjectNode(project, "image", { x: 0, y: 0 }, { assetId: "image-a" });
  const singleImage = engine(image.project); singleImage.select(image.nodeId);
  assert.ok(!singleImage.context().controls.some((c) => c.id === "canvas.selection.asset.replace"));
  const derivative = deriveLocalAsset(image.project, "image-a", { operation: "rotate", parameters: { degrees: 90 } }, "fixture.rotate");
  const local = engine(derivative.project); local.select(image.nodeId);
  assert.ok(!local.context().controls.some((c) => c.id === "canvas.selection.asset.replace"));
  const before = local.project.headVersionId;
  assert.equal((await local.run("canvas.node.asset.replace", { assetId: derivative.asset.assetId })).status, "disabled");
  assert.equal(local.project.headVersionId, before);
});

test("text and audio creation controls dispatch real node creation with and without a selection", async () => {
  const runtime = engine(createVideoProject("Empty"));
  await runtime.change("canvas.create.text");
  assert.equal(projectHead(runtime.project).graph.nodes.at(-1).kind, "text");
  await runtime.change("canvas.create.audio");
  assert.equal(projectHead(runtime.project).graph.nodes.at(-1).kind, "audio");
  const reopened = await saveReopen(runtime.project);
  assert.deepEqual(projectHead(reopened).graph.nodes.map((node) => node.kind), ["text", "audio"]);
});

test("history restore makes a new head, preserves every prior version and rejects stale/missing targets", async () => {
  const added = addProjectNode(fixture(), "text", { x: 0, y: 0 }, { text: "Before" });
  const target = added.project.headVersionId;
  const edited = runContinuityQc(updateProjectNode(added.project, added.nodeId, "edit", { text: "After" }));
  assert.ok(projectHead(edited).continuityQc);
  const originals = JSON.stringify(edited.versions);
  const runtime = engine(edited);
  for (const versionId of ["missing", "__proto__", "constructor", edited.headVersionId]) {
    assert.equal((await runtime.run("canvas.project.version.restore", { versionId })).status, "disabled");
    assert.equal(runtime.project.headVersionId, edited.headVersionId);
  }
  assert.equal((await runtime.run("canvas.project.version.restore", { versionId: target }, { projectVersionId: target })).status, "rejected");
  assert.equal((await runtime.run("canvas.project.version.restore", { versionId: target }, { selectionEpoch: 0 })).status, "rejected");
  assert.equal(JSON.stringify(runtime.project.versions), originals);
  assert.equal((await runtime.run("canvas.project.version.restore", { versionId: target })).status, "succeeded");
  const current = projectHead(runtime.project);
  assert.notEqual(current.versionId, target);
  assert.equal(current.parentVersionId, edited.headVersionId);
  assert.equal(current.revision, projectHead(edited).revision + 1);
  assert.equal(current.graph.nodes.find((n) => n.nodeId === added.nodeId).text, "Before");
  assert.equal(current.continuityQc, undefined);
  for (const [id, value] of Object.entries(JSON.parse(originals))) assert.deepEqual(runtime.project.versions[id], value);
  const reopened = await saveReopen(runtime.project);
  assert.equal(reopened.headVersionId, current.versionId);
});

const { CanvasProductView } = await import(await compileModule("src/shell/video-canvas/engine/CanvasProductViews.tsx", {
  "../../../i18n": dataModule("export function useUI(){return text=>text;}"),
}));
const { CanvasCreateMenu } = await import(await compileModule("src/shell/video-canvas/engine/CanvasCreateMenu.tsx"));
test("real product views mount, integrate camera plans with storyboard, and restore then save; create menu reaches text/audio", async () => {
  const errors = []; const original = console.error; console.error = (...args) => errors.push(args.map(String).join(" "));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    const added = addProjectNode(fixture(), "text", { x: 0, y: 0 });
    const runtime = engine(added.project); const calls = [];
    const dispatch = async (id, args) => { calls.push(id); return id === "canvas.project.save" ? { status: "succeeded" } : runtime.run(id, args); };
    const render = async (view) => act(async () => root.render(React.createElement(CanvasProductView, {
      view, project: runtime.project, comparison: null, dispatch, cancelActiveCommand: () => false,
    })));
    await render("storyboard");
    const plan = [...host.querySelectorAll("button")].find((button) => button.textContent === "Create camera plan");
    assert.ok(plan); await act(async () => plan.click()); await render("storyboard");
    assert.match(host.textContent, /35 mm/); assert.match(host.textContent, /Camera path/);
    await render("director"); assert.match(host.textContent, /No candidate|candidate|approved/);
    await render("history");
    await act(async () => host.querySelector("[data-restore-version]").click());
    assert.deepEqual(calls.slice(-2), ["canvas.project.version.restore", "canvas.project.save"]);
    assert.match(host.textContent, /Restored version saved/);
    const entries = [];
    await act(async () => root.render(React.createElement(CanvasCreateMenu, { point: { x: 0, y: 0, openedAt: performance.now() }, onCreate: (id) => entries.push(id), onClose() {} })));
    for (const id of ["text", "audio"]) { const button = host.querySelector(`[data-entry-id="${id}"]`); assert.ok(button); await act(async () => button.click()); }
    assert.deepEqual(entries, ["text", "audio"]);
  } finally { await act(async () => root.unmount()); host.remove(); console.error = original; }
  assert.deepEqual(errors, []);
});

test("final render and timeline handoff dispatch the same styled cut through the actual command engine", async () => {
  globalThis.__canvasParityDelivery = [];
  const delivery = dataModule(`
    export async function renderComposedCanvas(input) {
      globalThis.__canvasParityDelivery.push(['render',input]);
      return {receiptId:input.requestId,jobId:'job',url:'https://cdn.example.test/film.mp4',mimeType:'video/mp4',
        provider:'renderer',model:'ffmpeg',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),
        libraryItem:{artifactId:'film',revisionId:'film-r1'},
        pricing:{billing:'provider',amount:null,currency:'OCEANLEO_CREDITS',estimated:false,label:'compose'}};
    }
    export async function handoffCanvasTimeline(input) {
      globalThis.__canvasParityDelivery.push(['handoff',input]); return {artifactId:'timeline',revisionId:'timeline-r1'};
    }
  `);
  const commands = await import(await compileModule("src/shell/video-canvas/engine/command-registry.ts", { "./canvas-delivery-client": delivery }));
  const added = addProjectNode(fixture(), "subtitle", { x: 0, y: 0 }, { text: "Styled delivery", shotId: "shot" });
  const runtime = engine(added.project, commands.executeCanvasCommand); runtime.select(added.nodeId);
  await runtime.change("font-size", 83); await runtime.change("text-color", "#654321");
  assert.equal((await runtime.run("canvas.timeline.handoff")).status, "succeeded");
  const beforeRender = runtime.project.headVersionId;
  assert.equal((await runtime.run("canvas.timeline.final-render")).status, "succeeded");
  const [[, handoff], [, render]] = globalThis.__canvasParityDelivery;
  assert.deepEqual(hydrateVideoTimelineDoc(handoff.projectDocument), render.timeline);
  const clip = render.timeline.tracks.find((t) => t.kind === "text").clips[0];
  assert.equal(clip.style.font_size, 83); assert.equal(clip.style.color, "#654321");
  assert.equal(runtime.project.timelineHandoff.projectVersionId, beforeRender);
});

test("history reports actual CAS save failure and keeps the restored working head available to retry", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const errors = []; const original = console.error; console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    const added = addProjectNode(fixture(), "text", { x: 0, y: 0 }, { text: "Local restore" });
    const runtime = engine(added.project);
    runtime.env.saveProject = async () => {
      const base = { artifactId: rootId, revisionId: "r1", artifactType: "workflow", kind: "workflow", title: "CAS" };
      const outcome = await saveVideoProject({ base, doc: projectSourceForStorage(runtime.project), editRevision: 10 }, async () => ({ ok: false, error: "CAS revision conflict" }));
      if (!outcome.ok) throw new Error(outcome.error);
      throw new Error("Expected a rejected save");
    };
    await act(async () => root.render(React.createElement(CanvasProductView, { view: "history", project: runtime.project,
      comparison: null, dispatch: (id, args) => runtime.run(id, args), cancelActiveCommand: () => false })));
    const priorHead = runtime.project.headVersionId;
    await act(async () => host.querySelector("[data-restore-version]").click());
    assert.notEqual(runtime.project.headVersionId, priorHead);
    assert.match(host.querySelector('[role="status"]').textContent, /CAS revision conflict/);
    assert.doesNotMatch(host.textContent, /Restored version saved/);
  } finally { await act(async () => root.unmount()); host.remove(); console.error = original; }
  assert.deepEqual(errors, []);
});
