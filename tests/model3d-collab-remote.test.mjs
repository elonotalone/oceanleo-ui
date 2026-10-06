import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  act,
  compileModule,
  dataModule,
  loadEntityCollab,
  makeWorld,
  mount,
  settle,
} from "./collab-media-sim.mjs";

const h = React.createElement;
globalThis.__f07React = React;

// ---- 把 use-model3d-workbench 依赖的「会碰 three.js / 网络」的子 hook 换成替身；
// 工作台自己的状态逻辑（applyRemoteScene / applyLocalScene / 视角保留 / 脏标记 / 只读）用真的。
const stubs = {
  "../../i18n/ui/useUI": dataModule(`export const useUI = () => (text, vars) =>
    vars ? String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? "")) : String(text);`),
  "./model3d-runtime.mjs": dataModule(`export class Model3DSceneRuntime {}`),
  "./use-model3d-runtime": dataModule(`
    export function useModel3DRuntime({ runtimeRef, markDirty }) {
      const R = globalThis.__f07React;
      const [runtimeState, setRuntimeState] = R.useState(() => ({
        loaded: true, selection: null, nodes: [], history: { canUndo: false, canRedo: false },
        animations: [], animationName: "", operationJournal: [], operationCount: 0, operationBytes: 0,
        transformMode: "translate",
      }));
      if (!runtimeRef.current) {
        const probe = { setView: [], readOnly: [], clear: 0, selected: [], journal: [] };
        (globalThis.__f07Runtimes ||= []).push(probe);
        const runtime = {
          probe,
          selected: { uuid: "u-selected" },
          gestureActive: false,
          editorId: () => "node:chair",
          objectByEditorId: (id) => ({ uuid: "uuid-of-" + id }),
          setSelectedNode: (uuid) => probe.selected.push(uuid),
          clear: () => { probe.clear += 1; },
          getOperationJournal: () => runtime.journal,
          journal: [],
          setView: (value) => probe.setView.push(value),
          setAnnotations() {}, selectAnimation() {}, setAnimationSpeed() {}, setAnimationTime() {}, setAnimationPlaying() {},
          setReadOnly: (value) => probe.readOnly.push(value),
          dispose() {},
        };
        runtimeRef.current = runtime;
        // 运行时载入完成后把新的操作日志回报给工作台（真实里是运行时的状态回调）
        probe.syncState = () =>
          setRuntimeState((state) => ({ ...state, operationJournal: runtime.journal, operationCount: runtime.journal.length }));
        // 本端做了一次场景编辑（真实里由 three.js 运行时回调）
        probe.addLocalOperation = (operation) => {
          runtime.journal = [...runtime.journal, operation];
          setRuntimeState((state) => ({ ...state, operationJournal: runtime.journal, operationCount: runtime.journal.length }));
          markDirty();
        };
      }
      return { canvasRef: () => undefined, runtimeReady: true, runtimeState, setRuntimeState };
    }
  `),
  "./use-model3d-project-bootstrap": dataModule(`
    export function useModel3DProjectBootstrap({ loadedSourceRef, setSourceUrl, setSourceLoading, setSourceProvenance }) {
      const R = globalThis.__f07React;
      R.useEffect(() => {
        loadedSourceRef.current = "https://m/scene.glb";
        setSourceUrl("https://m/scene.glb");
        // 真实的引导会按作品里的源地址补全来源信息；两端补全后的形状一致。
        setSourceProvenance({
          sourceUrl: "https://m/scene.glb", dependencyBaseUrl: "https://m/scene.glb", format: "glb",
          identity: "https://m/scene.glb", artifactId: "", revisionId: "", sourceDigest: "",
        });
        setSourceLoading(false);
      }, []);
    }
  `),
  "./use-model3d-source-loader": dataModule(`
    export function useModel3DSourceLoader({ runtimeRef, sourceUrl, reloadToken, loadedSourceRef, pendingOperationsRef, setProgress }) {
      const R = globalThis.__f07React;
      R.useEffect(() => {
        if (!reloadToken || !sourceUrl) return;
        const runtime = runtimeRef.current;
        runtime.probe.reloads = (runtime.probe.reloads || 0) + 1;
        runtime.journal = [...pendingOperationsRef.current];
        runtime.probe.journal = runtime.journal;
        runtime.probe.syncState();
        loadedSourceRef.current = sourceUrl;
        setProgress((value) => value + 1);
      }, [reloadToken, sourceUrl]);
    }
  `),
  "./use-model3d-source-actions": dataModule(`
    export const useModel3DSourceActions = () => ({ handlePreparedSource() {}, importModel() {}, openModelUrl() {} });
  `),
  "./use-model3d-save": dataModule(`
    export const useModel3DSave = () => ({ saving: false, saveCopy: async () => {}, checkpointForExport: async () => null });
  `),
  "./use-model3d-media-actions": dataModule(`
    export const useModel3DMediaActions = () => ({ capturing: false, savingScreenshot: false, downloading: false,
      replaceMaterialTexture() {}, saveScreenshot: async () => {}, downloadScreenshot() {}, downloadModel() {} });
  `),
  "./use-model3d-director": dataModule(`
    export const useModel3DDirector = () => ({ directing: false, dispatch() {}, captureScreenshot() {}, capturePlayblast() {}, cancel() {} });
  `),
  "./use-model3d-sidecar": dataModule(`
    export function useModel3DSidecar() {
      const R = globalThis.__f07React;
      const noop = () => undefined;
      return R.useMemo(() => ({
        annotations: [], reset: noop, placeAnnotation: noop, setAnnotationScreens: noop, selectAnnotation: noop,
        setAnnotationDraft: noop, beginAnnotationPlacement: noop, updateSelectedAnnotation: noop, deleteSelectedAnnotation: noop,
        annotationScreens: [], selectedAnnotationId: "", annotationDraft: "", placingAnnotation: false,
      }), []);
    }
  `),
};

