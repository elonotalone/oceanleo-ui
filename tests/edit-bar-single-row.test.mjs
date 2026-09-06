// 规范 v2 §4：编辑栏严格单行（plugin-chrome X2）。
//
//   [撤销 重做] | [选中对象工具…] | [documentSegment] | [trailing] [AI 助手] [固定柄]
//
// 全部内联在 FloatingContextToolbar 自己画的 `[data-workspace-edit-bar]` 一行里，
// 永不换行；宽度不足先由 SelectionToolbar 把选中工具折进它的 More，再由行把
// 文档段折进「更多选项」。「收起编辑栏」按钮已删；无 aria-label / 文字的按钮不得渲染。
//
// jsdom 没有布局，所以「所有可见按钮 y 同一 36px 带」那条由浏览器探针
// （signals/X2-journal.md 判据 2）兜；这里钉的是结构与折叠判定。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stateUrl = pathToFileURL(
  resolve("src/shell/edit-bar-dock-state.ts"),
).href;
const geometryUrl = pathToFileURL(
  resolve("src/shell/floating-toolbar-geometry.ts"),
).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const chromeStubUrl = dataModule(`
  export function advancedWorkbenchStyle(accent) {
    return { "--awb-accent": accent };
  }
  export function actionGroup(action) { return action.group || "edit"; }
`);
const pluginThemeStubUrl = dataModule(`
  export function pluginWorkbenchStyle(_theme, accent) {
    return { "--awb-accent": accent };
  }
`);
const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name }) {
    return jsx("span", { "data-icon": name });
  }
`);
const layoutContextStubUrl = dataModule(`
  import { createContext, useContext } from ${JSON.stringify(reactUrl)};
  export const AdvancedLayoutContext = createContext(null);
  export function useAdvancedLayout() { return useContext(AdvancedLayoutContext); }
`);
// 「更多选项」弹层：真身 portal 到 body 并要插件主题；这里只需要它把 children 画出来。
const popoverStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AnchoredPopover({ open, children }) {
    return open ? jsx("div", { "data-test-popover": true, children }) : null;
  }
  export function runAfterOverlayExit(_el, done) { done(); return () => {}; }
`);

const controlsUrl = await compileModule("src/shell/EditBarDockControls.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./edit-bar-dock-state": stateUrl,
  "./floating-toolbar-geometry": geometryUrl,
});
const controllerUrl = await compileModule(
  "src/shell/edit-bar-dock-controller.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./EditBarDockControls": controlsUrl,
    "./edit-bar-dock-state": stateUrl,
    "./floating-toolbar-geometry": geometryUrl,
  },
);
const floatingUrl = await compileModule(
  "src/shell/FloatingContextToolbar.tsx",
  {
    "react-dom": reactDomUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./advanced-workbench-chrome": chromeStubUrl,
    "./plugin-theme": pluginThemeStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./advanced-layout-context": layoutContextStubUrl,
    "./anchored-popover": popoverStubUrl,
    "./edit-bar-dock-controller": controllerUrl,
    "./EditBarDockControls": controlsUrl,
    "./edit-bar-dock-state": stateUrl,
  },
);
const { FloatingContextToolbar, useFloatingContextToolbar } =
  await import(floatingUrl);
const { AdvancedLayoutContext } = await import(layoutContextStubUrl);

/* ------------------------------------------------------------------ 几何桩 */

// 行的容量只看外部边界（overlay）；各段宽度由桩给定，栏自身宽度**不参与**。
const geometry = { overlayWidth: 1000 };
const SEGMENT_WIDTHS = [
  ["data-edit-bar-history-slot", 96],
  ["data-edit-bar-trailing-slot", 100],
  ["data-edit-bar-document-measure", 200],
  ["data-edit-bar-document-slot", 200],
  ["data-edit-bar-selection-slot", 240],
];

function installRectStub() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  const rect = (width, height = 44) => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height,
    width, height, toJSON() {},
  });
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (
      this.hasAttribute("data-edit-bar-test-root") ||
      this.hasAttribute("data-workspace-floating-toolbar-overlay")
    ) {
      return rect(geometry.overlayWidth, 600);
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return rect(geometry.overlayWidth, 500);
    }
    for (const [attribute, width] of SEGMENT_WIDTHS) {
      if (this.hasAttribute(attribute)) return rect(width);
    }
    if (this.tagName === "SPAN" && this.className.includes("w-px")) {
      return rect(1);
    }
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  };
}

/* -------------------------------------------------------------------- 组件 */

