/**
 * X2（2026-09-06）：React #185「Maximum update depth exceeded」的复现与锁。
 *
 * 操作员在工作台 / /history 库里打开任何编辑器都崩在
 * `useSelectionToolbarMeasure.ts readLayout ← useLayoutEffect`。website 开发槽
 * 13:23 UTC 的栈与 14:39 的 [x2-measure] 现场日志给出的机制：
 *
 *   1. 量宽的 layout effect 依赖里有 ReactNode（contextBarLeading / trailing…），
 *      宿主每次重渲染都换新节点 → effect 每次 commit 都重跑 → 同步 readLayout；
 *   2. readLayout 把「可用宽度」算成 **视口右边 − 栏自己当前的左边**（reachable strip），
 *      而栏的左边由控制器按栏的宽度夹取/居中 → 宽度决定位置、位置决定宽度；
 *   3. 三个 setState 都在 layout effect 里同步写 → 每一步都是 React 的 nested update。
 *
 * 一旦「可用宽度」小于当前内容（栏贴着右边时恒成立：available = W − 8），
 * 每一轮都再折一个控件进 More、栏变窄、位置右移、可用宽度再缩……控件多于 50 个
 * 就撞上 React 的 nested-update 上限当场抛错；少于 50 个则全部滑进 More。
 *
 * 这里用 jsdom 把「位置跟着宽度走」做成 getBoundingClientRect 的纯函数，
 * 再让 layout 每次渲染都换新的 contextBarLeading 节点，复现同一条链。
 * 修法必须切断反馈环：容量只看外部边界（舞台 / overlay 可见宽度），
 * 不看栏自己的位置；effect 依赖只留原始值。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
  url: "https://website.oceanleo.com/history/task",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
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
const VIEWPORT_WIDTH = 4_000;
const STAGE_WIDTH = 3_960;
const visualViewport = new window.EventTarget();
Object.assign(visualViewport, {
  width: VIEWPORT_WIDTH,
  height: 640,
  offsetLeft: 0,
  offsetTop: 0,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: visualViewport,
});

class ToolbarResizeObserver {
  static instances = new Set();
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    ToolbarResizeObserver.instances.add(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    ToolbarResizeObserver.instances.delete(this);
  }
  static flush() {
    for (const observer of ToolbarResizeObserver.instances) {
      observer.callback(
        [...observer.targets].map((target) => ({
          target,
          contentRect: target.getBoundingClientRect(),
        })),
        observer,
      );
    }
  }
}
globalThis.ResizeObserver = ToolbarResizeObserver;
window.ResizeObserver = ToolbarResizeObserver;

const CONTROL_COUNT = 160;
const CONTROL_WIDTH = 40;
const GAP = 4;
const MORE_WIDTH = 44;

function rect(width, left = 0, height = 44) {
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + width,
    bottom: height,
    width,
    height,
    toJSON() {
      return this;
    },
  };
}

/** 栏的内容宽度 = 当前可见控件 + 间隙 + （有溢出时）More 键。纯 DOM 函数。 */
function liveToolbarWidth(toolbar) {
  const visible = (toolbar.getAttribute("data-selection-visible-controls") || "")
    .split(" ")
    .filter(Boolean).length;
  const overflow = (toolbar.getAttribute("data-selection-overflow-controls") || "")
    .split(" ")
    .filter(Boolean).length;
  const items = visible + (overflow > 0 ? 1 : 0);
  return (
    visible * CONTROL_WIDTH +
    (overflow > 0 ? MORE_WIDTH : 0) +
    Math.max(0, items - 1) * GAP
  );
}

/**
 * 控制器把栏夹在视口右边 8px 之内（clampEditBarBelowChrome 的 maxX）。
 * 这里把它做成「位置瞬时跟随宽度」：这正是让容量依赖自身位置的旧算法会震荡的形状。
 */
function shellLeftFor(width) {
  return Math.max(8, VIEWPORT_WIDTH - 8 - width);
}

function findToolbar(node) {
  return node.querySelector('[role="toolbar"]');
}