const { useModel3DWorkbench } = await import(
  await compileModule("src/shell/media-editors/use-model3d-workbench.ts", stubs)
);
const { captureModel3DRouteSnapshot } = await import("../src/shell/media-editors/Model3DRouteHistory.ts");
const { useEntityCollab } = await loadEntityCollab();
const adapter = await import("../src/shell/collab/adapters/model3d.ts");

const ITEM = { id: "m1", key: "m1", title: "椅子", kind: "model3d", source: "local", url: "https://m/scene.glb", meta: {} };
const op = (id, target, visible) => ({ id, kind: "visibility", target, visible });

/** 照 Model3DRoute 的接法：真 useModel3DWorkbench + 真 useEntityCollab。 */
function makeClient(key, captured) {
  return function Client() {
    const editor = useModel3DWorkbench(ITEM);
    const snapshot = React.useMemo(
      () => captureModel3DRouteSnapshot(editor),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        editor.sourceUrl, editor.operationJournal, editor.azimuth, editor.elevation, editor.zoom, editor.autoRotate,
        editor.exposure, editor.shadowIntensity, editor.shadowSoftness, editor.shadowEnabled, editor.background,
        editor.animationName, editor.animationPlaying, editor.animationSpeed, editor.animationTime,
        editor.environmentUrl, editor.environmentIntensity, editor.annotations, editor.provenance,
      ],
    );
    const collab = useEntityCollab({
      item: { artifactId: key, title: "椅子" },
      editorKind: "model3d",
      rootName: adapter.MODEL3D_ROOT,
      toEntities: adapter.model3dToEntities,
      fromEntities: (input, prev) => adapter.model3dFromEntities(input, prev),
      local: editor.loading || !editor.modelLoaded ? null : snapshot,
      historyCoalesceMs: 0,
      applyRemote: (state) => {
        editor.applyRemoteScene(state);
      },
      applyLocal: (state) => {
        editor.applyLocalScene(state);
      },
    });
    captured[key] = { editor, collab, probe: globalThis.__f07Runtimes[key === "A" ? 0 : 1] };
    return null;
  };
}

async function twoClients() {
  globalThis.__f07Runtimes = [];
  const world = makeWorld();
  const captured = {};
  const mountedA = await mount(h(makeClient("A", captured)));
  await settle(4);
  await world.sync();
  const mountedB = await mount(h(makeClient("B", captured)));
  await settle(6);
  await world.sync();
  await settle(6);
  return {
    world,
    captured,
    async close() {
      await mountedA.unmount();
      await mountedB.unmount();
    },
  };
}

