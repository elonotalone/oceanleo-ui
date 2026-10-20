/**
 * V1 independent acceptance: image chrome after the 2026-10-21 repair.
 * No 结构/皮肤 switch on ImageRoute, no primary XY, listed AI surfaces gone,
 * loading overlay not shown when source is already ready and a save is running.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  AI_CAPABILITY_ENTRIES,
  applicableAiEntries,
  editBarAiEntries,
  panelAiEntries,
} from "../src/shell/image-editor/design-mode/ai-capability-entries.ts";
import { CANVAS_VIEW_LABELS, canvasViewChoices } from "../src/shell/image-editor/design-mode/canvas-view-switch.ts";
import { IMAGE_DESIGN_L4_CHIPS } from "../src/shell/image-editor/design-mode/l4-chips.ts";
import { imageAiCommandDefinitions } from "../src/shell/image-editor/design-mode/image-ai-commands.ts";
import { IMAGE_AI_PANEL_CAPABILITIES } from "../src/shell/image-editor/image-capability-engine.ts";
import { createImageCommandSurface } from "../src/shell/image-editor/image-command-surface.ts";

const require = createRequire(import.meta.url);
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const BANNED_AI_IDS = [
  "remove-bg",
  "upscale",
  "portrait-quality",
  "relight",
  "outpaint",
  "panorama",
];
function collectIds(value, into = []) {
  if (!value) return into;
  if (typeof value === "string") {
    into.push(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, into);
    return into;
  }
  if (typeof value === "object") {
    if (typeof value.id === "string") into.push(value.id);
    if (typeof value.label === "string") into.push(value.label);
    if (value.spec) collectIds(value.spec, into);
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") collectIds(nested, into);
    }
  }
  return into;
}

function assertBannedAiAbsent(label, values) {
  const hay = collectIds(values).join("\n");
  for (const id of BANNED_AI_IDS) {
    assert.equal(
      hay.split("\n").includes(id) || hay.includes(`image.ai.${id}`),
      false,
      `${label} still offers ${id}`,
    );
  }
  for (const banned of ["抠图", "放大高清", "人像精修", "重新打光", "扩展画面", "全景延展"]) {
    assert.equal(hay.includes(banned), false, `${label} still labels ${banned}`);
  }
}

function selectedImage() {
  return {
    id: "l1",
    kind: "image",
    isBackground: false,
    opacity: 1,
    angle: 0,
    flipX: false,
    flipY: false,
    x: 502,
    y: 415,
    width: 200,
    height: 150,
    locked: false,
    imageFit: "fill",
    fill: "#111111",
    stroke: "",
    strokeWidth: 0,
    shadow: { enabled: false, color: "#000", blur: 0, offsetX: 0, offsetY: 0 },
    radius: 0,
    text: null,
    table: null,
  };
}

function fakeImageEditor(patch = {}) {
  const calls = [];
  const base = {
    loading: false,
    saving: false,
    sourceReady: true,
    error: "",
    notice: "",
    sceneDiagnostic: null,
    dirty: false,
    editRevision: 1,
    cropping: false,
    cropRatio: "free",
    zoom: 1,
    doc: { width: 800, height: 600 },
    layers: [{ id: "l1", locked: false, selected: true, kind: "image" }],
    selected: selectedImage(),
    filterInfo: null,
    transformInfo: null,
    canvasBackground: "#ffffff",
    aiAvailable: true,
    aiBusy: false,
    exportFormat: "png",
    exportQuality: 90,
    canUndo: false,
    canRedo: false,
    savedUrl: "",
    stageCanvasRef() {},
    stageContainerRef: { current: null },
    controlClientCoords: null,
    collab: {
      readOnly: false,
      ensureIds() {},
      snapshot() {
        return { objects: [] };
      },
      applyRemote() {},
      markClean() {},
      adoptRevision: async () => null,
      objectBoxes() {
        return [];
      },
      tick: 0,
    },
    reload() {},
    save: async () => ({ url: "https://cdn.example/img.png" }),
    undo() {},
    redo() {},
    zoomFit() {},
    setZoom() {},
    downloadDefaultPng() {},
    downloadAs: async () => {},
    addImageFromUrl: async () => {},
    beginGesture() {},
    cancelGesture() {},
    endGesture() {},
    ...patch,
  };
  return new Proxy(base, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol") return undefined;
      return (...args) => {
        calls.push([String(key), ...args]);
      };
    },
  });
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://image.oceanleo.com/library",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    ResizeObserver:
      window.ResizeObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run({
      window,
      container,
      render: (element) => act(async () => root.render(element)),
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restore.reverse().forEach((fn) => fn());
  }
}

const useUiStub = dataModule(`
  export function useUI() {
    return (value) => String(value);
  }
`);

test("image AI capability lists used by the editor no longer offer the deleted tools", () => {
  assertBannedAiAbsent("IMAGE_AI_PANEL_CAPABILITIES", IMAGE_AI_PANEL_CAPABILITIES);
  assertBannedAiAbsent("AI_CAPABILITY_ENTRIES", AI_CAPABILITY_ENTRIES);
  assertBannedAiAbsent(
    "applicableAiEntries",
    applicableAiEntries({ hasSelection: true, selectedType: "image" }),
  );
  assertBannedAiAbsent(
    "editBarAiEntries",
    editBarAiEntries({ hasSelection: true, selectedType: "image" }),
  );
  assertBannedAiAbsent(
    "panelAiEntries",
    panelAiEntries({ hasSelection: false }, "ai"),
  );
  assertBannedAiAbsent("IMAGE_DESIGN_L4_CHIPS", IMAGE_DESIGN_L4_CHIPS);

  const commands = imageAiCommandDefinitions({
    doc: { width: 800, height: 600 },
    selected: selectedImage(),
    aiAvailable: true,
    busy: false,
    revision: () => 1,
    run: async () => ({ ok: true, message: "x" }),
  });
  assertBannedAiAbsent("imageAiCommandDefinitions", commands);

  const surface = createImageCommandSurface({
    editor: fakeImageEditor(),
    deliver: async () => {},
    runAi: async () => ({ ok: true, message: "x" }),
  });
  assertBannedAiAbsent("createImageCommandSurface", surface.describe());
});

test("image toolbar builder has no primary position-x / position-y", async () => {
  const toolbarStub = dataModule(`
    export function SelectionToolbar(props) {
      globalThis.__V1_IMAGE_TOOLBAR = props;
      return null;
    }
  `);
  const { FabricImageContextToolbar, buildFabricImageToolbarControls } = await import(
    await compileModule("src/shell/image-editor/FabricImageContextToolbar.tsx", {
      "../../i18n/ui/useUI": useUiStub,
      "../SelectionToolbar": toolbarStub,
    })
  );

  let controls = [];
  if (typeof buildFabricImageToolbarControls === "function") {
    const built = buildFabricImageToolbarControls({
      editor: fakeImageEditor(),
      tt: (value) => String(value),
    });
    controls = built?.controls || built || [];
  } else {
    globalThis.__V1_IMAGE_TOOLBAR = null;
    const { renderToStaticMarkup } = await import("react-dom/server");
    renderToStaticMarkup(
      React.createElement(FabricImageContextToolbar, {
        editor: fakeImageEditor(),
      }),
    );
    controls = globalThis.__V1_IMAGE_TOOLBAR?.context?.controls || [];
  }
  assert.ok(controls.length > 0, "toolbar must still offer some live controls");
  const primaryXy = controls.filter(
    (control) =>
      (control.id === "position-x" || control.id === "position-y") &&
      control.placement === "primary",
  );
  assert.deepEqual(primaryXy, []);
});

test("loading overlay is not shown when sourceReady && saving", async () => {
  const { FabricImageStage, imageStageShowsLoadingOverlay, shouldShowImageLoadingOverlay } =
    await import(
      await compileModule("src/shell/image-editor/FabricImageStage.tsx", {
        "../../i18n/ui/useUI": useUiStub,
      })
    );
  const predicate =
    imageStageShowsLoadingOverlay || shouldShowImageLoadingOverlay;
  if (typeof predicate === "function") {
    assert.equal(
      predicate({ sourceReady: true, saving: true, loading: true }),
      false,
    );
    assert.equal(
      predicate({ sourceReady: true, saving: true, loading: false }),
      false,
    );
  }

  await withDom(async ({ container, render }) => {
    await render(
      React.createElement(FabricImageStage, {
        editor: fakeImageEditor({
          sourceReady: true,
          saving: true,
          loading: true,
        }),
      }),
    );
    assert.equal(
      container.textContent.includes("正在载入对象化图片画布"),
      false,
      "save-time loading overlay must not cover a ready canvas",
    );
  });
});

test("ImageRoute does not mount ImageCanvasViewSwitch or 结构/皮肤", async () => {
  globalThis.__V1_IMAGE_SWITCH_MOUNTS = 0;
  globalThis.__V1_IMAGE_ADAPTER = null;

  const editor = fakeImageEditor({ sourceReady: true, loading: false });
  const workbenchStub = dataModule(`
    import { jsx as _jsx } from ${JSON.stringify(jsxUrl)};
    export function AdvancedWorkbenchShell(props) {
      globalThis.__V1_IMAGE_ADAPTER = props.adapter;
      return _jsx("div", {
        "data-v1-image-shell": true,
        children: props.adapter && props.adapter.stage,
      });
    }
  `);
  const editorHookStub = dataModule(`
    export function useFabricImageEditor() {
      return globalThis.__V1_IMAGE_EDITOR;
    }
  `);
  const collabStub = dataModule(`
    export function useEntityCollab() {
      return {
        readOnly: false,
        saveGate: true,
        room: null,
        markSaved() {},
        collab: {},
        lockHolderName: null,
        history: {
          active: false,
          canUndo: false,
          canRedo: false,
          undoDepth: 0,
          redoDepth: 0,
          undo() {},
          redo() {},
          notice: "",
          clearNotice() {},
        },
      };
    }
  `);
  const selectionStub = dataModule(`
    export function useCollabSelections() { return []; }
    export function readPeerSelections() { return []; }
  `);
  const pluginStub = dataModule(`
    export function usePluginCommandSurface() {}
    export function createImageCommandSurface() { return { editorId: "image", describe() { return []; }, run() {}, state() { return {}; } }; }
  `);
  const materialStub = dataModule(`
    export function useWorkbenchMaterialAdapter() {}
  `);
  const authClientStub = dataModule(`
    export async function accessToken() { return "t"; }
  `);
  const imageAiStub = dataModule(`
    export class ImageGatewayError extends Error {}
    export function createOceanLeoImageAiProvider() { return { run() {} }; }
  `);
  const payerStub = dataModule(`
    export function payerRequestFields() { return {}; }
  `);
  const stageStub = dataModule(`
    import { jsx as _jsx } from ${JSON.stringify(jsxUrl)};
    export function FabricImageStage() {
      return _jsx("div", { "data-v1-fabric-stage": true });
    }
  `);
  const viewOnlyStub = dataModule(`
    export const VIEW_ONLY_HINT = "你只能查看";
    export const VIEW_ONLY_PANEL_NOTE = "你只能查看，这里的功能暂时不能用。";
    export const VIEW_ONLY_REFUSAL = "你现在只能查看，不能修改这个作品。";
    export function viewOnlyContext(context) { return context; }
    export function guardVisualCommands(commands) { return commands; }
    export function guardPluginSurface(surface) { return surface; }
    export function viewOnlyUploadHandler(_readOnly, handler) { return handler; }
  `);
  const viewOnlyPanelStub = dataModule(`
    import { jsx as _jsx } from ${JSON.stringify(jsxUrl)};
    export function VisualViewOnlyPanel(props) {
      return _jsx("div", { children: props.children });
    }
  `);

  globalThis.__V1_IMAGE_EDITOR = editor;
  const { ImageRoute } = await import(
    await compileModule("src/shell/advanced-routes/ImageRoute.tsx", {
      "../AdvancedWorkbenchShell": workbenchStub,
      "../image-editor/use-fabric-image-editor": editorHookStub,
      "../collab/adapters/use-entity-collab": collabStub,
      "../collab/adapters/visual-selection": selectionStub,
      "../plugin-command": pluginStub,
      "../workbench-material-provider": materialStub,
      "../../lib/auth/client": authClientStub,
      "../../lib/image-ai-edit": imageAiStub,
      "../../lib/payer": payerStub,
      "../image-editor/FabricImageStage": stageStub,
      "../collab/adapters/visual-readonly": viewOnlyStub,
      "../collab/adapters/VisualViewOnlyPanel": viewOnlyPanelStub,
    })
  );

  await withDom(async ({ container, render }) => {
    await render(
      React.createElement(ImageRoute, {
        item: {
          id: "img-1",
          key: "artifact:img-1",
          source: "artifact",
          artifactId: "img-1",
          revisionId: "rev-1",
          title: "照片",
          kind: "image",
          siteId: "image",
          favorite: false,
        },
        onClose() {},
      }),
    );
    const adapter = globalThis.__V1_IMAGE_ADAPTER;
    assert.ok(adapter, "ImageRoute must mount the workbench adapter");
    assert.equal(
      container.querySelector("[data-testid='image-canvas-view-switch']"),
      null,
    );
    assert.equal(container.textContent.includes("结构"), false);
    assert.equal(container.textContent.includes("皮肤"), false);
    const actionHay = collectIds(adapter.actions || []).join("\n");
    assertBannedAiAbsent("ImageRoute actions", adapter.actions || []);
    assert.equal(actionHay.includes("image-cutout"), false);
    assert.equal(actionHay.includes("抠图（背景变透明）"), false);
  });

  const switchUsedByRoute = Boolean(
    globalThis.__V1_IMAGE_ADAPTER &&
      String(globalThis.__V1_IMAGE_ADAPTER.stage?.type?.name || "").includes(
        "ImageCanvasViewSwitch",
      ),
  );
  if (switchUsedByRoute) {
    const labels = canvasViewChoices("photo").map((choice) => choice.label);
    assert.equal(labels.includes("结构"), false);
    assert.equal(labels.includes("皮肤"), false);
    assert.notEqual(CANVAS_VIEW_LABELS.photo, "结构");
    assert.notEqual(CANVAS_VIEW_LABELS.design, "皮肤");
  }
});
