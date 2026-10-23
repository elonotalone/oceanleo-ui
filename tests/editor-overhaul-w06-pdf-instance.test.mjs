// 10-23 D4 判据：PDF 的「编辑」与「专业编辑」是**同一个** EmbedPDF 查看器实例。
// 挂真 `PdfStage`（jsdom），查看器打桩只为数挂载次数、拿到 onReady；切档时：
//   - 查看器只挂一次（不卸载、不重载文档），实例 id 不变；
//   - 不出现 `data-mode-switch-pending`（旧 ModeSwitchGate 的「正在切换」覆盖层）；
//   - 只开关官方工具栏：专业档 setActiveToolbar(main-toolbar)，基础档 closeToolbarSlot；
//   - 换主题只走 container.setTheme，不重新挂载。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// jsdom 取自 fabric 依赖树（仓内不许为测试加 jsdom）；canvas 原生绑定装不上，先顶掉。
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/workspace",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom 没有实现 isContentEditable（浏览器都有）：按属性补上。
if (!("isContentEditable" in window.HTMLElement.prototype)) {
  Object.defineProperty(window.HTMLElement.prototype, "isContentEditable", {
    get() {
      return this.getAttribute("contenteditable") === "true";
    },
  });
}
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { createRoot } = await import(pathToFileURL(require.resolve("react-dom/client")).href);

globalThis.__w06Viewer = { mounts: 0, unmounts: 0, onReady: null, themes: [], configs: [] };

const viewerStub = dataModule(`
  import { createElement, useEffect, useRef } from ${JSON.stringify(reactUrl)};
  export function PDFViewer(props) {
    const ref = useRef(null);
    useEffect(() => {
      const probe = globalThis.__w06Viewer;
      probe.mounts += 1;
      probe.configs.push(props.config);
      probe.onReady = props.onReady;
      // 一个真的 open shadow root：里面一个可编辑文字框、一块「页面」（像上游那样在冒泡阶段建框）
      const shadow = ref.current.shadowRoot || ref.current.attachShadow({ mode: "open" });
      shadow.innerHTML = '<span tabindex="0" contenteditable="true" data-box>typed</span><div data-page></div>';
      probe.pagePointerDowns = 0;
      probe.blurs = 0;
      shadow.querySelector("[data-page]").addEventListener("pointerdown", () => { probe.pagePointerDowns += 1; });
      shadow.querySelector("[data-box]").addEventListener("blur", () => { probe.blurs += 1; });
      probe.shadow = shadow;
      props.onInit && props.onInit({ setTheme: (theme) => probe.themes.push(theme), shadowRoot: shadow });
      return () => { probe.unmounts += 1; };
    }, []);
    return createElement("div", { "data-embedpdf-viewer": "", ref });
  }
`);

const { PdfStage } = await import(
  await compileModule("src/shell/media-editors/PdfStage.tsx", {
    "@embedpdf/react-pdf-viewer": viewerStub,
    "../../i18n/ui/useUI": dataModule("const tt = (zh) => zh; export function useUI() { return tt; }"),
    "./pdf-engine-host": dataModule(`
      export function resolvePdfiumLoadPlan() {
        return { wasm: { ok: true, wasmUrl: "https://oceanleo.com/static/pdfium/pdfium.wasm" }, fontFallback: null };
      }
      export function pdfEngineBuffer(bytes) { return Uint8Array.from(bytes).buffer; }
    `),
  })
);

function fakeRegistry() {
  const calls = [];
  const task = (value) => ({ toPromise: () => Promise.resolve(value) });
  const state = { activeToolId: "highlight", selectedUids: [] };
  const noopHook = () => () => undefined;
  const plugins = {
    ui: {
      forDocument: (id) => ({
        setActiveToolbar: (...args) => calls.push(["setActiveToolbar", id, ...args]),
        getActiveToolbar: () => null,
        closeToolbarSlot: (...args) => calls.push(["closeToolbarSlot", id, ...args]),
        isToolbarOpen: () => false,
        closeSidebarSlot: () => undefined,
      }),
      setDisabledCategories: (list) => calls.push(["ui.setDisabledCategories", list]),
    },
    annotation: {
      forDocument: () => ({
        getState: () => state,
        getSelectedAnnotation: () => null,
        getAnnotations: () => [],
        setActiveTool: (toolId) => {
          state.activeToolId = toolId;
          calls.push(["setActiveTool", toolId]);
        },
        setLocked: () => undefined,
        commit: () => task(true),
      }),
      setToolDefaults: () => undefined,
      onStateChange: noopHook,
    },
    "document-manager": {
      getActiveDocumentId: () => "doc-1",
      getActiveDocument: () => ({ pages: [{ index: 0, size: { width: 600, height: 800 }, rotation: 0 }] }),
      openDocumentBuffer: () => {
        calls.push(["openDocumentBuffer"]);
        return task({ documentId: "doc-2", task: task(undefined) });
      },
      closeDocument: () => {
        calls.push(["closeDocument"]);
        return task(undefined);
      },
      setActiveDocument: () => calls.push(["setActiveDocument"]),
      onDocumentOpened: noopHook,
    },
    export: { forDocument: () => ({ saveAsCopy: () => task(new ArrayBuffer(4)) }) },
  };
  return {
    calls,
    setActiveTool: (toolId) => {
      state.activeToolId = toolId;
    },
    registry: { getPlugin: (id) => (plugins[id] ? { provides: () => plugins[id] } : null) },
  };
}

