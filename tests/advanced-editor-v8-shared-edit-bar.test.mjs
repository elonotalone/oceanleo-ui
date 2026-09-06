import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { GLOBAL_ROW_SLOTS } from "../src/shell/plugin-chrome/plugin-pages.ts";
import {
  groupSelectionOverflowControls,
  partitionSelectionControls,
  selectionControlUsesIconOnly,
} from "../src/shell/selection-toolbar-layout.ts";
import {
  isCompactSelectionControl,
  partitionSelectionInspectorControls,
} from "../src/shell/selection-inspector-groups.ts";
import { normalizeSelectionContext } from "../src/shell/selection-context.ts";

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
  url: "http://localhost/",
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
`);
const animationGalleryStubUrl = dataModule(`
  export function SelectionAnimationGallery() {
    return null;
  }
`);
const layoutStubUrl = dataModule(`
  export function useAdvancedLayout() {
    return globalThis.__oceanleoV8Layout || null;
  }
  export function registerAdvancedToolsTrigger(id, focus) {
    globalThis.__oceanleoV8ToolFocus = { id, focus };
    return () => {
      if (globalThis.__oceanleoV8ToolFocus?.focus === focus) {
        globalThis.__oceanleoV8ToolFocus = null;
      }
    };
  }
`);
const selectionContextStubUrl = dataModule(`
  let request = 0;
  export function selectionRequestId() {
    request += 1;
    return "selection-test-" + request;
  }
`);
const inspectorHostStubUrl = dataModule(`
  export function useSelectionInspectorHost({ onOpenPanel }) {
    return {
      openPanel: onOpenPanel || (() => {}),
      activePanelId: "",
      fallbackPanel: null,
    };
  }
`);
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);
const chromeStubUrl = dataModule(`
  export function advancedWorkbenchStyle() {
    return {};
  }
