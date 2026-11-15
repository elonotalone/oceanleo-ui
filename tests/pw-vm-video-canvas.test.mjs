import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createVideoProject, parseVideoProject, projectHead, projectToFlow, updateProjectNode,
  addProjectNode, effectiveCanvasNode } from "../src/shell/video-canvas/engine/project-model.ts";
import { WorkflowGraphHistory } from "../src/shell/video-canvas/engine/workflow-graph-history.ts";
import { executeCanvasCommand, NODE_MENU_CAPABILITIES } from "../src/shell/video-canvas/engine/command-registry.ts";
import { addAgentVideoNode } from "../src/shell/video-canvas/library-agent-bridge.ts";
import { saveVideoProject } from "../src/shell/workflow-carrier/video-project-save.ts";
import { WorkingCopySaver } from "../src/shell/editor-working-copy.ts";

const kinds = ["text", "image", "video", "audio", "script", "model", "subtitle", "composite", "delivery", "director", "storyboard", "timeline"];
const root = "11111111-1111-4111-8111-111111111111";
const base = { id: root, key: root, artifactId: root, revisionId: "r1", artifactType: "workflow", kind: "workflow", title: "Fixture", meta: {} };
function libraryFixture() {
  return { schema: "oceanleo.video.project.v2", schemaVersion: 2, projectId: "library-project", title: "Fixture",
    headVersionId: "head", vendorField: { untouched: [1, 2] }, assets: {}, lineage: [{ opaque: "keep" }], operationReceipts: { vendor: { futureReceipt: true } },
    versions: { head: { versionId: "head", revision: 1, graph: { graphExtra: "keep", nodes: [
      { nodeId: "brief", kind: "prompt", title: "Brief", position: { x: 0, y: 0 }, params: { text: "Fixture", extra: [3] } },
      { nodeId: "shot", kind: "generate", title: "Shot", position: { x: 400, y: 0 }, params: { prompt: "Fixture", durationMs: 4000 } },
    ], edges: [{ edgeId: "edge", sourceNodeId: "brief", targetNodeId: "shot", vendorEdge: 7 }] }, scenes: [{ sceneId: "scene", futureScene: true }] } } };
}
function workflowFixture() {
  let doc = createVideoProject("Fixture");
  for (const kind of kinds) doc = addProjectNode(doc, kind, { x: 50, y: 80 }).project;
  doc.extraMetadata = { untouched: true };
  return doc;
}
for (const [name, fixture] of [["Library official template", libraryFixture], ["workflow", workflowFixture]]) {
  test(`${name}: open without rewriting, edit/save/reopen keeps all source fields`, async () => {
    const original = fixture();
    const opened = parseVideoProject(JSON.stringify(original));
    assert.deepEqual(opened, original);
    const oldHead = opened.headVersionId;
    const id = projectHead(opened).graph.nodes[0].nodeId;
    const edited = updateProjectNode(opened, id, "fixture.edit", { title: "Edited" });
    assert.deepEqual(edited.versions[oldHead], original.versions[oldHead]);
    let savedText;
    const result = await saveVideoProject({ base, doc: edited, editRevision: 1 }, async input => {
      savedText = await input.file.text();
      return { ok: true, revisionId: "r2", item: { ...base, revisionId: "r2" } };
    });
    assert.equal(result.ok, true);
    const reopened = parseVideoProject(savedText);
    assert.deepEqual(reopened, edited);
    assert.equal(projectHead(reopened).graph.nodes[0].title, "Edited");
    if (name.startsWith("Library")) {
      assert.deepEqual(reopened.vendorField, original.vendorField);
      assert.equal(projectHead(reopened).graph.nodes[0].kind, "prompt");
      assert.equal(projectHead(reopened).graph.nodes[1].kind, "generate");
      assert.equal(effectiveCanvasNode(projectHead(reopened).graph.nodes[1]).kind, "video");
    }
  });
}

test("every node kind can be created by the shared command engine", async () => {
  let project = createVideoProject("Fixture");
  const env = { getProject: () => project, setProject: next => { project = next; }, getSelectedNodeId: () => null,
    setSelectedNodeId() {}, getSelectionEpoch: () => 1, screenCenter: () => ({ x: 0, y: 0 }), setStatus() {} };
  for (const kind of kinds) {
    assert.equal(NODE_MENU_CAPABILITIES[kind].enabled, true, kind);
    const result = await executeCanvasCommand({ commandId: "canvas.node.create", requestId: `request-${kind}`,
      projectVersionId: project.headVersionId, selectionEpoch: 1, surface: "toolbar", args: { entryId: kind } }, env);
    assert.equal(result.status, "succeeded", result.message);
  }
  assert.deepEqual(projectHead(project).graph.nodes.map(node => node.kind), kinds);
});