function fakeLayout(overrides = {}) {
  return {
    activeDrawerId: "",
    openDrawer() {},
    closeDrawer() {},
    contextBarLeading: React.createElement(
      React.Fragment,
      null,
      React.createElement("button", { type: "button", "aria-label": "撤销" }, "↶"),
      React.createElement("button", { type: "button", "aria-label": "重做" }, "↷"),
    ),
    ...overrides,
  };
}

function RowHarness({ storageKey, selection, documentSegment, trailing, layout }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const dockRef = useRef(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: rootRef,
    stageRef,
    dockRootRef: dockRef,
    resetKey: storageKey,
    storageKey,
  });
  return React.createElement(
    AdvancedLayoutContext.Provider,
    { value: layout === undefined ? fakeLayout() : layout },
    React.createElement(
      "div",
      { ref: rootRef, "data-edit-bar-test-root": true },
      React.createElement("div", { ref: dockRef, "data-edit-bar-test-dock": true }),
      React.createElement("div", { ref: stageRef, "data-edit-bar-test-stage": true }),
      React.createElement(
        FloatingContextToolbar,
        { controller, accent: "#6d5dfc", documentSegment, trailing },
        selection,
      ),
    ),
  );
}

async function mount(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RowHarness, props));
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(React.createElement(RowHarness, next));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function resizeOverlay(width) {
  geometry.overlayWidth = width;
  await act(async () => {
    window.dispatchEvent(new window.Event("resize"));
  });
}

const selectionTools = React.createElement(
  "div",
  { "data-test-selection": true },
  React.createElement("button", { type: "button", "aria-label": "加粗" }, "B"),
  React.createElement("button", { type: "button", "aria-label": "斜体" }, "I"),
);
const documentSegment = React.createElement(
  "div",
  { "data-test-document": true },
  React.createElement("button", { type: "button" }, "重新计算"),
  React.createElement("button", { type: "button", "aria-label": "手机预览" }, "📱"),
);

/* -------------------------------------------------------------------- 用例 */