window.HTMLElement.prototype.getBoundingClientRect = function feedbackRect() {
  if (this.hasAttribute("data-selection-measure-control-id")) {
    return rect(CONTROL_WIDTH);
  }
  if (this.hasAttribute("data-selection-toolbar-viewport-capacity")) {
    return rect(VIEWPORT_WIDTH - 32);
  }
  if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
    const toolbar = findToolbar(this);
    const width = toolbar ? liveToolbarWidth(toolbar) : 0;
    return rect(width, shellLeftFor(width));
  }
  if (this.getAttribute("role") === "toolbar") {
    const width = liveToolbarWidth(this);
    return rect(width, shellLeftFor(width));
  }
  if (
    this.hasAttribute("data-feedback-test-host") ||
    this.hasAttribute("data-workspace-floating-toolbar") ||
    this.hasAttribute("data-workspace-floating-toolbar-overlay")
  ) {
    return rect(STAGE_WIDTH, 0);
  }
  return rect(0, 0, 0);
};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

/** 每次渲染都返回**新的** contextBarLeading 节点，与宿主重渲染时的真实形状一致。 */
globalThis.__feedbackLayoutCalls = 0;
async function loadSelectionToolbar() {
  const anchoredPopoverUrl = await compileModule("src/shell/anchored-popover.tsx", {
    react: reactUrl,
    "react-dom": reactDomUrl,
  });
  const iconStubUrl = dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function AdvancedEditorIcon({ name, className }) {
      return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
    }
  `);
  const animationStubUrl = dataModule(`
    export function SelectionAnimationGallery() { return null; }
  `);
  const uiStubUrl = dataModule(`
    export function useUI() { return (value) => value; }
  `);
  const advancedLayoutStubUrl = dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function useAdvancedLayout() {
      globalThis.__feedbackLayoutCalls += 1;
      return {
        toolsLauncher: null,
        contextBarLeading: jsx("span", { "data-feedback-leading": globalThis.__feedbackLayoutCalls }),
        contextBarTrailing: jsx("span", { "data-feedback-trailing": globalThis.__feedbackLayoutCalls }),
        activeDrawerId: "",
        activeTransientPanelId: "",
        closeDrawer() {},
        openDrawer() {},
      };
    }
    export function registerAdvancedToolsTrigger() { return () => {}; }
  `);
  const editorToolsStubUrl = dataModule(`
    export function EditorToolsTrigger() { return null; }
  `);
  const selectionContextStubUrl = dataModule(`
    let nextRequest = 0;
    export function selectionRequestId() { nextRequest += 1; return "feedback-" + nextRequest; }
  `);
  const inspectorHostStubUrl = dataModule(`
    export function useSelectionInspectorHost({ onOpenPanel }) {
      return { openPanel: onOpenPanel || (() => {}), activePanelId: "", fallbackPanel: null };
    }
  `);
  const inboxStubUrl = dataModule(`
    export function publishAgentSelection() {}
  `);
  const buttonControlUrl = await compileModule(
    "src/shell/SelectionToolbarButtonControl.tsx",
    { react: reactUrl },
  );
  const numberControlUrl = await compileModule(
    "src/shell/SelectionToolbarNumberControl.tsx",
    { react: reactUrl },
  );
  const selectControlUrl = await compileModule(
    "src/shell/SelectionToolbarSelectControl.tsx",
    {
      react: reactUrl,
      "./AdvancedEditorIcon": iconStubUrl,
      "./selection-context": selectionContextStubUrl,
      "./anchored-popover": anchoredPopoverUrl,
    },
  );
  const toolbarControlUrl = await compileModule(
    "src/shell/SelectionToolbarControl.tsx",
    {
      "./AdvancedEditorIcon": iconStubUrl,
      "./SelectionAnimationGallery": animationStubUrl,
      "./SelectionToolbarButtonControl": buttonControlUrl,
      "./SelectionToolbarNumberControl": numberControlUrl,
      "./SelectionToolbarSelectControl": selectControlUrl,
      "./selection-context": selectionContextStubUrl,
    },
  );
  const toolbarMeasureHookUrl = await compileModule(
    "src/shell/useSelectionToolbarMeasure.ts",
    { react: reactUrl },
  );
  const toolbarUrl = await compileModule("src/shell/SelectionToolbar.tsx", {
    react: reactUrl,
    "react-dom": reactDomUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./SelectionAnimationGallery": animationStubUrl,
    "./advanced-layout-context": advancedLayoutStubUrl,
    "./EditorToolsIcon": editorToolsStubUrl,
    "./selection-context": selectionContextStubUrl,
    "./selection-inspector-host": inspectorHostStubUrl,
    "./agent-review/inbox": inboxStubUrl,
    "./anchored-popover": anchoredPopoverUrl,
    "./SelectionToolbarControl": toolbarControlUrl,
    "./SelectionToolbarButtonControl": buttonControlUrl,
    "./SelectionToolbarNumberControl": numberControlUrl,
    "./SelectionToolbarSelectControl": selectControlUrl,
    "./useSelectionToolbarMeasure": toolbarMeasureHookUrl,
  });
  return (await import(toolbarUrl)).SelectionToolbar;
}

