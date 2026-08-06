// ============================================================================
// PPT 详情：舞台里必须真有那一页 —— 用**真的** DeckPreviewLayout 跑
// ----------------------------------------------------------------------------
// 为什么要单独一份，而不是加进 `library-ppt-preview-adapter.test.mjs`：
// 那一份把 `DeckPreviewLayout` 整个换成了桩，而桩里没有生产版本的
// `key={activeSlideId}`。于是「换页时整棵 children 被卸载重建」这件事在那份台子上
// 根本不会发生，判据全绿，生产却是一片白（V1-2 改后验收在生产站实拍：
// 左侧 9 页缩略图都有内容，中间舞台 9 页全空、文字长度 0）。
//
// 所以这一份**只换 pptx-preview 与网络**，布局用真的。它量的是用户真正看到的那块：
// `[data-deck-preview-stage]` 里有没有当前这一页的内容。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

async function loadJsdom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  return JSDOM;
}

test("PPT 详情舞台在解析完成与换页之后都留着当前页的内容", async () => {
  const JSDOM = await loadJsdom();
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://ppt.oceanleo.com/explore",
  });
  const previousGlobals = new Map();
  const runtimeGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  for (const [name, value] of Object.entries(runtimeGlobals)) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  // JSDOM 没有 scrollIntoView，而页轨每次换页都会调它。
  dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const uiStubUrl = dataModule(`
    const translate = (value) => value;
    export function useUI() { return translate; }
  `);
  const markdownStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function Markdown({ children }) {
      return React.createElement("div", null, children);
    }
  `);
  const purifierStubUrl = dataModule(`
    export default { sanitize(value) { return value; } };
  `);
  const dataStubUrl = dataModule(`
    export function isDurableLibraryItem() { return false; }
    export function threeDSubtypeFor() { return ""; }
  `);
  const firstPaintUrl = await compileModule(
    "src/shell/library-viewer-first-paint.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": dataStubUrl,
    },
  );
  const renditionStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    const state = {
      url: "",
      loading: false,
      error: "",
      retry() {},
      resourceFailed() {},
    };
    export function useArtifactRendition(item) {
      state.url = item.url || "";
      return state;
    }
    export function withResolvedRendition(item, rendition) {
      return { ...item, url: rendition.url || item.url };
    }
    export function ArtifactRenditionFailure({ message }) {
      return React.createElement("div", { role: "alert" }, message);
    }
  `);
  const officeStubUrl = dataModule(`
    export async function fetchValidatedOfficePackage() {
      return { arrayBuffer: new ArrayBuffer(8) };
    }
    export async function fetchValidatedSpreadsheetSource() {
      return { arrayBuffer: new ArrayBuffer(8) };
    }
    export function officePackageKindForItem() { return null; }
    export function officeViewerRenditionPurposes() { return ["full"]; }
  `);
  const artifactClientStubUrl = dataModule(`
    export async function prepareArtifactForAction() {
      return { ok: true, data: null };
    }
  `);
  const artifactContractStubUrl = dataModule(`
    export function isArtifactSourceTreeUrl() { return false; }
  `);
  const detailSlotStubUrl = dataModule(`
    export function useMaterialDetailTarget(item) {
      return { status: "passthrough", item };
    }
    export function MaterialDetailUnavailable() { return null; }
    export function GamePlayDetail() { return null; }
    export function gamePlayEmbedHref() { return ""; }
  `);
  const sandboxOriginStubUrl = dataModule(`
    export function isTrustedInteractiveViewerUrl() { return false; }
    export function webViewerFrameSandbox() {
      return "allow-scripts allow-forms allow-popups allow-downloads";
    }
  `);
  // pptx-preview 的真实语义：`init(node)` 在 node 里建一个 wrapper，
  // 之后所有渲染都进 wrapper（`this.wrapper.append(slide)`），不再碰 node。
  // 这个桩照抄这一条，别的都不模仿。
  const pptxStubUrl = dataModule(`
    export function init(node, options) {
      const wrapper = document.createElement("div");
      wrapper.className = "pptx-preview-wrapper";
      node.append(wrapper);
      return {
        options: { ...options },
        wrapper,
        htmlRender: {
          options: { viewPort: { width: options.width, height: options.height } },
        },
        async load() {
          // 真 pptx 的 slide.name 就是包内部件路径，不是给人看的名字。
          return {
            width: 720,
            height: 540,
            slides: [
              { name: "ppt/slides/slide1.xml" },
              { name: "ppt/slides/slide2.xml" },
            ],
          };
        },
        renderSingleSlide(index) {
          wrapper.replaceChildren();
          const slide = document.createElement("div");
          slide.className =
            "pptx-preview-slide-wrapper pptx-preview-slide-wrapper-" + index;
          slide.textContent = "real-slide-" + index;
          wrapper.append(slide);
        },
        destroy() {},
      };
    }
  `);
  const moduleUrl = await compileModule("src/shell/library-viewers.tsx", {
    react: reactUrl,
    dompurify: purifierStubUrl,
    "./Markdown": markdownStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./library-data": dataStubUrl,
    "./ArtifactRendition": renditionStubUrl,
    "./artifact-client": artifactClientStubUrl,
    "./artifact-contract": artifactContractStubUrl,
    "./editor-sandbox-origin": sandboxOriginStubUrl,
    "./doc-editors/office-file": officeStubUrl,
    "./library-viewer-first-paint": firstPaintUrl,
    "./material-detail-slot": detailSlotStubUrl,
    "pptx-preview": pptxStubUrl,
  });
  const { LibraryItemViewer } = await import(moduleUrl);
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const item = {
    id: "deck-1",
    title: "学术汇报幻灯片",
    kind: "ppt",
    url: "https://signed.test/deck.pptx",
    // 刻意不给 meta.slides：货架上多数 deck 就是没有结构化标题的，
    // 页轨只能退回 pptx 模型里的名字——而那个名字是内部路径。
    meta: {},
  };
  const flush = async () => {
    await act(async () => {
      await new Promise((done) => setImmediate(done));
    });
  };
  const waitFor = async (condition, message) => {
    for (let index = 0; index < 40; index += 1) {
      if (condition()) return;
      await flush();
    }
    assert.fail(message);
  };
  // 舞台 = 用户眼睛落的那块。缩略图轨在 `<aside>` 里，不算数。
  const stageText = () =>
    (
      container.querySelector("[data-deck-preview-stage]")?.textContent || ""
    ).trim();

  try {
    await act(async () =>
      root.render(React.createElement(LibraryItemViewer, { item })),
    );
    await waitFor(
      () =>
        container.querySelectorAll("[data-deck-thumbnail-rail] button")
          .length === 2,
      "解析出来的幻灯片没有进到共享页轨",
    );

    assert.match(
      stageText(),
      /real-slide-0/,
      "刚打开时舞台是空的：pptx-preview 画进了一个已被 React 丢弃的旧节点",
    );

    const buttons = [
      ...container.querySelectorAll("[data-deck-thumbnail-rail] button"),
    ];
    await act(async () =>
      buttons[1].dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(stageText(), /real-slide-1/, "换页之后舞台没跟上");

    await act(async () =>
      buttons[0].dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.match(stageText(), /real-slide-0/, "翻回第一页之后舞台没跟上");

    // 页轨按钮的无障碍名不许是包内部件路径：屏幕阅读器会把那串原样念出来。
    // 没有结构化标题时该退回「第 N 页」。
    const labels = buttons.map(
      (button) => button.getAttribute("aria-label") || "",
    );
    for (const label of labels) {
      assert.doesNotMatch(
        label,
        /\.xml|\//,
        `页轨按钮的无障碍名念出了内部路径：${label}`,
      );
    }
    assert.deepEqual(labels, ["1. 第 1 页", "2. 第 2 页"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
