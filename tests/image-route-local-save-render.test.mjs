/**
 * R4 · 真实 ImageRoute 渲染：本机保存回执与保存状态。
 *
 * REAL（生产代码，原样编译并 jsdom 渲染）：ImageRoute、AdvancedWorkbenchShell、
 * InlineAdvancedWorkbenchShell、use-advanced-autosave + AdvancedPersistenceController
 * （真实 flush 调度、重试、状态）、AdvancedWorkspaceActionBar（真实保存槽/图标/title）、
 * PluginGlobalRow / InlineAdvancedWorkbenchHeader、local-save runner、image-save-receipt。
 *
 * MOCK（明确的边界）：
 *  - `use-fabric-image-editor`：Fabric 画布层换成有状态的假 hook（dirty / editRevision /
 *    captureLocalSave / markLocalSaved 的语义与生产 hook 逐字对应：同版本才清脏；云 `save()`
 *    只计数）。假 hook 的控制柄经 globalThis 暴露，生产代码里没有任何测试钩子。
 *  - 画布舞台、各工具面板、右侧栏、拖拽、素材面板、协同房间、插件命令面：无画布/网络的空壳。
 *  - 宿主（`onLocalSave` 的实现）：测试里的可控 deferred，等价于 mount 里的 hub 等待。
 * 不在这里测的：真实 Fabric 画布出图、IndexedDB、真实原生宿主。
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
// Same module instance the compiled production shell imports (the real user-edit ledger).
import { recordUserMutation, resetUserEditSession } from "../src/shell/user-edit-session.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const reactUrl = pathToFileURL(require.resolve("react")).href;

const nullComponent = (...names) =>
  dataModule(names.map((name) => `export function ${name}() { return null; }`).join("\n"));

const FAKE_HOOK = `
import { useCallback, useRef, useState } from ${JSON.stringify(reactUrl)};
export function useFabricImageEditor() {
  const ctl = globalThis.__fakeImageEditor;
  const [dirty, setDirty] = useState(false);
  const [rev, setRev] = useState(0);
  const revRef = useRef(0);
  const dirtyRef = useRef(false);
  ctl.edit = () => { revRef.current += 1; dirtyRef.current = true; setRev(revRef.current); setDirty(true); };
  ctl.snapshot = () => ({ revision: revRef.current, dirty: dirtyRef.current });
  const captureLocalSave = useCallback(() => {
    ctl.captures.push(revRef.current);
    return {
      revision: revRef.current,
      project: { schema: "oceanleo.fabric-image.v1", version: 1, updatedAt: "2026-10-24T00:00:00.000Z",
        snapshot: { json: { objects: [{ type: "textbox", text: "OLEO-" + revRef.current }] }, doc: { width: 8, height: 8 }, canvasBackground: "#fff" } },
    };
  }, []);
  const markLocalSaved = useCallback((revision) => {
    ctl.marks.push(revision);
    if (revRef.current !== revision) return false;
    dirtyRef.current = false; setDirty(false); return true;
  }, []);
  const save = useCallback(async () => {
    ctl.cloudSaves += 1;
    dirtyRef.current = false; setDirty(false);
    return { url: "https://cdn.example.test/p.png", projectUrl: "https://cdn.example.test/p.json", savedAt: "2026-10-24T00:00:00.000Z", versionId: "v1", item: undefined, baseItem: undefined };
  }, []);
  return {
    collab: { readOnly: false, tick: 0, remoteDelta: "", snapshot: () => null, ensureIds() {}, applyRemote() {}, objectBoxes: () => [], adoptRevision: async () => null, markClean() {} },
    vectorConversion: null, confirmVectorConversion() {}, openIdentity: "image-1", loading: false, saving: false, aiBusy: false,
    error: "", notice: "", sceneDiagnostic: null, sourceReady: true, reload() {}, savedUrl: "", savedProjectUrl: "", savedAt: "",
    dirty, editRevision: rev, captureRecovery: () => null, captureRecoveryRevision: () => null, captureLocalSave, markLocalSaved,
    restoreRecovery: async () => false, stageCanvasRef() {}, stageContainerRef() {}, zoom: 1, setZoom() {}, zoomFit() {},
    layers: [], selected: null, cropping: false, canUndo: false, canRedo: false, undo() {}, redo() {},
    exportQuality: 90, downloadAs: async () => {}, downloadDefaultPng: async () => {},
    addImageFromUrl: async () => {}, replaceSelectedImageFromUrl: async () => {}, addImageFromFile: async () => {},
    save,
  };
}
`;

const stubs = {
  "../i18n/ui/useUI": dataModule("export function useUI() { return (text) => text; }"),
  "./AdvancedStageControls": nullComponent("AdvancedStageControls"),
  "./AdvancedWorkbenchStage": dataModule("export function AdvancedWorkbenchStage({editorStage}) { return editorStage; }"),
  "./FloatingContextToolbar": dataModule(`
    export function FloatingContextToolbar({children}) { return children; }
    const controller = { mode: 'docked', dropActive: false, leading: null, trailing: null };
    export function useFloatingContextToolbar() { return controller; }
  `),
  "./inline-advanced-workbench-drop": dataModule(`
    const result = { dropMessage: '', performUpload() {}, handleDrop() {} };
    export function useInlineAdvancedWorkbenchDrop() { return result; }
  `),
  "./InlineEditorMaterialPanel": nullComponent("InlineEditorMaterialPanel"),
  "./plugin-chrome/PluginAgentPanel": nullComponent("PluginAgentPanel"),
  "./workbench-material-provider": dataModule(`
    export const WORKBENCH_MATERIAL_MIME = 'application/x-oceanleo-material';
    export function useWorkbenchMaterials() { return null; }
    export function useWorkbenchMaterialAdapter() {}
  `),
  "../workbench-material-provider": dataModule("export function useWorkbenchMaterialAdapter() {}"),
  "../workbench-material-command": dataModule("export function withEditorHistoryCommand(adapter) { return adapter; }"),
  "./workbench-routes": dataModule('export function editBarOwnershipForItem() { return "host"; } export function editorCapabilityFor() { return "host"; } export function editorRouteFor() { return {type:"image"}; }'),
  "../workbench-routes": dataModule('export function editorToolLabel() { return "图片"; }'),
  "../plugin-command": dataModule("export function usePluginCommandSurface() {}"),
  "../image-editor/image-command-surface": dataModule("export function createImageCommandSurface() { return {}; }"),
  "../image-editor/use-fabric-image-editor": dataModule(FAKE_HOOK),
  "../image-editor/FabricImageContextToolbar": nullComponent("FabricImageContextToolbar"),
  "../image-editor/FabricImageControls": nullComponent("FabricImageControls"),
  "../image-editor/FabricImageStage": nullComponent("FabricImageStage"),
  "../image-editor/FabricImageCreationPanels": nullComponent(
    "FabricImageBrushPanel", "FabricImageExportPanel", "FabricImageLinePanel", "FabricImageNotePanel",
    "FabricImageShapePanel", "FabricImageSignaturePanel", "FabricImageTablePanel", "FabricImageTextPanel",
  ),
  "../collab/adapters/use-entity-collab": dataModule(
    "export function useEntityCollab() { return { collab: undefined, readOnly: false, saveGate: true, room: null, markSaved() {} }; }",
  ),
  "../collab/adapters/visual-selection": dataModule("export function useCollabSelections() { return []; }"),
  "../collab/adapters/VisualViewOnlyPanel": dataModule("export function VisualViewOnlyPanel({children}) { return children; }"),
  "../doc-editors/EditorSourceFailurePanel": nullComponent("EditorSourceFailurePanel"),
};

const { ImageRoute } = await import(await compileModule("src/shell/advanced-routes/ImageRoute.tsx", stubs));

const h = React.createElement;
const ITEM = {
  id: "image-1", key: "artifact:image-1", title: "目标图", kind: "image", meta: {},
  previewUrl: "https://cdn.example.test/a.png", url: "https://cdn.example.test/a.png",
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRoute(props, body) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://test.dev.oceanleo.com/" });
  const { window } = dom;
  const restore = [];
  for (const [key, value] of Object.entries({
    window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
    Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
    requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    restore.push(() => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  resetUserEditSession();
  globalThis.__fakeImageEditor = { captures: [], marks: [], cloudSaves: 0 };
  const errors = [];
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container, { onCaughtError() {}, onUncaughtError(e) { errors.push(e); } });
  const ctl = globalThis.__fakeImageEditor;
  try {
    await act(async () => root.render(h(ImageRoute, { item: ITEM, onClose() {}, ...props })));
    await body({ container, ctl, root, window, errors });
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.__fakeImageEditor;
  }
}

const slot = (container) => container.querySelector("[data-workspace-save-launcher]");
const label = (container) => slot(container)?.querySelector(".sr-only")?.textContent || "";
// A user edit = what the real hook does: advance the editor revision and record the mutation.
const edit = async (ctl) => act(async () => { recordUserMutation("image-1"); ctl.edit(); });
const settle = async (ms) => act(async () => sleep(ms));
function deferredHost() {
  const calls = [];
  return {
    calls,
    handler: (request) => new Promise((resolve) => calls.push({ request, resolve })),
  };
}

test("with onLocalSave: idle slot is local-device; ack before success is never claimed; ack => saved on this device", async () => {
  const host = deferredHost();
  await withRoute({ onLocalSave: host.handler }, async ({ container, ctl, errors }) => {
    assert.equal(slot(container).getAttribute("data-save-destination"), "local-device");
    assert.equal(label(container), "已保存到本机（未同步到云端）");
    assert.match(slot(container).querySelector("svg").innerHTML, /rect/, "device icon, not the cloud path");
    assert.doesNotMatch(slot(container).querySelector("svg").innerHTML, /M7 18h10/);

    await edit(ctl);
    assert.equal(slot(container).getAttribute("data-save-state"), "saving", "a dirty edit is never shown as saved");
    assert.equal(label(container), "正在保存到本机");
    await settle(900); // production autosave debounce is 500ms
    assert.equal(host.calls.length, 1, "production flush reached onLocalSave");
    assert.equal(host.calls[0].request.revision, 1);
    assert.equal(host.calls[0].request.project.schema, "oceanleo.fabric-image.v1");
    assert.equal(ctl.cloudSaves, 0, "no cloud request");
    assert.notEqual(slot(container).getAttribute("data-save-state"), "saved", "no success before the host acks");
    assert.doesNotMatch(label(container), /已保存/);
    assert.equal(ctl.snapshot().dirty, true);

    await act(async () => host.calls[0].resolve({ ok: true }));
    await settle(50);
    assert.equal(slot(container).getAttribute("data-save-state"), "saved");
    assert.equal(label(container), "已保存到本机（未同步到云端）");
    assert.equal(ctl.snapshot().dirty, false);
    assert.deepEqual(errors, []);
  });
});

test("host failure shows a real failure, keeps the edit dirty, and the retry control saves it", async () => {
  const host = deferredHost();
  await withRoute({ onLocalSave: host.handler }, async ({ container, ctl }) => {
    await edit(ctl);
    await settle(900);
    await act(async () => host.calls[0].resolve({ ok: false, error: "宿主拒绝保存" }));
    await settle(50);
    assert.equal(slot(container).getAttribute("data-save-state"), "error");
    assert.equal(label(container), "保存遇到问题");
    assert.match(slot(container).getAttribute("title"), /宿主拒绝保存/);
    assert.equal(ctl.snapshot().dirty, true, "failed save never cleans");
    assert.equal(ctl.marks.length, 0);

    await act(async () => slot(container).dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    const retry = document.querySelector('[data-workspace-save-action-id="retry"]');
    assert.ok(retry, "retry menu item exists");
    await act(async () => retry.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    await settle(100);
    assert.equal(host.calls.length, 2, "retry reached the host again");
    await act(async () => host.calls[1].resolve({ ok: true }));
    await settle(50);
    assert.equal(slot(container).getAttribute("data-save-state"), "saved");
    assert.equal(ctl.snapshot().dirty, false);
  });
});

test("an old ack never cleans an edit made while the save was in flight; the next save carries it", async () => {
  const host = deferredHost();
  await withRoute({ onLocalSave: host.handler }, async ({ container, ctl }) => {
    await edit(ctl);
    await settle(900);
    assert.equal(host.calls.length, 1);
    await edit(ctl); // revision 2 while revision 1 is awaiting its ack
    await act(async () => host.calls[0].resolve({ ok: true }));
    await settle(50);
    assert.deepEqual(ctl.marks, [1]);
    assert.equal(ctl.snapshot().dirty, true, "revision 2 is not saved");
    assert.notEqual(slot(container).getAttribute("data-save-state"), "saved");
    await settle(900);
    assert.equal(host.calls.length, 2, "the shell flushed the newer revision");
    assert.equal(host.calls[1].request.revision, 2);
    await act(async () => host.calls[1].resolve({ ok: true }));
    await settle(50);
    assert.equal(ctl.snapshot().dirty, false);
    assert.equal(slot(container).getAttribute("data-save-state"), "saved");
  });
});

test("closing the editor mid-save fails it explicitly; a late ack cleans nothing", async () => {
  const host = deferredHost();
  let ctlRef;
  await withRoute({ onLocalSave: host.handler }, async ({ ctl, root }) => {
    ctlRef = ctl;
    await edit(ctl);
    await settle(900);
    assert.equal(host.calls.length, 1);
    await act(async () => root.render(null)); // unmount the route while the host has not answered
  });
  // route is gone; the host answers late
  await host.calls[0].resolve({ ok: true });
  await sleep(50);
  assert.deepEqual(ctlRef.marks, [], "late ack after unmount did not touch the editor");
});

test("without onLocalSave the cloud save runs and the slot stays a cloud slot", async () => {
  await withRoute({}, async ({ container, ctl }) => {
    assert.equal(slot(container).getAttribute("data-save-destination"), "cloud");
    assert.equal(label(container), "已保存");
    assert.match(slot(container).querySelector("svg").innerHTML, /M7 18h10/, "cloud icon unchanged");
    await edit(ctl);
    await settle(900);
    assert.ok(ctl.cloudSaves >= 1, "production flush called the cloud save");
    assert.equal(ctl.captures.length, 0, "local capture never used");
    assert.equal(ctl.marks.length, 0);
  });
});
