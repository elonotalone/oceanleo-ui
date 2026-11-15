import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { createVideoProject, projectHead } from "../src/shell/video-canvas/engine/project-model.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
globalThis.CSS ||= { escape: value => String(value) };
const copy = dataModule("const tt=text=>text; export const useUI=()=>tt;");
const { default: VideoCanvasSession } = await import(await compileModule("src/shell/video-canvas/LibraryVideoCanvasSession.tsx", {
  "../../i18n": copy,
  "../../i18n/ui/useUI": copy,
  "@xyflow/react": dataModule("export const ReactFlowProvider=({children})=>children;"),
  "../AdvancedWorkbenchShell": dataModule("export const AdvancedWorkbenchShell=({adapter})=>{globalThis.__vmAdapter=adapter;return adapter.stage;};"),
  "../SelectionToolbar": dataModule("export const SelectionToolbar=()=>null;"),
  "../plugin-theme": dataModule("export const usePluginTheme=()=>({theme:'light'});"),
  "../workbench-material-provider": dataModule("export const useWorkbenchMaterialAdapter=()=>{};"),
  "../workbench-material-command": dataModule("export const withEditorHistoryCommand=adapter=>adapter;"),
  "../plugin-command": dataModule("export const usePluginCommandSurface=surface=>{globalThis.__vmSurface=surface;};"),
  "../workflow-carrier/use-video-project-media": dataModule("export const useVideoProjectMedia=()=>{};"),
  "../workflow-carrier/video-project-save": dataModule("export async function saveVideoProject(input){globalThis.__vmPublished=input;return {ok:true,revisionId:'r2',item:{...input.base,revisionId:'r2'}};}"),
  "./engine/CanvasWorkflow": dataModule("export default function Stage({workflow}){globalThis.__vmWorkflow=workflow;return null;}"),
  "./runtime": dataModule(""),
}));

test("mounted Library session edits, agent-writes, undoes, saves and respects the lock", async () => {
  const item = { id: "root", key: "root", artifactId: "root", revisionId: "r1", artifactType: "workflow", meta: {}, title: "Fixture" };
  const initialProject = createVideoProject("Fixture"); initialProject.futureField = { retained: true };
  const base = { current: item }, committed = [];
  const props = { item, base, initialProject, lock: { mayWrite: true, collab: { room: null } }, onClose() {}, onCommitted: next => committed.push(next) };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(React.createElement(VideoCanvasSession, props)); });
    let adapter = globalThis.__vmAdapter;
    assert.equal(adapter.persistence.recovery.ready, true);
    const openedPanels = [];
    adapter.panelHostRef.current = { openDrawer: id => openedPanels.push(id), closeDrawer() {} };
    let materialResult;
    await act(async () => { materialResult = await globalThis.__vmWorkflow.dispatchCommand("canvas.panel.material-library.open", {}, "toolbar"); });
    assert.equal(materialResult.status, "succeeded");
    assert.deepEqual(openedPanels, ["materials"]);
    const createText = adapter.drawers[0].content.props.children.find(button => button.props["data-node-kind"] === "text");
    await act(async () => { createText.props.onClick(); });
    adapter = globalThis.__vmAdapter;
    assert.equal(adapter.persistence.editRevision, 1);
    assert.equal(projectHead(adapter.persistence.recovery.capture()).graph.nodes[0].kind, "text");
    let result;
    await act(async () => { result = await globalThis.__vmSurface.run("video-canvas.node.create", { entryId: "director" }); });
    assert.equal(result.ok, true, result.message);
    await act(async () => { result = await globalThis.__vmSurface.run("video-canvas.node.field.update", { field: "title", value: "Edited" }); });
    assert.equal(result.ok, true, result.message);
    adapter = globalThis.__vmAdapter;
    assert.equal(projectHead(adapter.persistence.recovery.capture()).graph.nodes[0].title, "Edited");
    assert.equal(adapter.history.canUndo, true);
    await act(async () => { adapter.history.undo(); });
    assert.notEqual(projectHead(globalThis.__vmAdapter.persistence.recovery.capture()).graph.nodes[0].title, "Edited");
    await act(async () => { globalThis.__vmAdapter.history.redo(); });
    assert.equal(projectHead(globalThis.__vmAdapter.persistence.recovery.capture()).graph.nodes[0].title, "Edited");
    for (const view of ["storyboard", "director", "timeline", "history", "artifact"]) {
      await act(async () => { globalThis.__vmAdapter.pages.onSelectPage(view); });
      assert.equal(globalThis.__vmAdapter.pages.activePageId, view);
    }
    let saved;
    await act(async () => { saved = await globalThis.__vmAdapter.persistence.flush(); });
    assert.equal(saved.ok, true);
    assert.equal(base.current.revisionId, "r2");
    assert.equal(committed.length, 1);
    assert.deepEqual(globalThis.__vmPublished.doc.futureField, { retained: true });
    assert.equal(globalThis.__vmAdapter.persistence.dirty, false);
    const before = JSON.stringify(globalThis.__vmAdapter.persistence.recovery.capture());
    await act(async () => { root.render(React.createElement(VideoCanvasSession, { ...props, lock: { ...props.lock, mayWrite: false } })); });
    await act(async () => { result = await globalThis.__vmSurface.run("video-canvas.node.create", { entryId: "text" }); });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(globalThis.__vmAdapter.persistence.recovery.capture()), before);
    assert.equal(globalThis.__vmAdapter.persistence.recovery.ready, false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test("switching items keeps background publication baselines isolated", async () => {
  const { LibraryVideoCanvas } = await import(await compileModule("src/shell/video-canvas/LibraryVideoCanvas.tsx", {
    "../../i18n/ui/useUI": copy,
    "next/dynamic": dataModule("export default function dynamic(){return props=>{globalThis.__vmOpenedProps=props;return null;};}"),
    "../AdvancedWorkbenchShell": dataModule("export const AdvancedWorkbenchShell=()=>null;"),
    "../collab/adapters/use-entity-collab": dataModule("export const useLockedEditCollab=()=>({mayWrite:true,collab:{room:null},markSaved(){}});"),
    "../workflow-carrier/workflow-graph-source": dataModule("export const loadVideoProjectDoc=async item=>({ok:true,doc:item.meta.fixture});"),
    "../doc-editors/EditorSourceFailurePanel": dataModule("export const EditorSourceFailurePanel=()=>null;"),
  }));
  const doc = createVideoProject("Fixture");
  const a = { id: "a", artifactId: "a", revisionId: "a1", artifactType: "workflow", meta: { fixture: doc } };
  const b = { id: "b", artifactId: "b", revisionId: "b1", artifactType: "workflow", meta: { fixture: doc } };
  const committed = [];
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(React.createElement(LibraryVideoCanvas, { item: a, onClose() {}, onSavedItem: item => committed.push(item) })); });
    const oldSession = globalThis.__vmOpenedProps;
    assert.equal(oldSession.base.current.artifactId, "a");
    await act(async () => { root.render(React.createElement(LibraryVideoCanvas, { item: b, onClose() {}, onSavedItem: item => committed.push(item) })); });
    const newSession = globalThis.__vmOpenedProps;
    assert.equal(newSession.base.current.artifactId, "b");
    assert.notEqual(oldSession.base, newSession.base);
    oldSession.onCommitted({ ...a, revisionId: "a2" });
    assert.equal(newSession.base.current.artifactId, "b");
    assert.equal(newSession.base.current.revisionId, "b1");
    assert.equal(committed.length, 0, "an old save cannot switch the active file back");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