function buildContext() {
  return {
    version: 1,
    kind: "website-block",
    id: "block:hero",
    label: "网站区块编辑工具",
    controls: Array.from({ length: CONTROL_COUNT }, (_, index) => ({
      id: `tool-${index}`,
      kind: "action",
      label: `工具 ${index}`,
      icon: "bold",
      iconOnly: true,
    })),
  };
}

async function mountFloating(SelectionToolbar, props) {
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  host.setAttribute("data-feedback-test-host", "");
  document.body.append(host);
  const overlay = document.createElement("div");
  overlay.setAttribute("data-workspace-floating-toolbar-overlay", "");
  host.append(overlay);
  const layer = document.createElement("div");
  layer.setAttribute("data-workspace-floating-toolbar", "");
  overlay.append(layer);
  const translated = document.createElement("div");
  translated.setAttribute("data-workspace-edit-bar-toolbar", "");
  layer.append(translated);
  // 刻意**不**用 act 包首次渲染：act 会把 layout effect 里的同步 setState 排进
  // 自己的队列，React 的 nested-update 计数器就不会像浏览器里那样撞上 50 抛
  // #185。这里要的就是浏览器那条链。
  const root = createRoot(translated, {
    onUncaughtError(error) {
      console.error(String(error && error.message));
    },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    root.render(React.createElement(SelectionToolbar, props));
    await new Promise((resolve) => setTimeout(resolve, 80));
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  return {
    host,
    root,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test("edit bar measurement never feeds its own width back into capacity (React #185)", async () => {
  const SelectionToolbar = await loadSelectionToolbar();
  const context = buildContext();
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  let mounted = null;
  let thrown = null;
  try {
    try {
      mounted = await mountFloating(SelectionToolbar, {
        context,
        onCommand() {},
      });
    } catch (error) {
      thrown = error;
    }
    assert.equal(
      thrown,
      null,
      `mount must not throw, got: ${String(thrown && thrown.message).slice(0, 200)}`,
    );
    assert.equal(
      errors.filter((line) => /Maximum update depth/.test(line)).length,
      0,
      `React #185 surfaced: ${errors.find((line) => /Maximum update depth/.test(line))}`,
    );
    const toolbar = findToolbar(mounted.host);
    assert.ok(toolbar);
    const visible = (toolbar.getAttribute("data-selection-visible-controls") || "")
      .split(" ")
      .filter(Boolean);
    const overflow = (toolbar.getAttribute("data-selection-overflow-controls") || "")
      .split(" ")
      .filter(Boolean);
    assert.equal(visible.length + overflow.length, CONTROL_COUNT);
    // 容量按舞台宽度（1000 − 16 = 984）算：44 + k·(40+4) ≤ 984 → k = 21。
    // 旧算法在这里要么抛 #185，要么把 60 个控件全部滑进 More（visible = 0）。
    assert.ok(
      visible.length >= 10,
      `the bar must keep real controls visible under a 1000px stage, got visible=${visible.length} renders=${globalThis.__feedbackLayoutCalls} errors=${errors.length}:${errors.slice(0,2).join(" / ").slice(0,300)}`,
    );
    assert.ok(overflow.length > 0, "60 controls cannot fit; More must exist");
    // 宿主重渲染只应带来常数次量宽，不再每次 commit 都同步重量。
    assert.ok(
      globalThis.__feedbackLayoutCalls < 12,
      `SelectionToolbar rendered ${globalThis.__feedbackLayoutCalls} times during a single mount`,
    );

    // 栏挪到别处（位置变、宽度不变）不得改变容量：容量只看边界。
    await act(async () => {
      ToolbarResizeObserver.flush();
    });
    assert.equal(
      toolbar.getAttribute("data-selection-visible-controls"),
      visible.join(" "),
      "re-observing the same boundary must not change the projection",
    );
  } finally {
    console.error = originalConsoleError;
    if (mounted) await mounted.unmount();
  }
});