test("every node kind renders a content surface", async () => {
  const { LeoNode } = await import(await compileModule("src/shell/video-canvas/engine/LeoNode.tsx", {
    "../../../i18n": dataModule("export const useUI=()=>text=>text;"),
    "@xyflow/react": dataModule("export const Handle=()=>null; export const Position={Left:'left',Right:'right',Top:'top',Bottom:'bottom'};"),
  }));
  const flow = projectToFlow(workflowFixture(), node => ({ ...node, selectionEpoch: 1, imageMode: "retouch", hostProvidesEditBar: true,
    commandAvailability: {}, commandDisclosures: {}, generateSummary: {}, onCommand: async () => ({}) }));
  for (const node of flow.nodes) {
    const html = renderToStaticMarkup(React.createElement(LeoNode, { id: node.id, data: node.data, selected: false }));
    assert.ok(html.includes(`data-node-id="${node.id}"`), node.data.kind);
    assert.ok(html.length > 100, node.data.kind);
  }
});

test("undo/redo preserves production records and aliases", () => {
  const original = parseVideoProject(libraryFixture());
  const history = new WorkflowGraphHistory(100, original);
  const edited = updateProjectNode(original, "brief", "fixture.edit", { title: "Edited" });
  history.record(edited);
  const undone = history.undo(edited);
  assert.equal(projectHead(undone).graph.nodes[0].title, "Brief");
  assert.equal(projectHead(undone).graph.nodes[0].kind, "prompt");
  const redone = history.redo(undone);
  assert.equal(projectHead(redone).graph.nodes[0].title, "Edited");
  assert.deepEqual(redone.lineage, original.lineage);
});

test("native agent writes pass capture, CAS acknowledgement and graph verification", () => {
  let project = parseVideoProject(libraryFixture());
  const port = { getProject: () => project, isLoaded: () => true, setPolicy() {}, markDirty() {},
    applyRemote: fn => { const next = fn(project); if (!next) return false; project = next; return true; } };
  const result = addAgentVideoNode(port, "director", "Camera plan", root);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.revision, 2);
  assert.equal(projectHead(project).graph.nodes.at(-1).kind, "director");
  assert.deepEqual(project.vendorField, libraryFixture().vendorField);
});

test("v2 working copy is acknowledged within 500 ms and restored when reopened", async () => {
  const project = workflowFixture();
  let copy = null;
  const times = [];
  const transport = { get: async () => copy, put: async doc => {
    copy = { doc: structuredClone(doc), schema: "oceanleo.video-project.edit.v2", seq: 1,
      saved_at: new Date().toISOString(), base_revision_id: "r1", published_seq: 0 };
    return { ok: true, seq: 1, saved_at: copy.saved_at, server_ms: 0 };
  }, published: async () => {} };
  const saver = new WorkingCopySaver({ transport, schema: "oceanleo.video-project.edit.v2", baseRevision: "r1",
    capture: () => project, restore: () => true, measure: ms => times.push(ms) });
  await saver.initialize();
  const start = performance.now(); saver.edit(); await saver.flush();
  assert.equal(saver.snapshot().state, "saved");
  assert.ok(performance.now() - start <= 500);
  assert.deepEqual(copy.doc, project);
  let reopened;
  const second = new WorkingCopySaver({ transport, schema: copy.schema, baseRevision: "r1", capture: () => null,
    restore: doc => { reopened = parseVideoProject(doc); return true; } });
  await second.initialize();
  assert.deepEqual(reopened, project);
  saver.dispose(); second.dispose();
});

test("one shell owns floating panels, working-copy autosave and all five views", () => {
  const shell = readFileSync("src/shell/video-canvas/LibraryVideoCanvasSession.tsx", "utf8");
  const engine = readFileSync("src/shell/video-canvas/engine/CanvasWorkflow.tsx", "utf8");
  const hook = readFileSync("src/shell/video-canvas/engine/use-canvas-workflow.ts", "utf8");
  const shared = readFileSync("src/shell/InlineAdvancedWorkbenchShell.tsx", "utf8");
  assert.match(shell, /AdvancedWorkbenchShell/);
  assert.match(shell, /autoSave: true/);
  assert.match(shell, /oceanleo\.video-project\.edit\.v2/);
  assert.match(shell, /draftSchema/);
  assert.match(shell, /useWorkbenchMaterialAdapter/);
  assert.match(shared, /useAdvancedAutoSave/);
  assert.doesNotMatch(engine, /PluginChromeFrame|<aside[^>]*left|Save snapshot/);
  assert.doesNotMatch(hook, /host\.writeDoc|CANVAS_AUTOSAVE_MS|beforeunload|postMessage/);
  assert.match(readFileSync("src/shell/use-inline-advanced-panels.tsx", "utf8"), /EditBarFloatingPanel|Floating/);
});

test("official template parameter views preserve duration, ratio and an explicitly cleared prompt", () => {
  const source = libraryFixture(); source.versions.head.graph.nodes[1].params.aspectRatio = "9:16";
  const opened = parseVideoProject(source);
  const view = effectiveCanvasNode(projectHead(opened).graph.nodes[1]);
  assert.equal(view.durationSeconds, 4); assert.equal(view.ratio, "9:16");
  const cleared = updateProjectNode(opened, "shot", "fixture.clear", { prompt: "" });
  assert.equal(effectiveCanvasNode(projectHead(cleared).graph.nodes[1]).prompt, "");
  assert.equal(projectHead(cleared).graph.nodes[1].kind, "generate");
});