`);

async function loadTsx(relativePath, replacements) {
  return import(await compileModule(relativePath, replacements));
}

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
    async render(nextProps) {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
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

/**
 * 「收起编辑栏」按钮已删（规范 v2 §4：编辑栏里只放编辑）。收起为圆的入口是
 * 浮层根上的 `Ctrl/⌘ + .`（edit-bar-dock-controller onRootKeyDown → toggleCollapsed）。
 */
async function collapseBar(container) {
  const root = container.querySelector("[data-workspace-edit-bar-toolbar]");
  assert.ok(root, "浮层根不在，收起无从谈起");
  await act(async () => {
    root.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: ".",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test("measured width overflow preserves semantic placement without fixed truncation", () => {
  const controls = [
    ...Array.from(
      { length: 8 },
      (_, index) => ({
        id: `compact-${index}`,
        kind: "action",
        label: `Compact ${index}`,
        icon: "bold",
      }),
    ),
    {
      id: "hard-more",
      kind: "action",
      label: "Hard More",
      placement: "more",
    },
    {
      id: "left-tool",
      kind: "panel",
      label: "Left Tool",
      placement: "tools",
    },
    {
      id: "context-only",
      kind: "action",
      label: "Context only",
      slot: "context-menu",
    },
  ];
  const snapshots = [320, 480, 768, 1280, 1920].map((width) =>
    partitionSelectionControls(
      controls,
      new Map(controls.map((control) => [control.id, 240])),
      width,
    ),
  );
  const expectedVisibleCounts = [1, 1, 2, 5, 7];
  for (const [snapshotIndex, snapshot] of snapshots.entries()) {
    const visibleCount = expectedVisibleCounts[snapshotIndex];
    assert.deepEqual(
      snapshot.visible.map((control) => control.id),
      Array.from(
        { length: visibleCount },
        (_, index) => `compact-${index}`,
      ),
    );
    // context-menu 槽位的控件跟着进 More：右键菜单删除之后，那是它们仅剩的入口。
    // 固定工具栏（placement: "tools"）另有地盘，编辑栏照旧不重复它。
    assert.deepEqual(
      snapshot.overflow.map((control) => control.id),
      [
        ...Array.from(
          { length: 8 - visibleCount },
          (_, index) => `compact-${index + visibleCount}`,
        ),
        "hard-more",
        "context-only",
      ],
    );
    assert.equal(
      [...snapshot.visible, ...snapshot.overflow].some(
        (control) => control.id === "left-tool",
      ),
      false,
    );
    assert.equal(
      snapshot.visible.some((control) => control.id === "context-only"),
      false,
      "它进的是 More，不是编辑栏明位",
    );
  }
  assert.equal(selectionControlUsesIconOnly(controls[0]), true);
  assert.equal(
    selectionControlUsesIconOnly({
      ...controls[0],
      iconOnly: false,
    }),
    false,
  );
  assert.deepEqual(
    groupSelectionOverflowControls([
      { id: "inspect", kind: "panel", label: "Inspect" },
      {
        id: "delete",
        kind: "action",
        label: "Delete",
        danger: true,
        group: "arrange",
      },
      { id: "duplicate", kind: "action", label: "Duplicate" },
    ]).map((group) => [group.id, group.controls.map((control) => control.id)]),
    [
      ["inspectors", ["inspect"]],
      ["danger", ["delete"]],
      ["actions", ["duplicate"]],
    ],
  );
});

test("inspector triggers are compact icon controls while context-menu controls stay out", () => {
  const result = partitionSelectionInspectorControls([
    {
      id: "letter-spacing",
      kind: "range",
      label: "Letter spacing",
      value: 0,
      inspectorGroup: "typography",
      inspectorLabel: "Typography",
      inspectorIcon: "spacing",
    },
    {
      id: "context-delete",
      kind: "action",
      label: "Delete",
      slot: "context-menu",
      inspectorGroup: "context-actions",
      inspectorLabel: "Context actions",
    },
  ]);
  assert.equal(result.compact.length, 1);
  assert.deepEqual(result.compact[0], {
    id: "selection-inspector-text-spacing",
    kind: "panel",
    label: "间距",
    icon: "spacing",
    iconOnly: true,
    panelId: "selection-inspector-text-spacing",
    placement: "primary",
    slot: "compact",
    semantic: "spacing",
  });
  assert.equal(isCompactSelectionControl(result.compact[0]), true);

  const normalized = normalizeSelectionContext({
    version: 1,
    kind: "text",
    id: "text:hero",
    controls: [
      {
        id: "font",
        kind: "action",
        label: "Font",
        icon: "font",
        iconOnly: false,
        placement: "primary",
      },
    ],
  });
  assert.equal(normalized?.controls[0].iconOnly, false);
  assert.equal(normalized?.controls[0].placement, "primary");
});

test("the tools launcher registry keeps one active host launcher and focus target", async () => {
  const layoutModule = await loadTsx(
    "src/shell/advanced-layout-context.tsx",
    {
      react: reactUrl,
    },
  );
  const first = {
    id: "image",
    label: "Open image tools",
    controlsId: "image-tools",
    available: true,
    expanded: false,
    toggle() {},
  };
  const second = {
    id: "video",
    label: "Open video tools",
    controlsId: "video-tools",
    available: true,
    expanded: true,
    toggle() {},
  };
  const unregisterFirst = layoutModule.registerAdvancedToolsLauncher(first);
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), first);
  const unregisterSecond = layoutModule.registerAdvancedToolsLauncher(second);
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), second);
  unregisterSecond();
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), first);

  let previousFocused = 0;
  let newestFocused = 0;
  const unregisterPreviousFocus = layoutModule.registerAdvancedToolsTrigger(
    "image",
    () => {
      previousFocused += 1;
    },
  );
  const unregisterNewestFocus = layoutModule.registerAdvancedToolsTrigger(
    "image",
    () => {
      newestFocused += 1;
    },
  );
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 0);
  assert.equal(newestFocused, 1);
  unregisterNewestFocus();
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 1);
  assert.equal(newestFocused, 1);
  unregisterPreviousFocus();
  layoutModule.focusAdvancedToolsTrigger("image");
  assert.equal(previousFocused, 1);
  unregisterFirst();
  assert.equal(layoutModule.getAdvancedToolsLauncherSnapshot(), null);
});

test("shared edit bar popovers expose focusable dialog semantics", async () => {
  const [floatingSource, controllerSource, controlsSource, headerSource] =
    await Promise.all([
      readFile(resolve("src/shell/FloatingContextToolbar.tsx"), "utf8"),
      readFile(resolve("src/shell/edit-bar-dock-controller.tsx"), "utf8"),
      readFile(resolve("src/shell/EditBarDockControls.tsx"), "utf8"),
      readFile(resolve("src/shell/InlineAdvancedWorkbenchHeader.tsx"), "utf8"),
    ]);
  const editBarSource = floatingSource + controllerSource + controlsSource;
  // 左右两个 ⠿ 手柄已取消：拖拽改为在条上双击并按住拖、松手落下。
  assert.doesNotMatch(editBarSource, /data-floating-toolbar-handle/);
  assert.match(editBarSource, /data-edit-bar-collapse/);
  assert.match(editBarSource, /data-edit-bar-collapsed-pill/);
  assert.match(editBarSource, /event\.currentTarget\.focus\(\)/);
  assert.match(floatingSource, /overflow-visible/);
  assert.match(
    headerSource,
    /id=\{ADVANCED_TOOLS_PANEL_ID\}[\s\S]{0,120}role="dialog"/,
  );
  assert.match(headerSource, /event\.key !== "Escape"/);
  assert.match(headerSource, /focusAdvancedToolsTrigger\(adapter\.id\)/);
});

test("移动模式与收起圆共享同一套位置状态：双击拖动、Alt 键盘移动、收起可拖可展开", async () => {
  const dockStateUrl = pathToFileURL(
    resolve("src/shell/edit-bar-dock-state.ts"),
  ).href;
  const dockControlsUrl = await compileModule(
    "src/shell/EditBarDockControls.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./edit-bar-dock-state": dockStateUrl,
    },
  );
  const dockControllerUrl = await compileModule(
    "src/shell/edit-bar-dock-controller.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./EditBarDockControls": dockControlsUrl,
      "./edit-bar-dock-state": dockStateUrl,
    },
  );
  const { useFloatingContextToolbar } = await loadTsx(
    "src/shell/FloatingContextToolbar.tsx",
    {
      react: reactUrl,
      "react-dom": pathToFileURL(require.resolve("react-dom")).href,
      "../i18n/ui/useUI": uiStubUrl,
      "./advanced-workbench-chrome": chromeStubUrl,
      "./edit-bar-dock-controller": dockControllerUrl,
      "./edit-bar-dock-state": dockStateUrl,
    },
  );
  let liveController = null;
  let toolClicks = 0;
  function Harness() {
    const stageRef = React.useRef(null);
    const controller = useFloatingContextToolbar({
      stageRef,
      resetKey: "selection:one",
    });
    liveController = controller;
    return React.createElement(
      "div",
      { ref: stageRef, "data-handle-stage": true },
      React.createElement(
        "div",
        {
          ref: controller.toolbarRef,
          "data-handle-toolbar": true,
          "data-edit-bar-offset": `${controller.offset.x},${controller.offset.y}`,
          ...controller.rootProps,
        },
        React.createElement(
          "button",
          {
            type: "button",
            "data-test-edit-bar-tool": true,
            onClick() {
              toolClicks += 1;
            },
          },
          "工具",
        ),
        controller.leading,
        controller.trailing,
      ),
    );
  }

  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-handle-stage")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (this.hasAttribute("data-handle-toolbar")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 52,
        width: 300, height: 52, toJSON() {},
      };
    }
    return originalRect.call(this);
  };

  const mounted = await createMounted(Harness, {});
  const bar = () => mounted.container.querySelector("[data-handle-toolbar]");
  const offset = () => bar().getAttribute("data-edit-bar-offset");
  const key = async (target, keyValue, init = {}) => {
    await act(async () => {
      target.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: keyValue,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    });
  };
  const pointer = async (target, type, values) => {
    await act(async () => {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      for (const [name, value] of Object.entries(values)) {
        Object.defineProperty(event, name, { configurable: true, value });
      }
      target.dispatchEvent(event);
    });
  };
  const press = (clientX, clientY) => ({
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY,
  });

  try {
    assert.equal(
      mounted.container.querySelectorAll("[data-floating-toolbar-handle]").length,
      0,
      "拖拽手柄必须彻底消失",
    );
    assert.equal(
      mounted.container.querySelector("[data-edit-bar-collapse]"),
      null,
      "「收起编辑栏」按钮已删（规范 v2 §4）",
    );

    // 键盘一律要 Alt 修饰：条里有数字输入框和下拉框，裸方向键会被抢走。
    await key(bar(), "ArrowRight");
    assert.equal(offset(), "0,0", "不带 Alt 的方向键不得移动编辑栏");
    await key(bar(), "ArrowRight", { altKey: true });
    assert.equal(offset(), "16,0");
    await key(bar(), "ArrowRight", { altKey: true, shiftKey: true });
    assert.equal(offset(), "64,0");
    await key(bar(), "Home", { altKey: true });
    assert.equal(offset(), "0,0");

    // 从完全空闲态对一个按键做 down→up→down（间隔在双击窗口内）：
    // 第二下立刻跟手；第一下 onClick 生效；松手不再多调一次。
    const tool = mounted.container.querySelector("[data-test-edit-bar-tool]");
    assert.ok(tool, "测试按键必须在条上");
    const toolPress = (timeStamp) => ({
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 80,
      clientY: 20,
      timeStamp,
    });
    await pointer(tool, "pointerdown", toolPress(4000));
    await pointer(tool, "pointerup", toolPress(4010));
    await act(async () => {
      tool.dispatchEvent(
        new window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 20,
        }),
      );
    });
    assert.equal(toolClicks, 1, "第一下按键 onClick 必须立刻生效");
    assert.equal(liveController.selected, true);
    assert.equal(liveController.moveMode, false, "第一次按下不得起拖");
    await pointer(tool, "pointerdown", toolPress(4020));
    assert.equal(
      liveController.moveMode,
      true,
      "双击窗口内对按键第二次按下必须立刻起拖",
    );
    await pointer(window, "pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 40,
      timeStamp: 4100,
    });
    assert.equal(offset(), "20,20", "按键上双击起拖后 offset 必须跟手");
    await pointer(window, "pointerup", {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 40,
      timeStamp: 4200,
    });
    assert.equal(liveController.moveMode, false);
    await act(async () => {
      tool.dispatchEvent(
        new window.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 40,
        }),
      );
    });
    assert.equal(toolClicks, 1, "起拖后松手不得再触发按键 onClick");

    await key(bar(), "Home", { altKey: true });
    assert.equal(offset(), "0,0");
    await pointer(mounted.container.querySelector("[data-handle-stage]"), "pointerdown", {
      pointerId: 2,
      pointerType: "mouse",
      button: 0,
      clientX: 900,
      clientY: 500,
      timeStamp: 5000,
    });
    assert.equal(liveController.selected, false, "条外按下必须取消选中");

    // 单次按下只是选中，不能启动拖拽。
    await pointer(bar(), "pointerdown", press(200, 200));
    await pointer(window, "pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 30,
      clientY: 20,
    });
    assert.equal(offset(), "0,0", "第一次按下后移动指针不得拖走编辑栏");
    await pointer(bar(), "pointerup", press(200, 200));
    assert.equal(liveController.selected, true, "第一次点击后必须选中编辑栏");

    // 选中后再按下：只待拖；移动超过 6px 才起拖。原断言是按下立刻
    // moveMode=true（空白老路）。产品改为「第二次按下并移动才拖」，
    // 这样落在按键上也走同一条，按键未移动时 click 仍触发。
    await pointer(bar(), "pointerdown", press(10, 10));
    assert.equal(
      liveController.moveMode,
      false,
      "已选中后按下未移动不得起拖",
    );
    await pointer(window, "pointermove", {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 30,
      clientY: 20,
    });
    assert.equal(liveController.moveMode, true, "待拖后移动超过阈值必须起拖");
    await pointer(window, "pointerup", press(30, 20));
    assert.equal(liveController.moveMode, false);
    assert.equal(offset(), "20,10");

    // 收起/展开：按钮与 ⌘. 走同一条状态。
    await act(async () => {
      liveController.collapse();
    });
    assert.equal(liveController.collapsed, true);
    await key(bar(), ".", { metaKey: true });
    assert.equal(liveController.collapsed, false);
    assert.equal(offset(), "20,10", "收起再展开不得丢掉展开态的位置");
  } finally {
    await mounted.unmount();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
});

test("shared edit bar opens host tools, keeps values, and uses a focused vertical More dialog", async () => {
  const anchoredPopoverUrl = await compileModule(
    "src/shell/anchored-popover.tsx",
    {
      react: reactUrl,
      "react-dom": pathToFileURL(require.resolve("react-dom")).href,
    },
  );
  const editorToolsIconUrl = await compileModule(
    "src/shell/EditorToolsIcon.tsx",
    {
      react: reactUrl,
      "./AdvancedEditorIcon": iconStubUrl,
    },
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
  const buttonControlUrl = await compileModule(
    "src/shell/SelectionToolbarButtonControl.tsx",
    {
      react: reactUrl,
    },
  );
  const numberControlUrl = await compileModule(
    "src/shell/SelectionToolbarNumberControl.tsx",
    {
      react: reactUrl,
    },
  );
  const toolbarControlUrl = await compileModule(
    "src/shell/SelectionToolbarControl.tsx",
    {
      "./AdvancedEditorIcon": iconStubUrl,
      "./SelectionAnimationGallery": animationGalleryStubUrl,
      "./SelectionToolbarButtonControl": buttonControlUrl,
      "./SelectionToolbarNumberControl": numberControlUrl,
      "./SelectionToolbarSelectControl": selectControlUrl,
      "./selection-context": selectionContextStubUrl,
    },
  );
  const toolbarMeasureHookUrl = await compileModule(
    "src/shell/useSelectionToolbarMeasure.ts",
    {
      react: reactUrl,
    },
  );
  const { SelectionToolbar } = await loadTsx(
    "src/shell/SelectionToolbar.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./AdvancedEditorIcon": iconStubUrl,
      "./SelectionAnimationGallery": animationGalleryStubUrl,
      "./advanced-layout-context": layoutStubUrl,
      "./EditorToolsIcon": editorToolsIconUrl,
      "./selection-context": selectionContextStubUrl,
      "./selection-inspector-host": inspectorHostStubUrl,
      "./anchored-popover": anchoredPopoverUrl,
      "./SelectionToolbarControl": toolbarControlUrl,
      "./SelectionToolbarSelectControl": selectControlUrl,
      "./SelectionToolbarButtonControl": buttonControlUrl,
      "./SelectionToolbarNumberControl": numberControlUrl,
      "./useSelectionToolbarMeasure": toolbarMeasureHookUrl,
    },
  );
  let toolsOpened = 0;
  globalThis.__oceanleoV8Layout = {
    hostPanelVisible: false,
    editorToolActive: false,
    activeDrawerId: "",
    activeTransientPanelId: "",
    openDrawer() {},
    openTransientPanel() {},
    updateTransientPanel() {},
    closeDrawer() {},
    toolsLauncher: {
      id: "image",
      label: "Open image tools",
      controlsId: "advanced-workbench-tools-panel",
      available: true,
      expanded: false,
      toggle() {
        toolsOpened += 1;
      },
    },
  };
  const commands = [];
  const props = {
    context: {
      version: 1,
      kind: "image-text",
      id: "text:hero",
      label: "Hero title",
      revision: 7,
      controls: [
        {
          id: "bold",
          kind: "toggle",
          label: "Bold",
          icon: "bold",
          value: false,
        },
        {
          id: "font-family",
          kind: "select",
          label: "Font",
          icon: "font",
          value: "inter",
          options: [{ value: "inter", label: "Inter" }],
        },
        {
          id: "font-size",
          kind: "number",
          label: "Font size",
          icon: "font",
          value: 24,
          min: 8,
          max: 96,
        },
        {
          id: "crop",
          kind: "action",
          label: "Crop",
        },
        {
          id: "letter-spacing",
          kind: "range",
          label: "Letter spacing",
          icon: "spacing",
          value: 0,
          inspectorGroup: "typography",
          inspectorLabel: "Typography",
          inspectorIcon: "spacing",
        },
        {
          id: "delete",
          kind: "action",
          label: "Delete",
          icon: "delete",
          danger: true,
          placement: "more",
        },
        {
          id: "context-duplicate",
          kind: "action",
          label: "Context duplicate",
          slot: "context-menu",
        },
      ],
    },
    onCommand(command) {
      commands.push(command);
    },
  };
  const mounted = await createMounted(SelectionToolbar, props);
  try {
    const tools = mounted.container.querySelector(
      "[data-editor-tools-trigger]",
    );
    assert.ok(tools);
    assert.equal(tools.tagName, "BUTTON");
    assert.equal(tools.getAttribute("aria-expanded"), "false");
    assert.equal(
      tools.getAttribute("aria-controls"),
      "advanced-workbench-tools-panel",
    );
    assert.equal(
      tools.querySelector("[data-icon]")?.getAttribute("data-icon"),
      "text",
    );
    await click(tools);
    assert.equal(toolsOpened, 1);

    const bold = mounted.container.querySelector('button[aria-label="Bold"]');
    assert.ok(bold);
    assert.equal(bold.textContent, "");
    const font = mounted.container.querySelector('button[aria-label="Font"]');
    assert.ok(font);
    assert.equal(font.textContent.includes("Inter"), true);
    assert.equal(font.textContent.includes("Font"), false);
    const fontSize = mounted.container.querySelector(
      'input[aria-label="Font size"]',
    );
    assert.equal(fontSize?.value, "24");
    await act(async () => {
      fontSize.dispatchEvent(
        new window.Event("compositionstart", {
          bubbles: true,
          cancelable: true,
        }),
      );
      fontSize.value = "30";
      fontSize.dispatchEvent(
        new window.Event("input", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(commands.length, 0);
    await act(async () => {
      fontSize.dispatchEvent(
        new window.Event("compositionend", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(commands.length, 1);
    assert.equal(commands[0].controlId, "font-size");
    assert.equal(commands[0].value, 30);
    commands.length = 0;
    assert.equal(
      mounted.container.querySelector(
        '[data-selection-control-id="crop"]',
      )?.textContent,
      "Crop",
    );
    const inspector = mounted.container.querySelector(
      'button[aria-label="间距"]',
    );
    assert.ok(inspector);
    assert.equal(inspector.textContent, "");
    assert.equal(
      mounted.container.querySelector(
        '[data-selection-control-id="context-duplicate"]',
      ),
      null,
    );
    assert.equal(
      mounted.container.querySelector('[data-selection-control-id="delete"]'),
      null,
    );

    const more = mounted.container.querySelector(
      'button[aria-label="更多属性 · 图片"]',
    );
    assert.ok(more);
    await click(more);
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="更多属性 · 图片"]',
    );
    assert.ok(dialog);
    assert.equal(
      dialog.querySelectorAll("[data-selection-overflow-group]").length,
      1,
    );
    const deleteButton = dialog.querySelector('button[aria-label="Delete"]');
    assert.ok(deleteButton);
    assert.equal(deleteButton.textContent, "Delete");
    assert.equal(document.activeElement, deleteButton);
    await click(deleteButton);
    assert.equal(dialog.isConnected, false);
    assert.equal(document.activeElement, more);
    assert.deepEqual(commands[0], {
      requestId: "selection-test-2",
      selectionId: "text:hero",
      controlId: "delete",
      selectionRevision: 7,
    });

    await click(more);
    assert.ok(
      document.querySelector(
        '[role="dialog"][aria-label="更多属性 · 图片"]',
      ),
    );
    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(
      document.querySelector(
        '[role="dialog"][aria-label="更多属性 · 图片"]',
      ),
      null,
    );
    assert.equal(document.activeElement, more);

    globalThis.__oceanleoV8ToolFocus.focus();
    assert.equal(document.activeElement, tools);

    globalThis.__oceanleoV8Layout = {
      ...globalThis.__oceanleoV8Layout,
      toolsLauncher: {
        ...globalThis.__oceanleoV8Layout.toolsLauncher,
        available: false,
        unavailableReason: "Read only",
      },
    };
    await mounted.render(props);
    const unavailableTools = mounted.container.querySelector(
      "[data-editor-tools-trigger]",
    );
    assert.equal(unavailableTools, null);
    assert.equal(toolsOpened, 1);
  } finally {
    await mounted.unmount();
    globalThis.__oceanleoV8Layout = null;
    globalThis.__oceanleoV8ToolFocus = null;
  }
});

test("第一行只留 GLOBAL_ROW_SLOTS，非 download 动作不在第一行", async () => {
  const headerSource = await readFile(
    new URL("../src/shell/InlineAdvancedWorkbenchHeader.tsx", import.meta.url),
    "utf8",
  );
  const shellSource = await readFile(
    new URL("../src/shell/InlineAdvancedWorkbenchShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(headerSource, /<PluginGlobalRow/);
  assert.match(headerSource, /<PluginPageRow/);
  assert.match(shellSource, /EditBarDocumentSegment/);
  assert.match(shellSource, /action\.group !== "download"/);

  const anchoredPopoverUrl = await compileModule(
    "src/shell/anchored-popover.tsx",
    {
      react: reactUrl,
      "react-dom": pathToFileURL(require.resolve("react-dom")).href,
    },
  );
  const { AdvancedWorkspaceActionBar } = await loadTsx(
    "src/shell/AdvancedWorkspaceActionBar.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./AdvancedEditorIcon": iconStubUrl,
      "./anchored-popover": anchoredPopoverUrl,
    },
  );
  let library = "";
  const mounted = await createMounted(AdvancedWorkspaceActionBar, {
    adapter: {
      id: "image",
      label: "Image",
      stage: null,
      drawers: [
        {
          id: "layers",
          label: "Layers",
          icon: "layers",
          content: null,
        },
      ],
      actions: [
        {
          id: "project-view:preview",
          label: "Preview",
          icon: "pages",
          variant: "primary",
          onTrigger() {},
        },
        {
          id: "export-secondary",
          label: "Secondary export",
          icon: "download",
          group: "download",
          onTrigger() {},
        },
        {
          id: "retry-source",
          label: "Retry source",
          onTrigger() {},
        },
      ],
      directDownload: {
        id: "download",
        label: "Download",
        icon: "download",
        onTrigger() {},
      },
    },
    autoSaveState: "saved",
    activeLibraryPanelId: null,
    onBack() {},
    onOpenLibrary(id) {
      library = id;
    },
    onRetrySave() {},
    onTriggerAction(action) {
      return action.onTrigger?.();
    },
    onUploadFiles() {},
  });
  try {
    assert.equal(
      mounted.container.querySelector('button[aria-label="编辑工具"]'),
      null,
    );
    assert.equal(
      mounted.container.querySelector('button[aria-label="Retry source"]'),
      null,
      "非 download 动作还画在第一行",
    );
    assert.equal(
      mounted.container.querySelector(
        '[data-workspace-action-id="retry-source"]',
      ),
      null,
    );
    assert.equal(
      mounted.container.querySelector('button[aria-label="Secondary export"]'),
      null,
    );
    assert.equal(
      mounted.container.querySelector(
        '[data-workspace-action-id="project-view:preview"]',
      ),
      null,
      "页签/预览动作还画在第一行",
    );
    const row = mounted.container.querySelector(
      "[data-advanced-workspace-actions]",
    );
    assert.ok(row, "第一行没渲染出来");
    const clickables = [
      ...row.querySelectorAll("button, a, [role=button]"),
    ];
    assert.ok(clickables.length > 0, "第一行一个可点击元素都没有");
    for (const node of clickables) {
      const slot = node.closest("[data-global-row-slot]");
      assert.ok(
        slot,
        `第一行有一个没有槽位的可点击元素：${node.getAttribute("aria-label") || node.textContent}`,
      );
      assert.ok(
        GLOBAL_ROW_SLOTS.includes(slot.getAttribute("data-global-row-slot")),
        `第一行槽位 ${slot.getAttribute("data-global-row-slot")} 不在 GLOBAL_ROW_SLOTS 里`,
      );
    }
    const downloadLauncher = mounted.container.querySelector(
      '[data-workspace-download-launcher]',
    );
    assert.ok(downloadLauncher);
    assert.equal(
      mounted.container.querySelectorAll("[data-workspace-download-launcher]")
        .length,
      1,
    );
    assert.equal(downloadLauncher.getAttribute("aria-expanded"), "false");
    await click(downloadLauncher);
    const downloadMenu = document.querySelector(
      "[data-workspace-download-menu]",
    );
    assert.ok(downloadMenu);
    assert.equal(downloadLauncher.getAttribute("aria-expanded"), "true");
    assert.deepEqual(
      [...downloadMenu.querySelectorAll("[data-workspace-export-action-id]")].map(
        (action) => [
          action.dataset.workspaceExportActionId,
          action.dataset.workspaceExportActionKind,
        ],
      ),
      [
        ["download", "default"],
        ["export-secondary", "secondary"],
      ],
    );
    assert.equal(
      downloadMenu.querySelectorAll('button[role="menuitem"]').length,
      2,
    );
    const materials = [...mounted.container.querySelectorAll("button")].find(
      (button) => button.textContent.includes("素材库"),
    );
    assert.ok(materials);
    await click(materials);
    assert.equal(library, "materials");
  } finally {
    await mounted.unmount();
  }
});

// AI 按钮是 13 个插件共用的契约位：位置固定在最右段、行为固定为切 agent 抽屉。
// 断言「最后一个控件」而不是「存在一个 AI 按钮」，是因为漂移总是从位置开始：
// 某个插件把自己的按钮塞到 AI 右边，用户就得在每个插件里重新找它。
test("每个插件的 edit bar 最右侧都是 AI，点击切到左侧 agent 抽屉", async () => {
  const { SelectionToolbar } = await loadTsx("src/shell/SelectionToolbar.tsx", {
    react: reactUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./SelectionAnimationGallery": animationGalleryStubUrl,
    "./advanced-layout-context": layoutStubUrl,
    "./selection-context": selectionContextStubUrl,
    "./selection-inspector-host": inspectorHostStubUrl,
  });
  const drawerCalls = [];
  const layout = {
    hostPanelVisible: false,
    editorToolActive: false,
    activeDrawerId: "",
    activeTransientPanelId: "",
    openDrawer(id) {
      drawerCalls.push(["open", id]);
    },
    closeDrawer() {
      drawerCalls.push(["close"]);
    },
    openTransientPanel() {},
    updateTransientPanel() {},
  };
  globalThis.__oceanleoV8Layout = layout;
  const props = {
    context: {
      version: 1,
      kind: "image-text",
      id: "text:hero",
      label: "Hero",
      revision: 1,
      controls: [{ id: "bold", kind: "toggle", label: "Bold", value: false }],
    },
    // PdfContextToolbar.tsx:225 真的传了 `trailing`，所以这里必须带一个：
    // 不带就测不出「AI 在插件自己的按钮左边还是右边」，用例名会自己骗自己。
    trailing: React.createElement(
      "button",
      { type: "button", "data-plugin-trailing": true },
      "Export",
    ),
    onCommand() {},
  };
  const mounted = await createMounted(SelectionToolbar, props);
  try {
    const suffix = mounted.container.querySelector(
      "[data-selection-toolbar-suffix]",
    );
    assert.ok(suffix, "AI 按钮所在的右段必须渲染出来");
    const agent = suffix.querySelector("[data-edit-bar-agent]");
    assert.ok(agent, "每个插件的 edit bar 都要有 AI 按钮");
    assert.ok(
      suffix.querySelector("[data-plugin-trailing]"),
      "插件自己的右段按钮也要在场，否则下一条断言无从落脚",
    );
    assert.equal(
      suffix.lastElementChild,
      agent,
      "AI 必须是右段最后一个：插件把自己的按钮塞到它右边，用户就得在每个插件里重新找它",
    );
    assert.equal(
      agent.querySelector("[data-icon]")?.getAttribute("data-icon"),
      "agent",
    );
    assert.equal(agent.getAttribute("aria-pressed"), "false");
    // 双击拖动不能被 AI 按钮吞掉，所以它必须自报是可交互控件。
    assert.ok(agent.hasAttribute("data-edit-bar-interactive"));

    await click(agent);
    assert.deepEqual(drawerCalls, [["open", "agent"]]);

    globalThis.__oceanleoV8Layout = { ...layout, activeDrawerId: "agent" };
    await mounted.render({ ...props, context: { ...props.context, revision: 2 } });
    const active = mounted.container.querySelector("[data-edit-bar-agent]");
    assert.equal(active.getAttribute("aria-pressed"), "true");
    await click(active);
    assert.deepEqual(drawerCalls, [["open", "agent"], ["close"]]);
  } finally {
    globalThis.__oceanleoV8Layout = null;
    await mounted.unmount();
  }
});

// 顶栏与编辑栏的分工：顶栏管「这份文档」（返回/素材库/保存导出/全屏），
// 编辑栏管「这次改动」（撤销重做/工具/选区控件/AI）。撤销重做原先在顶栏最左，
// 于是带 history 的插件顶栏比别的插件多两个按钮——13 件插件顶栏长得不一样就是
// 这么来的。这条测试锁住它们**只在编辑栏出现一次**。
test("撤销重做归编辑栏，顶栏不再有第二份", async () => {
  const actionBarSource = await readFile(
    new URL("../src/shell/AdvancedWorkspaceActionBar.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    !/AdvancedEditorIcon\s+name="undo"/.test(actionBarSource),
    "顶栏又长出了撤销按钮：它属于编辑栏（EditBarHistoryControls）",
  );
  assert.ok(
    !/AdvancedEditorIcon\s+name="redo"/.test(actionBarSource),
    "顶栏又长出了重做按钮：它属于编辑栏（EditBarHistoryControls）",
  );
  assert.ok(
    !/adapter\.history\.(undo|redo)/.test(actionBarSource),
    "顶栏不该直接调 adapter.history",
  );

  const { EditBarHistoryControls } = await loadTsx(
    "src/shell/EditBarDockControls.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./AdvancedEditorIcon": iconStubUrl,
    },
  );
  const calls = [];
  const mounted = await createMounted(EditBarHistoryControls, {
    canUndo: true,
    canRedo: false,
    onUndo: () => calls.push("undo"),
    onRedo: () => calls.push("redo"),
  });
  try {
    const undo = mounted.container.querySelector("[data-edit-bar-history-undo]");
    const redo = mounted.container.querySelector("[data-edit-bar-history-redo]");
    assert.ok(undo && redo);
    // 双击拖动不能被这两个按钮吞掉，所以它们必须自报可交互。
    assert.ok(undo.hasAttribute("data-edit-bar-interactive"));
    assert.ok(redo.hasAttribute("data-edit-bar-interactive"));
    // 不可用时是禁用，不是消失：按钮位置恒定，用户才不用每次重新找。
    assert.equal(undo.disabled, false);
    assert.equal(redo.disabled, true);
    await click(undo);
    await click(redo);
    assert.deepEqual(calls, ["undo"], "禁用的重做不该触发");
  } finally {
    await mounted.unmount();
  }
});

// 「更多」面板该在什么时候关：**执行完一个动作之后**，不是「点到什么都关」。
//
// 上面那条 More dialog 判据只钉住了「动作之后要关」这一半。另一半同样是用户体感：
// 色板是连续取值，拖着取色器每挪一下就是一次 onChange，跟着关面板等于把人手里的
// 取色器抽走。这条把两半一起钉住，免得下一个人图省事给所有控件都接上 onActivated。
//
// 还顺带钉住「关掉之后节点真的从 document 上摘掉」：藏住已关面板靠的是注入的
// `[data-leo-overlay-state="closed"]` 那条规则，而面板自带 Tailwind 的 `grid`
// 会压掉 `[hidden]`——只要那条规则缺席（宿主 CSP 不给内联 style），留在 DOM 里的
// 面板就会整块留在屏幕上。所以判「摘掉」，不判「看不见」。
test("More 面板：动作之后关并归还焦点，连续取值的色板留在原地", async () => {
  const anchoredPopoverUrl = await compileModule(
    "src/shell/anchored-popover.tsx",
    {
      react: reactUrl,
      "react-dom": pathToFileURL(require.resolve("react-dom")).href,
    },
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
  const buttonControlUrl = await compileModule(
    "src/shell/SelectionToolbarButtonControl.tsx",
    { react: reactUrl },
  );
  const numberControlUrl = await compileModule(
    "src/shell/SelectionToolbarNumberControl.tsx",
    { react: reactUrl },
  );
  const toolbarControlUrl = await compileModule(
    "src/shell/SelectionToolbarControl.tsx",
    {
      "./AdvancedEditorIcon": iconStubUrl,
      "./SelectionAnimationGallery": animationGalleryStubUrl,
      "./SelectionToolbarButtonControl": buttonControlUrl,
      "./SelectionToolbarNumberControl": numberControlUrl,
      "./SelectionToolbarSelectControl": selectControlUrl,
      "./selection-context": selectionContextStubUrl,
    },
  );
  const { SelectionToolbar } = await loadTsx("src/shell/SelectionToolbar.tsx", {
    react: reactUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./SelectionAnimationGallery": animationGalleryStubUrl,
    "./advanced-layout-context": layoutStubUrl,
    "./selection-context": selectionContextStubUrl,
    "./selection-inspector-host": inspectorHostStubUrl,
    "./anchored-popover": anchoredPopoverUrl,
    "./SelectionToolbarControl": toolbarControlUrl,
    "./SelectionToolbarSelectControl": selectControlUrl,
    "./SelectionToolbarButtonControl": buttonControlUrl,
    "./SelectionToolbarNumberControl": numberControlUrl,
  });
  const commands = [];
  const props = {
    context: {
      version: 1,
      kind: "image-text",
      id: "text:hero",
      label: "Hero",
      revision: 3,
      controls: [
        { id: "bold", kind: "toggle", label: "Bold", value: false },
        {
          id: "text-color",
          kind: "color",
          label: "Text color",
          value: "#112233",
          placement: "more",
        },
        {
          id: "duplicate",
          kind: "action",
          label: "Duplicate",
          placement: "more",
        },
      ],
    },
    onCommand(command) {
      commands.push(command);
    },
  };
  const mounted = await createMounted(SelectionToolbar, props);
  try {
    const more = mounted.container.querySelector(
      'button[aria-label="更多属性 · 图片"]',
    );
    assert.ok(more, "两个 placement:\"more\" 的控件必须撑出「更多」键");
    await click(more);
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="更多属性 · 图片"]',
    );
    assert.ok(dialog);

    // ① 连续取值：拖动取色器时面板必须留在原地。
    const color = dialog.querySelector('input[type="color"]');
    assert.ok(color, "色板控件要在 More 面板里");
    // 受控 input 直接赋 `.value` 会走 React 改写过的 setter，值追踪器同步更新、
    // onChange 不再触发（本仓 `auth-dialog.test.mjs:337` 同一手法）。要拿原型上的
    // 原生 setter 绕开追踪器，否则这一步是静默空转、下一条断言测不到任何东西。
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      setNativeValue.call(color, "#ff8800");
      color.dispatchEvent(
        new window.Event("input", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(
      commands.at(-1)?.controlId,
      "text-color",
      "取色本身要照常提交，别把「不关面板」做成「不生效」",
    );
    assert.equal(
      dialog.isConnected,
      true,
      "取色器还在人手里，面板不许消失",
    );
    assert.equal(dialog.getAttribute("data-leo-overlay-state"), "open");

    // ② 执行完一个动作：面板关掉、节点摘掉、焦点回到「更多」。
    const duplicate = dialog.querySelector('button[aria-label="Duplicate"]');
    assert.ok(duplicate);
    await click(duplicate);
    assert.equal(commands.at(-1)?.controlId, "duplicate");
    // 同步这一拍就要成立的两件事：翻成关闭态、焦点回到「更多」。
    assert.equal(dialog.getAttribute("data-leo-overlay-state"), "closed");
    assert.equal(document.activeElement, more, "焦点要回到「更多」按钮");

    // 摘节点要等退场跑完，所以让出一拍再判。`runAfterOverlayExit` 的零预算档写明
    // 「下一拍就回调」——jsdom 解析不了 `@starting-style`，预算恒为 0，走的就是这一档。
    // 不让这一拍，判的就是 act 的调度运气：本文件全量实测 7 次里输过 1 次。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(
      dialog.isConnected,
      false,
      "动作做完了，面板必须从 document 上摘掉，而不是只靠一条样式规则藏起来",
    );

    // ③ 再开一次必须真能开：摘节点不许把「更多」键弄成一次性的。
    await click(more);
    assert.ok(
      document.querySelector(
        '[role="dialog"][aria-label="更多属性 · 图片"]',
      ),
      "「更多」键必须能重复打开",
    );
  } finally {
    globalThis.__oceanleoV8Layout = null;
    await mounted.unmount();
  }
});
