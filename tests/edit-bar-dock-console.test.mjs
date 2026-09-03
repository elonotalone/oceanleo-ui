import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, {
  act,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  EDIT_BAR_DOCK_OFFSET_LIMIT,
  editBarDockStorageKey,
  parseEditBarDockState,
  serializeEditBarDockState,
} from "../src/shell/edit-bar-dock-state.ts";
import {
  DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX,
  clampFloatingToolbarToBounds,
  dockedFloatingToolbarPosition,
  isFloatingToolbarDockIntent,
  pointNearFloatingToolbarBounds,
  rectNearFloatingToolbarBounds,
} from "../src/shell/floating-toolbar-geometry.ts";

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
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);
const chromeStubUrl = dataModule(`
  export function advancedWorkbenchStyle(accent) {
    return { "--awb-accent": accent, "--awb-accent-soft": accent + "18" };
  }
`);
const iconsStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function IconLibrary(props) {
    return jsx("span", { ...props, "data-icon": "library" });
  }
`);
const workspaceActionsStubUrl = dataModule(`
  export const WORKSPACE_ACTION_EVENT = "oceanleo:test-workspace-action";
`);

const controlsUrl = await compileModule(
  "src/shell/EditBarDockControls.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./edit-bar-dock-state": stateUrl,
    "./floating-toolbar-geometry": geometryUrl,
  },
);
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
    "./edit-bar-dock-controller": controllerUrl,
    // 收起圆现在由浮层直接渲染，这条边不钉住的话会把控件模块重编一份，
    // 那一份拿不到 useUI 替身，运行期会撞进真 use-intl。
    "./EditBarDockControls": controlsUrl,
    "./edit-bar-dock-state": stateUrl,
  },
);
const { FloatingContextToolbar, useFloatingContextToolbar } =
  await import(floatingUrl);

const hostUrl = await compileModule("src/shell/EditBarDockHost.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./advanced-workbench-chrome": chromeStubUrl,
  "./edit-bar-dock-state": stateUrl,
});
const { EditBarDockHost } = await import(hostUrl);
const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./workspace-actions": workspaceActionsStubUrl,
  "./EditBarDockHost": hostUrl,
});
const { SplitWorkspace, useRightPaneSlot, useWorkspacePane } =
  await import(splitUrl);

const workbenchRoutesUrl = pathToFileURL(
  resolve("src/shell/workbench-routes.ts"),
).href;
const layoutContextStubUrl = dataModule(`
  import { createContext } from ${JSON.stringify(reactUrl)};
  export const AdvancedLayoutContext = createContext(null);
`);
const inertComponentStubUrl = dataModule(`
  export function AdvancedStageControls() { return null; }
  export function InlineEditorMaterialPanel() { return null; }
  export function useWorkbenchMaterials() { return null; }
  export function useAdvancedSession() { return null; }
  export function useRightPaneSlot() { return null; }
  export function useWorkspacePane() { return null; }
  export function useAdvancedRecovery() {}
  export function useAdvancedAutoSave() {
    return {
      state: "saved",
      flushLatest: async () => ({ ok: true }),
      retry: async () => {},
    };
  }
  export function resolveActiveMaterialAction() { return undefined; }
  export function resolveInlineAdvancedDrawers() { return []; }
  export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
  export function useInlineAdvancedWorkbenchDrop() {
    return { dropMessage: "", performUpload() {}, handleDrop() {} };
  }
`);
const shellLeafStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function InlineAdvancedWorkbenchHeader() {
    return jsx("div", { "data-test-action-bar": true });
  }
  export function AdvancedWorkbenchStage({ editorStage }) {
    return jsx("div", { "data-test-editor-stage": true, children: editorStage });
  }
  export function createLiveReactNodeStore() {
    return { node: null, listeners: new Set() };
  }
  export function publishLiveReactNode(store, node) {
    store.node = node;
    store.listeners.forEach((listener) => listener());
  }
  export function LiveReactNode() { return null; }
`);
// agent 面板真身会拖进整个 FunctionAgentChat 依赖树；本文件测的是 dock 行为，
// 只需要它作为抽屉存在，不需要它能对话。
const agentPanelStubUrl = dataModule(`
  export const PLUGIN_AGENT_DRAWER_ID = "agent";
  export function PluginAgentPanel() { return null; }
`);
const inlineShellUrl = await compileModule(
  "src/shell/InlineAdvancedWorkbenchShell.tsx",
  {
    "../i18n/ui/useUI": uiStubUrl,
    "./plugin-chrome/PluginAgentPanel": agentPanelStubUrl,
    "./plugin-chrome/agent-drawer": agentPanelStubUrl,
    "./advanced-layout-context": layoutContextStubUrl,
    "./AdvancedStageControls": inertComponentStubUrl,
    "./AdvancedWorkbenchStage": shellLeafStubUrl,
    "./FloatingContextToolbar": floatingUrl,
    "./EditBarDockHost": hostUrl,
    "./InlineAdvancedWorkbenchHeader": shellLeafStubUrl,
    "./advanced-leave-flush": inertComponentStubUrl,
    "./inline-advanced-shell-helpers": inertComponentStubUrl,
    "./inline-advanced-workbench-drop": inertComponentStubUrl,
    "./advanced-session-context": inertComponentStubUrl,
    "./advanced-workbench-chrome": chromeStubUrl,
    "./InlineEditorMaterialPanel": inertComponentStubUrl,
    "./workbench-material-provider": inertComponentStubUrl,
    "./SplitWorkspace": inertComponentStubUrl,
    "./use-advanced-autosave": inertComponentStubUrl,
    "./use-advanced-recovery": inertComponentStubUrl,
    "./live-react-node": shellLeafStubUrl,
    "./workbench-routes": workbenchRoutesUrl,
  },
);
const { InlineAdvancedWorkbenchShell } = await import(inlineShellUrl);

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