test("一行四段：容器由 FloatingContextToolbar 自己画，顺序固定，AI 与固定柄各一个，无收起键", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const mounted = await mount({
    storageKey: "test:edit-bar-single-row:contract",
    selection: selectionTools,
    documentSegment,
    trailing: React.createElement("button", { type: "button", "aria-label": "附加" }, "+"),
  });
  try {
    const rows = mounted.container.querySelectorAll("[data-workspace-edit-bar]");
    assert.equal(rows.length, 1, "整个浮层里只许有一个 [data-workspace-edit-bar]");
    const row = rows[0];
    assert.match(row.className, /\bflex-nowrap\b/, "行必须 flex-nowrap");
    assert.match(row.className, /\bwhitespace-nowrap\b/, "行必须 whitespace-nowrap");
    assert.doesNotMatch(row.className, /\bflex-wrap\b/, "行不许 flex-wrap");

    const slots = Array.from(row.children)
      .filter((child) => child.getAttribute("aria-hidden") !== "true")
      .map((child) =>
        ["history", "selection", "document", "trailing"].find((name) =>
          child.hasAttribute(`data-edit-bar-${name}-slot`),
        ) || (child.tagName === "SPAN" ? "|" : child.tagName),
      );
    assert.deepEqual(
      slots,
      ["history", "|", "selection", "|", "document", "trailing"],
      "四段顺序：[撤销 重做] | [选中工具] | [文档段] [右段]",
    );

    const trailingSlot = row.querySelector("[data-edit-bar-trailing-slot]");
    const trailingLabels = Array.from(trailingSlot.querySelectorAll("button")).map(
      (button) => button.getAttribute("aria-label"),
    );
    assert.equal(trailingLabels.length, 3, "右段：trailing、AI 助手、固定柄");
    assert.equal(trailingLabels[0], "附加", "trailing 排最前");
    assert.equal(trailingLabels[1], "AI 助手", "AI 助手在 trailing 之后");
    assert.match(trailingLabels[2], /固定编辑栏/, "固定柄在最右");
    assert.equal(row.querySelectorAll("[data-edit-bar-agent]").length, 1, "AI 键恰一个");
    assert.equal(row.querySelectorAll("[data-edit-bar-pin]").length, 1, "固定柄恰一个");
    assert.equal(
      mounted.container.querySelector("[data-edit-bar-collapse]"),
      null,
      "「收起编辑栏」按钮已删（规范 v2 §4）",
    );

    for (const button of row.querySelectorAll("button")) {
      if (button.closest("[aria-hidden='true']")) continue;
      const label = button.getAttribute("aria-label") || button.textContent.trim();
      assert.ok(label, `按钮没有 aria-label 也没有文字：${button.outerHTML}`);
    }
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("没选中也没有文档动作：栏仍在，data-empty 为真，右段照常有 AI 与固定柄", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const mounted = await mount({
    storageKey: "test:edit-bar-single-row:empty",
    selection: null,
    documentSegment: undefined,
  });
  try {
    const row = mounted.container.querySelector("[data-workspace-edit-bar]");
    assert.ok(row, "没选中时编辑栏也不许消失");
    assert.ok(row.hasAttribute("data-empty"), "没内容时 data-empty 应为真");
    assert.ok(row.querySelector("[data-edit-bar-agent]"), "AI 键恒在");
    assert.ok(row.querySelector("[data-edit-bar-pin]"), "固定柄恒在");
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("宽度不足：文档段折进「更多选项」，只在有选中工具时才折；宽度回来再展开", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const mounted = await mount({
    storageKey: "test:edit-bar-single-row:fold",
    selection: selectionTools,
    documentSegment,
  });
  try {
    const row = () => mounted.container.querySelector("[data-workspace-edit-bar]");
    assert.ok(
      row().querySelector(":scope > [data-edit-bar-document-slot]"),
      "1000 宽时文档段直接在行里",
    );
    assert.equal(row().querySelector("[data-edit-bar-document-more]"), null);

    // 容量 = 380 − 16（两侧保留）= 364；固定段 96 + 100 + 分隔线，文档 200，
    // 选中段至少保 52 → 装不下，文档段折进「更多选项」。
    await resizeOverlay(380);
    const more = row().querySelector("[data-edit-bar-document-more]");
    assert.ok(more, "宽度不足时文档段应折进「更多选项」");
    assert.equal(
      row().querySelector(":scope > [data-edit-bar-document-slot]"),
      null,
      "折进去后行里不再有直接的文档段",
    );
    const moreButton = more.querySelector("button");
    assert.equal(moreButton.getAttribute("aria-label"), "更多选项");
    assert.ok(row().querySelector("[data-edit-bar-selection-slot]"), "选中工具段仍在行里");
    assert.ok(row().querySelector("[data-edit-bar-agent]"), "AI 键不许被折");

    await act(async () => {
      moreButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(
      mounted.container.querySelector("[data-test-popover] [data-test-document]"),
      "点「更多选项」应看到文档动作",
    );

    await resizeOverlay(1000);
    assert.ok(
      row().querySelector(":scope > [data-edit-bar-document-slot]"),
      "宽度回来后文档段应重新展开到行里",
    );
    assert.equal(row().querySelector("[data-edit-bar-document-more]"), null);

    // 没有选中工具时文档段就是主内容，不折。
    await mounted.rerender({
      storageKey: "test:edit-bar-single-row:fold",
      selection: null,
      documentSegment,
    });
    await resizeOverlay(300);
    assert.ok(
      row().querySelector(":scope > [data-edit-bar-document-slot]"),
      "没有选中工具时文档段不折",
    );
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("源码闸：prop 名、收起键已删、SelectionToolbar 在行里不画第二个 AI 键", () => {
  const floating = readFileSync(resolve("src/shell/FloatingContextToolbar.tsx"), "utf8");
  assert.match(floating, /documentSegment\?: ReactNode;/);
  assert.match(floating, /trailing\?: ReactNode;/);
  // 行本体的 className 必须 flex-nowrap（折进弹层里的文档动作允许换行，那不是行）。
  const rowClass = /data-workspace-edit-bar\n[\s\S]{0,400}?className="([^"]*)"/.exec(
    floating,
  );
  assert.ok(rowClass, "找不到 [data-workspace-edit-bar] 行的 className");
  assert.match(rowClass[1], /\bflex-nowrap\b/);
  assert.match(rowClass[1], /\bwhitespace-nowrap\b/);
  assert.doesNotMatch(rowClass[1], /\bflex-wrap\b/);

  const controls = readFileSync(resolve("src/shell/EditBarDockControls.tsx"), "utf8");
  assert.doesNotMatch(controls, /data-edit-bar-collapse(?![-\w])/, "收起键不许长回来");
  assert.doesNotMatch(controls, /EditBarCollapseButton/);

  const selection = readFileSync(resolve("src/shell/SelectionToolbar.tsx"), "utf8");
  assert.match(selection, /useInsideEditBarRow\(\)/);
  assert.match(
    selection,
    /const agentButton =\s*layout && !insideRow/,
    "行里 SelectionToolbar 不许再画自己的 AI 键",
  );

  const shell = readFileSync(resolve("src/shell/InlineAdvancedWorkbenchShell.tsx"), "utf8");
  assert.doesNotMatch(
    shell,
    /<div\s[^>]*data-workspace-edit-bar/,
    "壳不许再自己拼 [data-workspace-edit-bar]，容器归 FloatingContextToolbar",
  );
  assert.match(shell, /documentSegment=\{/);
});