test("3D：B 改场景外观，A 的撤销栈、视角（方位 / 仰角 / 缩放）、选中都不变，也不标未保存", async () => {
  const { world, captured, close } = await twoClients();
  try {
    // A 自己调了镜头
    await act(async () => {
      captured.A.editor.setOrbit(120, captured.A.editor.elevation);
      captured.A.editor.setZoom(80);
    });
    await settle(4);
    await act(async () => captured.A.editor.setExposure(1.4));
    await settle(4);
    await world.sync();
    await settle(4);
    const before = {
      depth: captured.A.collab.history.undoDepth,
      azimuth: captured.A.editor.azimuth,
      zoom: captured.A.editor.zoom,
      revision: captured.A.editor.editRevision,
      reloads: captured.A.probe.reloads || 0,
      clears: captured.A.probe.clear,
    };
    assert.equal(before.azimuth, 120);
    assert.equal(before.depth, 1, "曝光那一步进了 A 的栈；镜头不同步、不进栈");

    await act(async () => captured.B.editor.setBackground("#223344"));
    await settle(4);
    await world.sync();
    await settle(6);

    assert.equal(captured.A.editor.background, "#223344", "B 改的背景到了 A");
    assert.equal(captured.A.editor.azimuth, before.azimuth, "A 的方位角不变");
    assert.equal(captured.A.editor.zoom, before.zoom, "A 的缩放不变");
    assert.equal(captured.A.collab.history.undoDepth, before.depth, "A 的撤销栈长度不变");
    assert.equal(captured.A.editor.editRevision, before.revision, "改动版本号不变 → 不会触发自动保存");
    assert.equal(captured.A.probe.reloads || 0, before.reloads, "只是外观变化：不重载模型");
    assert.equal(captured.A.probe.clear, before.clears, "场景没被清掉重建");
    assert.equal(captured.A.editor.notice, "", "没有「已恢复上次未同步的本地草稿」");
  } finally {
    await close();
  }
});

test("3D：B 改了场景里的节点，A 整体重载后仍保住视角、选中节点，且不标未保存", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => {
      captured.A.editor.setOrbit(77, captured.A.editor.elevation);
    });
    await settle(4);
    const revision = captured.A.editor.editRevision;

    await act(async () => captured.B.probe.addLocalOperation(op("op1", "Lamp", false)));
    await settle(4);
    await world.sync();
    await settle(8);

    assert.equal(captured.A.probe.reloads, 1, "节点改动需要重载一次场景");
    assert.deepEqual(
      (captured.A.probe.journal ?? []).map((entry) => entry.id),
      ["op1"],
      "对方的节点改动被重放进 A 的场景",
    );
    assert.equal(captured.A.editor.azimuth, 77, "重载后视角没被对方的改动重置");
    assert.equal(captured.A.editor.editRevision, revision, "对方的改动没把 A 标成未保存");
    assert.equal(captured.A.editor.notice, "");
    assert.deepEqual(captured.A.probe.selected, ["uuid-of-node:chair"], "重载后把 A 选中的节点选了回去");
    assert.equal(captured.A.collab.history.undoDepth, 0, "对方的节点改动不进 A 的撤销栈");
  } finally {
    await close();
  }
});

test("3D：A 撤销自己改的曝光，B 改的背景保留", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => captured.A.editor.setExposure(1.6));
    await settle(4);
    await world.sync();
    await act(async () => captured.B.editor.setBackground("#445566"));
    await settle(4);
    await world.sync();
    await settle(6);
    assert.equal(captured.A.editor.exposure, 1.6);
    assert.equal(captured.A.editor.background, "#445566");

    await act(async () => captured.A.collab.history.undo());
    await settle(6);
    await world.sync();
    await settle(6);
    assert.notEqual(captured.A.editor.exposure, 1.6, "A 自己的曝光改动被撤销");
    assert.equal(captured.A.editor.background, "#445566", "B 的背景还在 A 这边");
    assert.equal(captured.B.editor.background, "#445566", "B 自己这边也没被撤掉");
    assert.equal(captured.A.editor.dirty, true, "撤销是 A 自己的改动：要保存");
  } finally {
    await close();
  }
});