async function key(target, value) {
  await act(async () => {
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function pointer(target, type, values) {
  await act(async () => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(event, name, { configurable: true, value });
    }
    target.dispatchEvent(event);
  });
}

// 左右两个 ⠿ 手柄已取消。新手势：在条上任意位置双击并按住拖，
// 松手落下，Esc 还原。下面三个 helper 就是这套手势。
async function grab(target, clientX, clientY) {
  const press = {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY,
  };
  await pointer(target, "pointerdown", press);
  await pointer(target, "pointerdown", press);
}

async function moveTo(target, clientX, clientY) {
  await pointer(window, "pointermove", {
    pointerId: 1,
    pointerType: "mouse",
    clientX,
    clientY,
  });
}

async function drop(target, clientX, clientY) {
  await pointer(window, "pointerup", {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY,
  });
}

async function altKey(target, value, extra = {}) {
  await act(async () => {
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: value,
        altKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      }),
    );
  });
}

function DockHarness({ storageKey }) {
  const rootRef = useRef(null);
  const dockRef = useRef(null);
  const stageRef = useRef(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: rootRef,
    stageRef,
    dockRootRef: dockRef,
    resetKey: storageKey,
    storageKey,
  });
  return React.createElement(
    "div",
    { ref: rootRef, "data-edit-bar-test-root": true },
    React.createElement(EditBarDockHost, {
      hostRef: dockRef,
      presentation: {
        ownerId: "dock-harness",
        mode: controller.mode,
        dropActive: controller.dropActive,
        accent: "#6d5dfc",
      },
    }),
    React.createElement("div", {
      ref: stageRef,
      "data-edit-bar-test-stage": true,
    }),
    React.createElement(
      FloatingContextToolbar,
      { controller, accent: "#6d5dfc" },
      React.createElement(
        "div",
        {
          "data-selection-anchor-x": "400",
          "data-selection-anchor-y": "200",
          "data-selection-anchor-width": "100",
          "data-selection-anchor-height": "40",
        },
        controller.leading,
        React.createElement("span", null, "selection controls"),
        controller.trailing,
      ),
    ),
  );
}

test("dock state is versioned, bounded, and isolated per workbench", () => {
  const state = {
    version: 2,
    mode: "floating",
    offset: { x: 32, y: -48 },
    presentation: "expanded",
    collapsedPosition: null,
  };
  assert.deepEqual(parseEditBarDockState(serializeEditBarDockState(state)), state);
  // 收起态与收起位置必须一起往返：小圆用图层绝对坐标，丢了就会跑回默认角落。
  const collapsed = {
    version: 2,
    mode: "floating",
    offset: { x: 0, y: 0 },
    presentation: "collapsed",
    collapsedPosition: { x: 640, y: 420 },
  };
  assert.deepEqual(
    parseEditBarDockState(serializeEditBarDockState(collapsed)),
    collapsed,
  );
  // v1 旧记录升级而非丢弃，否则所有既有用户的固定偏好会一次性归零。
  assert.deepEqual(
    parseEditBarDockState(
      JSON.stringify({ version: 1, mode: "docked", offset: { x: 5, y: 6 } }),
    ),
    {
      version: 2,
      mode: "docked",
      offset: { x: 5, y: 6 },
      presentation: "expanded",
      collapsedPosition: null,
    },
  );
  assert.equal(parseEditBarDockState("{broken"), null);
  assert.equal(
    parseEditBarDockState(
      JSON.stringify({
        ...state,
        offset: { x: EDIT_BAR_DOCK_OFFSET_LIMIT + 1, y: 0 },
      }),
    ),
    null,
  );
  assert.notEqual(
    editBarDockStorageKey("image:artifact-one"),
    editBarDockStorageKey("image:artifact-two"),
  );
});