function resetProbe() {
  Object.assign(globalThis.__w06Viewer, { mounts: 0, unmounts: 0, onReady: null, themes: [], configs: [] });
}

async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

test("clicking away from a text box being typed in commits it and does not start a new box", async () => {
  resetProbe();
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        React.createElement(PdfStage, {
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          name: "t.pdf",
          mode: "basic",
          dark: false,
          onHandle: () => undefined,
          onFailure: () => undefined,
        }),
      ),
    );
    await settle();
    const probe = globalThis.__w06Viewer;
    const fake = fakeRegistry();
    await act(async () => probe.onReady(fake.registry));
    await settle();
    fake.setActiveTool("freeText");
    const box = probe.shadow.querySelector("[data-box]");
    box.focus();
    assert.equal(probe.shadow.activeElement, box, "jsdom must report the focused box inside the shadow root");
    // 点在框里：照常（光标挪动），不失焦
    box.dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true }));
    assert.equal(probe.blurs, 0);
    // 点在页面别处：先失焦（= 提交文字），工具收起，这一下不再传给页面（不建新框）
    fake.calls.length = 0;
    probe.shadow.querySelector("[data-page]").dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true, cancelable: true }));
    assert.equal(probe.blurs, 1, "the box was not blurred, so the typed text never reaches the plugin");
    assert.equal(probe.pagePointerDowns, 0, "the click went on to the page and started a second box");
    assert.ok(fake.calls.some((call) => call[0] === "setActiveTool" && call[1] === null));
    // 不在打字时点页面：正常传下去
    probe.shadow.querySelector("[data-page]").dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true }));
    assert.equal(probe.pagePointerDowns, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("basic and pro are one viewer instance: switching never remounts, reloads or shows a switching overlay", async () => {
  resetProbe();
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root = createRoot(container);
  const handles = [];
  const failures = [];
  const props = (mode, dark = false) => ({
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    name: "闸.pdf",
    mode,
    dark,
    onHandle: (handle) => handles.push(handle),
    onFailure: (reason) => failures.push(reason),
  });
  try {
    await act(async () => root.render(React.createElement(PdfStage, props("basic"))));
    await settle();
    const probe = globalThis.__w06Viewer;
    assert.equal(probe.mounts, 1, "the viewer mounts once on first open");
    const stage = container.querySelector("[data-pdf-stage]");
    const instance = stage.getAttribute("data-pdf-viewer-instance");
    assert.match(instance, /^pdf-viewer-\d+$/);
    assert.equal(probe.configs[0].documentManager.initialDocuments.length, 1);
    assert.equal(probe.configs[0].tabBar, "never");

    const fake = fakeRegistry();
    await act(async () => probe.onReady(fake.registry));
    await settle();
    assert.deepEqual(failures, []);
    assert.equal(handles.filter(Boolean).length, 1, "the route gets one bridge handle");
    assert.ok(fake.calls.some((call) => call[0] === "closeToolbarSlot" && call[3] === "main"), "basic hides the official toolbar");

    fake.calls.length = 0;
    await act(async () => root.render(React.createElement(PdfStage, props("pro"))));
    await settle();
    assert.equal(probe.mounts, 1, "switching to pro must not remount the viewer");
    assert.equal(probe.unmounts, 0);
    assert.equal(container.querySelector("[data-pdf-stage]").getAttribute("data-pdf-viewer-instance"), instance);
    assert.equal(container.querySelector("[data-pdf-stage]").getAttribute("data-pdf-chrome"), "pro");
    assert.equal(container.querySelector("[data-mode-switch-pending]"), null, "no 「正在切换」 overlay");
    assert.ok(
      fake.calls.some((call) => call[0] === "setActiveToolbar" && call[4] === "main-toolbar"),
      "pro opens the official toolbar on the same document",
    );
    assert.equal(fake.calls.some((call) => call[0] === "openDocumentBuffer"), false, "no document reload");
    assert.ok(fake.calls.some((call) => call[0] === "setActiveTool" && call[1] === null), "a half-used basic tool is put down");

    fake.calls.length = 0;
    await act(async () => root.render(React.createElement(PdfStage, props("basic", true))));
    await settle();
    assert.equal(probe.mounts, 1, "switching back and changing theme must not remount");
    assert.equal(container.querySelector("[data-mode-switch-pending]"), null);
    assert.ok(fake.calls.some((call) => call[0] === "closeToolbarSlot"));
    assert.equal(fake.calls.some((call) => call[0] === "openDocumentBuffer"), false);
    assert.equal(probe.themes.at(-1).preference, "dark", "theme follows the site through setTheme");
    assert.equal(handles.filter(Boolean).length, 1, "still the same handle");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  assert.equal(globalThis.__w06Viewer.unmounts, 1);
  assert.equal(handles.at(-1), null, "unmount releases the handle");
});