test("3D（只读）：转视角、缩放照常；工作台把运行时切到只读，退出只读时恢复", async () => {
  const { captured, close } = await twoClients();
  try {
    await act(async () => captured.A.editor.setReadOnly(true));
    await settle(3);
    assert.equal(captured.A.probe.readOnly.at(-1), true, "只读：运行时不再挂移动 / 旋转手柄");
    await act(async () => {
      captured.A.editor.setOrbit(200, 30);
      captured.A.editor.setZoom(60);
    });
    await settle(3);
    assert.equal(captured.A.editor.azimuth, 200, "只读时仍可转视角");
    assert.equal(captured.A.editor.elevation, 30);
    assert.equal(captured.A.editor.zoom, 60, "只读时仍可缩放");
    await act(async () => captured.A.editor.setReadOnly(false));
    await settle(3);
    assert.equal(captured.A.probe.readOnly.at(-1), false);
  } finally {
    await close();
  }
});

test("3D（只读）：工具栏里改场景的入口置灰，我自己的相机控件仍可用", async () => {
  const calls = [];
  const uiStub = dataModule(`export const useUI = () => (text, vars) =>
    vars ? String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? "")) : String(text);`);
  const toolbar = await import(
    await compileModule("src/shell/media-editors/Model3DContextToolbar.tsx", {
      "../../i18n/ui/useUI": uiStub,
      "../SelectionToolbar": dataModule(`
        export function SelectionToolbar({ context, onCommand }) {
          globalThis.__model3dSelection = { context, onCommand };
          return null;
        }
      `),
    })
  );
  const editor = new Proxy(
    {
      loading: false,
      modelLoaded: true,
      selectedNode: { id: "node:1", name: "椅子", materials: [], transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, visible: true },
      transformMode: "translate",
      exposure: 1,
      shadowIntensity: 0.5,
      shadowSoftness: 0.5,
      shadowEnabled: true,
      azimuth: 0, elevation: 0, zoom: 100, autoRotate: false,
      sceneNodes: [], canUndo: true, canRedo: false, animations: [], annotations: [],
      materials: [], selectedMaterialIndex: 0, selectedAnnotationId: "", annotationDraft: "",
      environmentUrl: "", environmentIntensity: 1, background: "#000000", animationName: "", animationPlaying: false,
      animationTime: 0, animationDuration: 0, animationSpeed: 1, title: "椅子", editRevision: 0,
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return typeof prop === "string" ? (...args) => calls.push([prop, ...args]) : undefined;
      },
    },
  );
  const mounted = await mount(h(toolbar.Model3DContextToolbar, { editor, readOnly: true }));
  try {
    const { context, onCommand } = globalThis.__model3dSelection;
    const viewOnly = new Set(["azimuth", "elevation", "zoom", "auto-rotate", "reset-camera", "material-select"]);
    const editing = context.controls.filter((control) => !viewOnly.has(control.id));
    assert.ok(editing.length >= 6, "有一批改场景的控件");
    assert.ok(editing.every((control) => control.disabled === true), "改场景的控件全部置灰");
    assert.ok(editing.every((control) => control.unavailableReason === "只能查看，不能修改"));
    const camera = context.controls.filter((control) => viewOnly.has(control.id));
    assert.ok(camera.length >= 4);
    assert.ok(camera.every((control) => control.disabled !== true), "我自己的相机（转视角 / 缩放）仍可用");
    for (const control of editing) onCommand({ selectionId: context.id, controlId: control.id, value: 1 });
    assert.deepEqual(calls, [], "只读时命令不触发任何改动");
    onCommand({ selectionId: context.id, controlId: "zoom", value: 150 });
    onCommand({ selectionId: context.id, controlId: "azimuth", value: 10 });
    assert.deepEqual(
      calls.map((call) => call[0]),
      ["setZoom", "setOrbit"],
      "只读时转视角、缩放照常生效",
    );
    assert.equal(calls.some((call) => call[0] === "beginGesture"), false, "不动运行时的撤销历史");
  } finally {
    await mounted.unmount();
  }
});