test("floating geometry is shell-bounded inside a clipped non-layout overlay", async () => {
  assert.deepEqual(
    clampFloatingToolbarToBounds(
      { x: 10_000, y: 10_000 },
      { left: 40, top: 20, right: 640, bottom: 420 },
      { width: 300, height: 52 },
    ),
    { x: 332, y: 360 },
  );
  assert.deepEqual(
    clampFloatingToolbarToBounds(
      { x: -10_000, y: -10_000 },
      { left: 40, top: 20, right: 640, bottom: 420 },
      { width: 300, height: 52 },
    ),
    { x: 48, y: 28 },
  );
  assert.equal(
    pointNearFloatingToolbarBounds(
      { x: 92, y: 30 },
      { left: 100, top: 40, right: 900, bottom: 104 },
      24,
    ),
    true,
  );
  assert.equal(
    rectNearFloatingToolbarBounds(
      { left: 818, top: 216, right: 862, bottom: 260 },
      { left: 293, top: 201, right: 1643, bottom: 257 },
      24,
    ),
    true,
  );
  assert.equal(
    isFloatingToolbarDockIntent(
      { x: 840, y: 48 },
      { left: 293, top: 201, right: 1643, bottom: 257 },
      { left: 818, top: 216, right: 862, bottom: 260 },
      24,
    ),
    true,
    "clamped toolbar in the dock band counts even when the pointer overshot above",
  );
  assert.equal(
    isFloatingToolbarDockIntent(
      { x: 840, y: 48 },
      { left: 293, top: 201, right: 1643, bottom: 257 },
      { left: 779, top: 308, right: 823, bottom: 352 },
      24,
    ),
    false,
    "overshoot alone must not dock while the toolbar is still below the band",
  );
  // V5 website: short 56px dock + ~59px floating chrome → gap=-3 overlap.
  // Docked placement must anchor above the stage with a small non-negative gap.
  const docked = dockedFloatingToolbarPosition({
    layerLeft: 0,
    layerTop: 0,
    dock: { left: 40, top: 52, right: 960, bottom: 108 },
    stageTop: 108,
    toolbar: { width: 320, height: 59 },
  });
  assert.equal(DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX, 2);
  assert.equal(docked.y, 108 - 59 - DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX);
  assert.equal(108 - (docked.y + 59), DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX);
  assert.ok(
    108 - (docked.y + 59) >= 0 && 108 - (docked.y + 59) <= 8,
    "website edit-bar clearance must stay a few non-negative px above the frame",
  );
  const [floatingSource, controllerSource, inlineSource, splitSource, dockHostSource] =
    await Promise.all([
      readFile(
        new URL("../src/shell/FloatingContextToolbar.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/shell/edit-bar-dock-controller.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/shell/InlineAdvancedWorkbenchShell.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/shell/SplitWorkspace.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/shell/EditBarDockHost.tsx", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(floatingSource, /data-workspace-floating-toolbar-overlay/);
  assert.match(floatingSource, /data-floating-toolbar-boundary="editor-shell"/);
  assert.match(floatingSource, /pointer-events-none absolute inset-0 overflow-hidden/);
  assert.match(floatingSource, /contain: "layout paint"/);
  assert.match(floatingSource, /data-workspace-docked-toolbar=\{docked/);
  assert.match(floatingSource, /data-workspace-floating-toolbar=\{!docked/);
  assert.match(floatingSource, /data-workspace-edit-bar-toolbar/);
  assert.match(
    controllerSource,
    /setPortalRoot\([\s\S]{0,120}workspaceRootRef\?\.current[\s\S]{0,120}dockRootRef\?\.current\?\.parentElement/,
  );
  assert.match(controllerSource, /Math\.min\(stage\.top, dockBounds\.top, layer\.top\)/);
  assert.match(controllerSource, /isFloatingToolbarDockIntent/);
  assert.match(controllerSource, /dockedFloatingToolbarPosition/);
  assert.match(
    await readFile(
      new URL("../src/shell/floating-toolbar-geometry.ts", import.meta.url),
      "utf8",
    ),
    /export function isFloatingToolbarDockIntent/,
  );
  assert.match(
    await readFile(
      new URL("../src/shell/floating-toolbar-geometry.ts", import.meta.url),
      "utf8",
    ),
    /export function dockedFloatingToolbarPosition/,
  );
  assert.match(dockHostSource, /min-h-16/);
  assert.match(dockHostSource, /data-edit-bar-dock-sentinel[\s\S]{0,120}h-16/);
  assert.match(
    inlineSource,
    /data-edit-bar-layer-root=\{!rightPaneSlot \|\| undefined\}[\s\S]{0,120}relative[\s\S]{0,120}overflow-hidden/,
  );
  assert.match(
    splitSource,
    /data-edit-bar-layer-root[\s\S]{0,160}relative[\s\S]{0,160}overflow-hidden/,
  );
});

test("单击收起键：按下后要等过双击窗口才收成圆", async () => {
  window.localStorage.clear();
  const mounted = await createMounted(DockHarness, {
    storageKey: "test:edit-bar:single-collapse",
  });
  try {
    const collapse = mounted.container.querySelector("[data-edit-bar-collapse]");
    assert.ok(collapse, "收起键必须在");
    await pointer(collapse, "pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 380,
      clientY: 70,
    });
    await click(collapse);
    assert.equal(
      mounted.container.querySelector("[data-edit-bar-collapsed-pill]"),
      null,
      "双击窗口内单击不得立刻收成圆",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-collapsed-pill]"),
      "过了双击窗口，单击必须收成圆",
    );
  } finally {
    await mounted.unmount();
  }
});

test("双击进入移动模式：拖出、回停靠、Esc 取消、键盘移动、收起为圆再展开", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar:dock-cycle";
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-edit-bar-dock") ||
      this.hasAttribute("data-edit-bar-dock-sentinel")
    ) {
      return {
        x: 100, y: 40, left: 100, top: 40, right: 900, bottom: 104,
        width: 800, height: 64, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 0, y: 110, left: 0, top: 110, right: 1000, bottom: 600,
        width: 1000, height: 490, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 100;
      const top = match ? Number(match[2]) : 46;
      return {
        x: left, y: top, left, top, right: left + 300, bottom: top + 52,
        width: 300, height: 52, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  const mounted = await createMounted(DockHarness, { storageKey });
  const dock = () =>
    mounted.container.querySelector("[data-workspace-edit-bar-dock]");
  const bar = () =>
    mounted.container.querySelector("[data-workspace-edit-bar-toolbar]");
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.equal(
      bar().closest("[data-workspace-docked-toolbar]").getBoundingClientRect()
        .width,
      1000,
      "the docked sizing boundary must retain the shell width",
    );
    assert.equal(bar().getBoundingClientRect().width, 300);
    assert.equal(
      mounted.container.querySelectorAll("[data-floating-toolbar-handle]")
        .length,
      0,
      "左右两个 ⠿ 拖拽手柄必须彻底消失",
    );
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-collapse]"),
      "最右侧必须常驻一个收起按钮",
    );

    const collapse = () =>
      mounted.container.querySelector("[data-edit-bar-collapse]");
    const collapsePress = {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 380,
      clientY: 70,
    };
    await pointer(collapse(), "pointerdown", collapsePress);
    await click(collapse());
    await pointer(collapse(), "pointerdown", collapsePress);
    assert.equal(
      mounted.container.querySelector("[data-edit-bar-collapsed-pill]"),
      null,
      "双击落在收起键上不得把条收成圆",
    );
    await drop(bar(), 380, 70);

    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("aria-pressed"),
      "true",
    );

    const initialScrollExtent = {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    };
    await grab(bar(), 120, 60);
    await moveTo(bar(), 400, 300);
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
      "the first movement must undock and move the bar before the drop",
    );
    assert.equal(dock().dataset.editBarDockCollapsed, "true");
    const movedRect = bar().getBoundingClientRect();
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    const resizedRect = bar().getBoundingClientRect();
    assert.deepEqual(
      { left: resizedRect.left, top: resizedRect.top },
      { left: movedRect.left, top: movedRect.top },
      "collapsing/reflowing the dock must not consume or jump the drag",
    );
    assert.deepEqual(
      {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      initialScrollExtent,
      "the transformed overlay must not grow page scroll",
    );

    await moveTo(bar(), 200, 70);
    assert.equal(dock().dataset.dropHighlight, "true");
    assert.equal(dock().dataset.editBarDockCollapsed, "false");
    const crossingRect = bar().getBoundingClientRect();
    const dockRect = dock().getBoundingClientRect();
    assert.ok(
      crossingRect.top < dockRect.bottom && crossingRect.bottom > dockRect.top,
      "the moving bar must visibly cross the dock target",
    );
    await drop(bar(), 200, 70);
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
      "one release in the target must redock the first gesture",
    );

    await grab(bar(), 120, 60);
    await moveTo(bar(), 400, 300);
    await drop(bar(), 400, 300);
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(dock().dataset.editBarDockCollapsed, "true");
    assert.match(dock().className, /\bh-0\b/);
    assert.ok(dock().querySelector("[data-edit-bar-dock-sentinel]"));
    assert.equal(parseEditBarDockState(window.localStorage.getItem(storageKey)).mode, "floating");

    // 进出停靠带要反复切换高亮，而不是只在第一次进入时亮一下。
    await grab(bar(), 400, 300);
    await moveTo(bar(), 200, 70);
    assert.equal(dock().dataset.dropHighlight, "true");
    assert.equal(dock().dataset.editBarDockCollapsed, "false");
    await moveTo(bar(), 960, 300);
    assert.equal(dock().dataset.dropHighlight, "false");
    assert.equal(dock().dataset.editBarDockCollapsed, "true");
    await moveTo(bar(), 200, 70);
    assert.equal(dock().dataset.dropHighlight, "true");
    await drop(bar(), 200, 70);
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.equal(dock().dataset.dropHighlight, "false");

    // Esc 必须能放弃一次移动并还原到原位，否则误触双击就回不去了。
    //
    // 吸附现在是**带初速度弹过去**而不是瞬移（W02），所以上一次 drop 之后
    // 弹簧还在飞，此刻读到的 transform 是一个中间帧。先把全场弹簧按停再取基准，
    // 断言的意图不变（Esc 还原到原位），比较的反而是真正的落定位置。
    // `__leoMotionJumpAllToRest` 就是 `src/lib/motion` 为此暴露的钩子。
    assert.equal(
      typeof window.__leoMotionJumpAllToRest,
      "function",
      "动效测试钩子必须挂得上，否则这条断言测的是某个中间帧",
    );
    await act(async () => window.__leoMotionJumpAllToRest());
    const beforeCancel = bar().style.transform;
    await grab(bar(), 200, 70);
    await moveTo(bar(), 700, 420);
    assert.notEqual(bar().style.transform, beforeCancel);
    await act(async () => {
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(bar().style.transform, beforeCancel);

    await click(mounted.container.querySelector("[data-edit-bar-pin]"));
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("aria-pressed"),
      "false",
    );
    await altKey(bar(), "Enter");
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );

    // 手柄取消后键盘仍要能移动：焦点在条内时 Alt+方向键生效。
    await click(mounted.container.querySelector("[data-edit-bar-pin]"));
    await altKey(bar(), "ArrowRight");
    assert.notDeepEqual(
      parseEditBarDockState(window.localStorage.getItem(storageKey)).offset,
      { x: 0, y: 0 },
    );
    await altKey(bar(), "Home");
    assert.deepEqual(
      parseEditBarDockState(window.localStorage.getItem(storageKey)).offset,
      { x: 0, y: 0 },
    );

    // 收起为圆 → 拖动圆 → 再点圆展开。
    await click(mounted.container.querySelector("[data-edit-bar-collapse]"));
    const pill = () =>
      mounted.container.querySelector("[data-edit-bar-collapsed-pill]");
    assert.ok(pill(), "收起后应只剩一个圆");
    assert.equal(
      parseEditBarDockState(window.localStorage.getItem(storageKey))
        .presentation,
      "collapsed",
    );
    await pointer(pill(), "pointerdown", {
      pointerId: 7,
      pointerType: "mouse",
      button: 0,
      clientX: 400,
      clientY: 300,
    });
    await pointer(pill(), "pointermove", {
      pointerId: 7,
      pointerType: "mouse",
      clientX: 520,
      clientY: 380,
    });
    await pointer(pill(), "pointerup", {
      pointerId: 7,
      pointerType: "mouse",
      clientX: 520,
      clientY: 380,
    });
    assert.ok(pill(), "拖动小圆不应把它展开");
    const parked = parseEditBarDockState(
      window.localStorage.getItem(storageKey),
    ).collapsedPosition;
    assert.ok(parked, "收起位置必须落盘");
    await click(pill());
    assert.equal(pill(), null, "点击小圆应展开回胶囊");
    assert.ok(bar().querySelector("[data-edit-bar-collapse]"));
  } finally {
    await mounted.unmount();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

/**
 * 手柄被删掉之前，键盘快捷键的**广告位**挂在手柄上，而且是被断言着的
 * （旧断言 `/Enter.*ArrowLeft.*Home/`）。手柄一没，展开态就一个
 * `aria-keyshortcuts` 都不剩——键盘与读屏用户从此看不到「这条能移动」。
 *
 * 这一条把广告位与实现**对钉**：广告里的每一个组合键都必须真的干活，
 * 反过来能干活的也必须出现在广告里。只断言字符串等于某个常量是不够的——
 * 那样把实现改坏、广告不动，测试照旧全绿。
 */
test("键盘快捷键的广告位与实现对得上（展开态用 Alt+，收起圆用裸方向键）", async () => {
  const storageKey = "test:edit-bar-keyshortcuts";
  window.localStorage.clear();
  const mounted = await createMounted(DockHarness, { storageKey });
  const bar = () =>
    mounted.container.querySelector("[data-workspace-edit-bar-toolbar]");
  const savedOffset = () =>
    parseEditBarDockState(window.localStorage.getItem(storageKey)).offset;

  /** 把 `Alt+ArrowLeft` / `Control+.` 这样的字符串打成一次真事件。 */
  const chord = async (target, spec) => {
    const parts = spec.split("+");
    const value = parts.pop();
    await act(async () => {
      target.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: value,
          altKey: parts.includes("Alt"),
          ctrlKey: parts.includes("Control"),
          metaKey: parts.includes("Meta"),
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };

  try {
    // ── 展开态：广告位必须在，且内容与 onRootKeyDown 认的键一致 ──
    const advertised = bar().getAttribute("aria-keyshortcuts");
    assert.ok(
      advertised,
      "展开态的编辑栏必须有 aria-keyshortcuts —— 手柄没了，广告位得搬家",
    );
    assert.deepEqual(
      advertised.split(" ").sort(),
      [
        "Alt+ArrowDown",
        "Alt+ArrowLeft",
        "Alt+ArrowRight",
        "Alt+ArrowUp",
        "Alt+Enter",
        "Alt+Home",
        "Control+.",
        "Meta+.",
      ].sort(),
      `广告位与实现漂移了：${advertised}`,
    );

    // 广告里的四个方向键**逐个**都要真的移动这条，不是列着好看。
    for (const [spec, axis, sign] of [
      ["Alt+ArrowRight", "x", 1],
      ["Alt+ArrowLeft", "x", -1],
      ["Alt+ArrowDown", "y", 1],
      ["Alt+ArrowUp", "y", -1],
    ]) {
      await chord(bar(), "Alt+Home");
      assert.deepEqual(savedOffset(), { x: 0, y: 0 }, "Alt+Home 应当归位");
      await chord(bar(), spec);
      const moved = savedOffset();
      assert.ok(
        Math.sign(moved[axis]) === sign,
        `${spec} 没有把 ${axis} 往 ${sign > 0 ? "正" : "负"}向移动：${JSON.stringify(moved)}`,
      );
    }

    // Alt+Enter 切停靠：广告了就必须生效。
    await chord(bar(), "Alt+Enter");
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
      "Alt+Enter 应当把条停靠回去",
    );

    // Control+. 与 Meta+. 都收起，两个都广告了就两个都要能用。
    for (const spec of ["Control+.", "Meta+."]) {
      const root = mounted.container.querySelector(
        "[data-edit-bar-presentation]",
      );
      if (root.dataset.editBarPresentation === "collapsed") {
        await chord(bar(), spec);
      }
      await chord(bar(), spec);
      assert.equal(
        mounted.container.querySelector("[data-edit-bar-presentation]").dataset
          .editBarPresentation,
        "collapsed",
        `${spec} 应当收起为圆`,
      );
      await chord(bar(), spec);
    }

    // ── 收起圆：它的广告位刻意**不带** Alt ──
    // 圆本身是按钮、拿得到焦点，不必和条内的输入框抢方向键，
    // 所以 moveByKeyboard 收裸键。这条防的是有人「顺手统一成 Alt+」。
    await click(mounted.container.querySelector("[data-edit-bar-collapse]"));
    const pill = mounted.container.querySelector(
      "[data-edit-bar-collapsed-pill]",
    );
    assert.ok(pill, "收起后应当有圆");
    const pillAd = pill.getAttribute("aria-keyshortcuts");
    assert.ok(pillAd, "收起圆必须保留它的键盘广告位");
    assert.ok(
      !pillAd.includes("Alt+"),
      `收起圆收的是裸方向键，广告位不该写 Alt+：${pillAd}`,
    );

    // 圆的键盘**移动行为**这里不断言，刻意的：`collapsedPosition` 存的是
    // 夹取后的值（`setCollapsedPosition` → `positionForOffset` →
    // `clampFloatingToolbarToBounds`），而本用例没装 rect 替身，
    // jsdom 的 rect 全是 0 ⇒ 任何请求点都会被夹到同一个点，读到的永远是「没动」。
    // 那是 harness 的假读数，不是实现坏了（实测两次读数都是 {x:8,y:8}）。
    // 要断言圆的位移得先照抄上面那个用例的 rect 替身；本条只管**广告位形状**。
    await key(pill, "ArrowRight");
    assert.ok(
      pill.isConnected,
      "裸方向键不该把圆卸载掉（说明键落进了别的分支）",
    );
  } finally {
    await mounted.unmount();
  }
});

test("discrete overshoot past the dock band still flies open and redocks", async () => {
  // Mirrors V1 production failure: after undock, pointer jumps from below the
  // dock strip to chrome above it (y≈48) while the handle clamps in-band.
  window.localStorage.clear();
  const storageKey = "test:edit-bar:overshoot-redock";
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 160, left: 0, top: 160, right: 1350, bottom: 1050,
        width: 1350, height: 890, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-edit-bar-dock") ||
      this.hasAttribute("data-edit-bar-dock-sentinel")
    ) {
      const collapsed =
        this.getAttribute?.("data-edit-bar-dock-collapsed") === "true";
      const top = 201;
      const height = collapsed ? 0 : 56;
      return {
        x: 293, y: top, left: 293, top, right: 1643, bottom: top + (height || 56),
        width: 1350, height: height || 56, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 293, y: 257, left: 293, top: 257, right: 1643, bottom: 1050,
        width: 1350, height: 793, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 293;
      const top = match ? Number(match[2]) : 205;
      return {
        x: left, y: top, left, top, right: left + 300, bottom: top + 44,
        width: 300, height: 44, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return {
        x: 0, y: 160, left: 0, top: 160, right: 1350, bottom: 1050,
        width: 1350, height: 890, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  const mounted = await createMounted(DockHarness, { storageKey });
  const dock = () =>
    mounted.container.querySelector("[data-workspace-edit-bar-dock]");
  const bar = () =>
    mounted.container.querySelector("[data-workspace-edit-bar-toolbar]");
  try {
    await grab(bar(), 620, 230);
    await moveTo(bar(), 801, 450);
    await drop(bar(), 801, 450);
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(dock().dataset.editBarDockCollapsed, "true");

    await grab(bar(), 801, 450);
    await moveTo(bar(), 801, 330);
    // Discrete leap over the dock band into chrome above the strip.
    await moveTo(bar(), 840, 48);
    assert.equal(
      dock().dataset.dropHighlight,
      "true",
      "dock must expand/highlight when the clamped bar occupies the band",
    );
    assert.equal(dock().dataset.editBarDockCollapsed, "false");
    await moveTo(bar(), 900, 56);
    assert.equal(dock().dataset.dropHighlight, "true");
    await drop(bar(), 880, 44);
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
      "release after overshoot must redock on the same gesture",
    );
  } finally {
    await mounted.unmount();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

test("saved floating state restores and malformed state resets to the dock", async () => {
  const storageKey = "test:edit-bar:restore";
  window.localStorage.setItem(
    storageKey,
    serializeEditBarDockState({
      version: 1,
      mode: "floating",
      offset: { x: 33, y: 44 },
    }),
  );
  let mounted = await createMounted(DockHarness, { storageKey });
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(
      mounted.container.querySelector("[data-workspace-edit-bar-toolbar]")
        .dataset.editBarOffset,
      "33,44",
    );
  } finally {
    await mounted.unmount();
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 1,
      mode: "floating",
      offset: { x: "not-a-number", y: 0 },
    }),
  );
  mounted = await createMounted(DockHarness, { storageKey });
  try {
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
    assert.equal(window.localStorage.getItem(storageKey), null);
  } finally {
    await mounted.unmount();
  }
});

function RightPaneRuntime() {
  const pane = useWorkspacePane();
  const slot = useRightPaneSlot();
  const [presentation, setPresentation] = useState({
    ownerId: "edit-bar-test",
    mode: "docked",
    dropActive: false,
    accent: "#6d5dfc",
  });
  const actionRow = useMemo(
    () =>
      React.createElement(
        "div",
        {
          "data-advanced-action-row": true,
          role: "toolbar",
          "aria-label": "工作区操作",
        },
        "素材库 我的库",
      ),
    [],
  );
  useLayoutEffect(() => {
    slot?.setRightEditorHeader(true);
    slot?.setRightLabel(actionRow);
    return () => {
      slot?.clearRightLabel(actionRow);
      slot?.setRightEditorHeader(false);
    };
  }, [actionRow, slot]);
  useLayoutEffect(() => {
    slot?.setEditBarDockPresentation(presentation);
    return () => slot?.clearEditBarDockPresentation("edit-bar-test");
  }, [presentation, slot]);
  return React.createElement(
    "div",
    { "data-right-runtime": true },
    React.createElement(
      "button",
      {
        type: "button",
        "data-open-selection-detail": true,
        onClick() {
          pane?.showDetail({
            ownerId: "edit-bar-test",
            id: "selection-inspector",
            label: "对象属性",
            content: React.createElement(
              "div",
              { "data-selection-detail": true },
              "对象属性",
            ),
          });
        },
      },
      "open detail",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        "data-highlight-dock": true,
        onClick() {
          setPresentation((current) => ({
            ...current,
            mode: "floating",
            dropActive: true,
          }));
        },
      },
      "highlight dock",
    ),
  );
}

test("dock follows the action row and showDetail reveals console without exiting fullscreen", async () => {
  let exitFullscreenCalls = 0;
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value() {
      exitFullscreenCalls += 1;
    },
  });
  const mounted = await createMounted(SplitWorkspace, {
    left: React.createElement("div", { "data-operation-console": true }),
    right: React.createElement(RightPaneRuntime),
    leftLabel: "操作台",
    rightLabel: "库",
    library: { open: true, paneTitle: "库" },
    headerHeight: 0,
  });
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const rightPane = root.querySelector('[data-workspace-pane="main"]');
    const leftPane = root.querySelector('[data-workspace-pane="left"]');
    const actionRow = rightPane.querySelector("[data-advanced-action-row]");
    const header = actionRow.closest("[data-pane-header]");
    const dock = rightPane.querySelector("[data-workspace-edit-bar-dock]");
    assert.equal(header.nextElementSibling, dock);
    assert.equal(dock.parentElement, rightPane);
    assert.equal(dock.getAttribute("aria-label"), "编辑栏停靠区");
    assert.equal(dock.dataset.editBarDockState, "docked");
    assert.equal(dock.hidden, false);
    assert.ok(
      header.querySelector('button[aria-label="这一栏切大屏"]'),
    );

    await click(rightPane.querySelector("[data-highlight-dock]"));
    assert.equal(dock.dataset.editBarDockState, "floating");
    assert.equal(dock.dataset.dropHighlight, "true");
    assert.equal(
      dock.querySelector("[data-edit-bar-dock-placeholder]").textContent,
      "松开以固定编辑栏",
    );

    const maxButton = header.querySelector(
      'button[aria-label="这一栏切大屏"]',
    );
    await click(maxButton);
    assert.equal(root.dataset.workspaceMaximized, "library");
    assert.equal(leftPane.classList.contains("hidden"), true);
    assert.equal(
      rightPane
        .querySelector('button[aria-label="恢复双栏"]')
        .getAttribute("aria-pressed"),
      "true",
    );

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: root,
    });
    await click(rightPane.querySelector("[data-open-selection-detail]"));
    assert.equal(root.dataset.workspaceMaximized, "none");
    assert.equal(leftPane.classList.contains("hidden"), false);
    assert.equal(leftPane.dataset.leftPanel, "tool-detail");
    assert.ok(leftPane.querySelector("[data-selection-detail]"));
    assert.equal(document.fullscreenElement, root);
    assert.equal(exitFullscreenCalls, 0);
  } finally {
    await mounted.unmount();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  }

  const inline = await readFile(
    new URL("../src/shell/InlineAdvancedWorkbenchShell.tsx", import.meta.url),
    "utf8",
  );
  // 投递面板只有两处入口（抽屉、临时面板），第三处出现就意味着有人绕开了
  // panelFor 自己拼内容。这两处已随左侧面板一起拆进 use-inline-advanced-panels。
  const panels = await readFile(
    new URL("../src/shell/use-inline-advanced-panels.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((panels.match(/showWorkspaceDetail\(\{/g) || []).length, 2);
  assert.equal((inline.match(/showWorkspaceDetail\(\{/g) || []).length, 0);
  // Standalone MaterialCatalog embeds must still own a dock host + pin path
  // and mark the fallback inspector as the left console for V3-09.
  assert.match(inline, /localEditBarDockRef/);
  assert.match(
    inline,
    /rightPaneSlot\?\.editBarDockRef \?\? localEditBarDockRef/,
  );
  assert.match(inline, /<EditBarDockHost/);
  assert.match(inline, /localDockPresentation/);
  const standaloneChrome = inline.indexOf("{!rightPaneSlot && (");
  const actionRow = inline.indexOf("{actionBar}", standaloneChrome);
  const editBarDock = inline.indexOf("<EditBarDockHost", actionRow);
  const editorStage = inline.indexOf("ref={stageRef}", editBarDock);
  assert.ok(
    standaloneChrome >= 0 &&
      actionRow > standaloneChrome &&
      editBarDock > actionRow &&
      editorStage > editBarDock,
    "project/page controls must precede the dock so the website edit bar is adjacent to its displayed stage",
  );
  assert.match(
    inline,
    /data-workspace-pane=\"left\"[\s\S]*data-left-panel=\"tool-detail\"/,
  );
});

test("docked website bar clears the stage/iframe by a few non-negative px", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar:website-adjacency";
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  // Reproduce V5 geometry: short dock band under taller floating chrome, with
  // the website iframe flush to the stage top (viewportTop === frameTop).
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-edit-bar-dock") ||
      this.hasAttribute("data-edit-bar-dock-sentinel")
    ) {
      return {
        x: 40, y: 52, left: 40, top: 52, right: 960, bottom: 108,
        width: 920, height: 56, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 40, y: 108, left: 40, top: 108, right: 960, bottom: 560,
        width: 920, height: 452, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 0;
      const top = match ? Number(match[2]) : 0;
      return {
        x: left, y: top, left, top, right: left + 323, bottom: top + 59,
        width: 323, height: 59, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  function WebsiteAdjacencyHarness() {
    const rootRef = useRef(null);
    const dockRef = useRef(null);
    const stageRef = useRef(null);
    const controller = useFloatingContextToolbar({
      workspaceRootRef: rootRef,
      stageRef,
      dockRootRef: dockRef,
      resetKey: storageKey,
      storageKey,
    });
    return React.createElement(
      "div",
      { ref: rootRef, "data-edit-bar-test-root": true },
      React.createElement("div", {
        ref: dockRef,
        "data-workspace-edit-bar-dock": true,
      }, React.createElement("span", {
        "data-edit-bar-dock-sentinel": true,
      })),
      React.createElement("div", {
        ref: stageRef,
        "data-edit-bar-test-stage": true,
      }),
      React.createElement(
        FloatingContextToolbar,
        { controller, accent: "#0ea5e9" },
        React.createElement(
          "div",
          null,
          controller.leading,
          React.createElement("span", null, "website controls"),
          controller.trailing,
        ),
      ),
    );
  }

  const mounted = await createMounted(WebsiteAdjacencyHarness);
  try {
    await act(async () => {
      window.dispatchEvent(new window.Event("resize"));
    });
    const toolbar = mounted.container.querySelector(
      "[data-workspace-edit-bar-toolbar]",
    );
    assert.ok(toolbar);
    const transform = toolbar.style.transform || "";
    const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
    assert.ok(match, `expected docked translate, got ${transform}`);
    const barTop = Number(match[2]);
    const barBottom = barTop + 59;
    const frameTop = 108;
    const gap = frameTop - barBottom;
    assert.ok(
      gap >= 0 && gap <= 8,
      `expected website bar clearance 0–8px, got gap=${gap} (barBottom=${barBottom})`,
    );
    assert.equal(gap, DOCKED_EDIT_BAR_STAGE_CLEARANCE_PX);
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    await mounted.unmount();
  }
});

test("standalone local dock host pins under the action row without SplitWorkspace", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar:standalone-local-dock";
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-dock")) {
      return {
        x: 40, y: 40, left: 40, top: 40, right: 960, bottom: 100,
        width: 920, height: 60, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 40, y: 120, left: 40, top: 120, right: 960, bottom: 560,
        width: 920, height: 440, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 80;
      const top = match ? Number(match[2]) : 50;
      return {
        x: left, y: top, left, top, right: left + 400, bottom: top + 44,
        width: 400, height: 44, toJSON() {},
      };
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  function StandaloneLocalDock() {
    const rootRef = useRef(null);
    const dockRef = useRef(null);
    const stageRef = useRef(null);
    const controller = useFloatingContextToolbar({
      workspaceRootRef: rootRef,
      stageRef,
      dockRootRef: dockRef,
      resetKey: storageKey,
      storageKey,
    });
    return React.createElement(
      "div",
      { ref: rootRef, "data-edit-bar-test-root": true },
      React.createElement(
        "div",
        { "data-advanced-action-row": true },
        "action row",
      ),
      React.createElement("div", {
        ref: dockRef,
        "data-workspace-edit-bar-dock": true,
        "data-edit-bar-dock-state": controller.mode,
      }),
      React.createElement("div", {
        ref: stageRef,
        "data-edit-bar-test-stage": true,
      }),
      React.createElement(
        FloatingContextToolbar,
        { controller, accent: "#0ea5e9" },
        React.createElement(
          "div",
          null,
          controller.leading,
          React.createElement("span", null, "controls"),
          controller.trailing,
        ),
      ),
    );
  }

  const mounted = await createMounted(StandaloneLocalDock);
  try {
    const dock = mounted.container.querySelector(
      "[data-workspace-edit-bar-dock]",
    );
    assert.ok(dock);
    assert.equal(dock.dataset.editBarDockState, "docked");
    const dockedToolbar = mounted.container.querySelector(
      "[data-workspace-docked-toolbar]",
    );
    assert.ok(dockedToolbar);
    assert.equal(
      dockedToolbar.closest("[data-workspace-floating-toolbar-overlay]")
        .parentElement,
      mounted.container.querySelector("[data-edit-bar-test-root]"),
    );
    const pin = mounted.container.querySelector("[data-edit-bar-pin]");
    assert.ok(pin);
    assert.equal(pin.getAttribute("data-edit-bar-mode"), "docked");
    await click(pin);
    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("data-edit-bar-mode"),
      "floating",
    );
    assert.ok(
      mounted.container.querySelector("[data-workspace-floating-toolbar]"),
    );
    assert.equal(
      mounted.container.querySelector("[data-workspace-edit-bar-dock]")
        .dataset.editBarDockState,
      "floating",
    );
    await click(mounted.container.querySelector("[data-edit-bar-pin]"));
    assert.equal(
      mounted.container
        .querySelector("[data-edit-bar-pin]")
        .getAttribute("data-edit-bar-mode"),
      "docked",
    );
    assert.ok(
      mounted.container.querySelector("[data-workspace-docked-toolbar]"),
    );
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    await mounted.unmount();
  }
});

function shellAdapter() {
  return {
    id: "grid",
    label: "表格",
    stage: React.createElement("div", { "data-test-adapter-stage": true }),
    contextToolbar: React.createElement(
      "span",
      { "data-test-context-toolbar": true },
      "对象属性",
    ),
  };
}

const materialItem = {
  key: "creation:image-1",
  source: "creation",
  id: "image-1",
  title: "一张图",
  kind: "image",
  siteId: "study",
  url: "https://cdn.test/a.png",
  favorite: false,
  meta: {},
};

test("素材挂载后 DOM 里照旧有编辑栏", async () => {
  const materialMount = await createMounted(InlineAdvancedWorkbenchShell, {
    item: materialItem,
    adapter: shellAdapter(),
    onClose() {},
  });
  try {
    assert.ok(
      materialMount.container.querySelector("[data-workspace-edit-bar-dock]"),
      "素材的编辑栏停靠带不许被这次改动带走",
    );
    assert.ok(
      materialMount.container.querySelector(
        "[data-workspace-edit-bar-toolbar]",
      ),
      "素材照旧有编辑栏",
    );
    assert.ok(
      materialMount.container.querySelector("[data-test-context-toolbar]"),
    );
  } finally {
    await materialMount.unmount();
  }
});
