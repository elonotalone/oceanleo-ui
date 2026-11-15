// 编辑栏严格单行：一个 SelectionToolbar 量宽选区和创建工具，右段固定 AI。
// 创建工具逐项进入同一个 More；宽度恢复后逐项展开。撤销 / 重做属于顶栏。
// jsdom 使用受控几何，验证真实工具条分区、可访问名称、点击和选区保持。

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
const consoleError = console.error;
let renderErrors = [];
test.beforeEach(() => { renderErrors = []; console.error = (...args) => renderErrors.push(args.map(String).join(" ")); });
test.afterEach(() => { console.error = consoleError; assert.deepEqual(renderErrors, [], "real toolbar mounts and state changes must not log errors"); });

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
  export function usePluginTheme() { return {theme:"light"}; }
  export function usePluginThemePortal() { return null; }
  export function PluginThemeScope({children}) { return children; }
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
  export function AnchoredPopover({ open, children, id, role, ariaLabel, attributes, panelRef }) {
    return open ? jsx("div", { id, role, "aria-label":ariaLabel, ref:panelRef,
      "data-test-popover":true, "data-anchored-popover":true, "data-leo-overlay-state":"open",
      ...attributes, children }) : null;
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
const { SelectionToolbar } = await import(await compileModule("src/shell/SelectionToolbar.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./plugin-theme": pluginThemeStubUrl,
  "./AdvancedEditorIcon": iconStubUrl,
  "./advanced-layout-context": layoutContextStubUrl,
  "./anchored-popover": popoverStubUrl,
}));
const { creationToolControl } = await import(await compileModule("src/shell/creation-tools.ts"));

/* ------------------------------------------------------------------ 几何桩 */

// 行的容量只看外部边界（overlay）；各段宽度由桩给定，栏自身宽度**不参与**。
const geometry = { overlayWidth: 1000 };
const SEGMENT_WIDTHS = [
  ["data-edit-bar-trailing-slot", 100],
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
    if (this.hasAttribute("data-selection-measure-control-id")) return rect(40, 28);
    if (this.hasAttribute("data-selection-toolbar-viewport-capacity")) return rect(window.innerWidth - 32, 28);
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
    activeTransientPanelId: "",
    openDrawer() {},
    closeDrawer() {},
    contextBarLeading: null,
    ...overrides,
  };
}

function RowHarness({ storageKey, selection, creationTools = [], trailing, layout, onCommand }) {
  const context = selection ? {
    ...selection, controls: [...selection.controls, ...creationTools.map((tool) => creationToolControl(tool))],
  } : creationTools.length ? {
    version: 1, kind: "creation", id: "creation:document", controls: creationTools.map((tool) => creationToolControl(tool)),
  } : null;
  const dispatch = (command) => {
    onCommand?.(command);
    creationTools.find((tool) => tool.id === command.controlId)?.execute?.();
  };
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
        { controller, accent: "#6d5dfc", trailing },
        context ? React.createElement(SelectionToolbar, { context, onCommand: dispatch }) : null,
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

const selectionTools = {
  version: 1, kind: "richdoc-text", id: "selection:text", revision: 7, epoch: 2,
  controls: [
    { id: "bold", kind: "toggle", label: "加粗", value: false },
    { id: "italic", kind: "toggle", label: "斜体", value: false },
  ],
};
const documentTools = [
  { id: "recalculate", tool: "action", label: "重新计算" },
  { id: "phone-preview", tool: "properties", label: "手机预览" },
];
const visibleControls = (container) => (container.querySelector("[data-selection-id]")?.getAttribute("data-selection-visible-controls") || "").split(" ").filter(Boolean);
const overflowControls = (container) => (container.querySelector("[data-selection-id]")?.getAttribute("data-selection-overflow-controls") || "").split(" ").filter(Boolean);

/* -------------------------------------------------------------------- 用例 */

test("一行共享工具和右段：容器由 FloatingContextToolbar 自己画，顺序固定，AI 键唯一且无固定柄/收起键", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const mounted = await mount({
    storageKey: "test:edit-bar-single-row:contract",
    selection: selectionTools,
    creationTools: documentTools,
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
        ["selection", "trailing"].find((name) =>
          child.hasAttribute(`data-edit-bar-${name}-slot`),
        ) || (child.tagName === "SPAN" ? "|" : child.tagName),
      );
    assert.deepEqual(
      slots,
      ["selection", "trailing"],
      "选区与创建工具共用一个段，右段固定在其后；撤销不在编辑栏",
    );

    assert.equal(row.querySelectorAll("[data-selection-id]").length, 1, "only one real SelectionToolbar renders the controls");
    assert.equal(row.querySelector("[data-edit-bar-document-slot], [data-edit-bar-document-more]"), null);
    assert.deepEqual(visibleControls(row), ["bold", "italic", "recalculate", "phone-preview"]);
    const trailingSlot = row.querySelector("[data-edit-bar-trailing-slot]");
    const trailingLabels = Array.from(trailingSlot.querySelectorAll("button")).map(
      (button) => button.getAttribute("aria-label"),
    );
    assert.equal(trailingLabels.length, 2, "右段：trailing、AI 助手");
    assert.equal(trailingLabels[0], "附加", "trailing 排最前");
    assert.equal(trailingLabels[1], "AI 助手", "AI 助手在 trailing 之后");
    assert.equal(row.querySelectorAll("[data-edit-bar-agent]").length, 1, "AI 键恰一个");
    assert.equal(row.querySelectorAll("[data-edit-bar-agent-icon]").length, 1, "AI 键使用新的共享会话 glyph");
    assert.equal(row.querySelectorAll("[data-edit-bar-pin]").length, 0, "共同编辑栏不再渲染固定/取消固定按钮");
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

test("没选中也没有文档动作：栏仍在，data-empty 为真，右段照常有 AI 键且没有固定柄", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const mounted = await mount({
    storageKey: "test:edit-bar-single-row:empty",
    selection: null,
    creationTools: [],
  });
  try {
    const row = mounted.container.querySelector("[data-workspace-edit-bar]");
    assert.ok(row, "没选中时编辑栏也不许消失");
    assert.ok(row.hasAttribute("data-empty"), "没内容时 data-empty 应为真");
    assert.ok(row.querySelector("[data-edit-bar-agent]"), "AI 键恒在");
    assert.ok(row.querySelector("[data-edit-bar-agent-icon]"), "AI 键使用共享 glyph");
    assert.equal(row.querySelector("[data-edit-bar-pin]"), null, "固定柄不再占编辑栏控件位");
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("宽度不足：创建工具逐项进入同一个 More，点击与选区保持有效，宽度回来再展开", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  geometry.overlayWidth = 1000;
  const executed = [];
  const commands = [];
  const creationTools = documentTools.map((tool) => ({ ...tool, execute: () => executed.push(tool.id) }));
  const props = { storageKey: "test:edit-bar-single-row:fold", selection: selectionTools, creationTools, onCommand: (command) => commands.push(command) };
  const mounted = await mount(props);
  try {
    const row = () => mounted.container.querySelector("[data-workspace-edit-bar]");
    assert.deepEqual(visibleControls(row()), ["bold", "italic", "recalculate", "phone-preview"]);
    let partialWidth = 0;
    for (let width = 600; width >= 140; width -= 2) {
      await resizeOverlay(width);
      const visibleCreation = visibleControls(row()).filter((id) => documentTools.some((tool) => tool.id === id));
      if (visibleCreation.length === 1) { partialWidth = width; break; }
    }
    assert.ok(partialWidth, "creation tools must fit and overflow individually");
    const visibleCreation = visibleControls(row()).filter((id) => creationTools.some((tool) => tool.id === id));
    const overflowCreation = overflowControls(row()).filter((id) => creationTools.some((tool) => tool.id === id));
    assert.equal(visibleCreation.length, 1);
    assert.equal(overflowCreation.length, 1);
    assert.deepEqual([...visibleCreation, ...overflowCreation].sort(), creationTools.map((tool) => tool.id).sort());
    assert.equal(row().querySelector("[data-edit-bar-document-slot], [data-edit-bar-document-more]"), null);
    assert.equal(row().querySelectorAll("[data-selection-id]").length, 1);
    assert.equal(row().querySelectorAll("[data-edit-bar-agent]").length, 1, "AI never enters overflow");
    assert.ok(row().querySelector("[data-edit-bar-selection-slot]"));
    const moreButton = row().querySelector('button[aria-controls^="selection-more-"]');
    assert.ok(moreButton?.getAttribute("aria-label"), "More has an accessible name");
    const text = document.createTextNode("selected editor text");
    mounted.container.prepend(text);
    const range = document.createRange(); range.selectNodeContents(text);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const pointer = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    await act(async () => moreButton.dispatchEvent(pointer));
    assert.equal(pointer.defaultPrevented, true, "toolbar presses preserve the editor selection");
    await act(async () => moreButton.click());
    const menu = mounted.container.querySelector('[data-test-popover][role="dialog"]');
    assert.ok(menu?.getAttribute("aria-label"), "More content is an accessible dialog");
    const hiddenId = overflowCreation[0];
    const action = menu.querySelector(`[data-selection-overflow-control][data-selection-control-id="${hiddenId}"] button`);
    assert.ok(action);
    assert.equal(action.textContent.trim(), creationTools.find((tool) => tool.id === hiddenId).label, "overflow actions show their full labels");
    await act(async () => action.click());
    assert.deepEqual(executed, [hiddenId], "the chosen creation action executes once");
    assert.equal(commands.at(-1).selectionId, selectionTools.id);
    assert.equal(commands.at(-1).selectionRevision, selectionTools.revision);
    assert.equal(commands.at(-1).selectionEpoch, selectionTools.epoch);
    assert.equal(selection.toString(), "selected editor text");
    assert.equal(row().querySelectorAll("[data-edit-bar-agent]").length, 1);
    await resizeOverlay(1000);
    assert.deepEqual(visibleControls(row()), ["bold", "italic", "recalculate", "phone-preview"], "all controls return when width grows");
    assert.deepEqual(overflowControls(row()), []);
    await mounted.rerender({ ...props, selection: null });
    await resizeOverlay(300);
    assert.deepEqual(visibleControls(row()), creationTools.map((tool) => tool.id), "creation remains usable without a selection");
    await resizeOverlay(140);
    assert.deepEqual([...visibleControls(row()), ...overflowControls(row())].sort(), creationTools.map((tool) => tool.id).sort());
    assert.ok(overflowControls(row()).length > 0, "creation-only rows use the same individual overflow");
    assert.equal(row().querySelectorAll("[data-edit-bar-agent]").length, 1);
    await resizeOverlay(1000);
    assert.deepEqual(visibleControls(row()), creationTools.map((tool) => tool.id));
  } finally {
    window.getSelection().removeAllRanges();
    await mounted.unmount();
    restoreRect();
  }
});

test("源码闸：prop 名、收起/固定键已删、所有 edit bar 共用新 agent glyph", () => {
  const floating = readFileSync(resolve("src/shell/FloatingContextToolbar.tsx"), "utf8");
  assert.doesNotMatch(floating, /data-edit-bar-document-more|documentCollapsed/, "whole document-segment overflow must not return");
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
  assert.doesNotMatch(controls, /EditBarPinButton|data-edit-bar-pin/, "固定/取消固定键不许长回来");
  assert.doesNotMatch(floating, /EditBarPinButton|data-edit-bar-pin/);

  const selection = readFileSync(resolve("src/shell/SelectionToolbar.tsx"), "utf8");
  assert.match(selection, /useInsideEditBarRow\(\)/);
  assert.match(
    selection,
    /const agentButton =\s*layout && !insideRow/,
    "行里 SelectionToolbar 不许再画自己的 AI 键",
  );

  const selectionChrome = readFileSync(resolve("src/shell/selection-toolbar-chrome.tsx"), "utf8");
  const pluginFrame = readFileSync(resolve("src/shell/plugin-chrome/PluginChromeFrame.tsx"), "utf8");
  const agentGlyph = readFileSync(resolve("src/shell/EditBarAgentIcon.tsx"), "utf8");
  assert.match(floating, /<EditBarAgentIcon/);
  assert.match(selectionChrome, /<EditBarAgentIcon/);
  assert.match(pluginFrame, /<EditBarAgentIcon/);
  assert.match(agentGlyph, /data-edit-bar-agent-icon/);

  const shell = readFileSync(resolve("src/shell/InlineAdvancedWorkbenchShell.tsx"), "utf8");
  assert.doesNotMatch(
    shell,
    /<div\s[^>]*data-workspace-edit-bar/,
    "壳不许再自己拼 [data-workspace-edit-bar]，容器归 FloatingContextToolbar",
  );
  assert.doesNotMatch(shell, /documentSegment=\{/);
  assert.match(shell, /editBarDocumentTools\(\{/);
  assert.match(shell, /creationTools\.map\(\(tool\) => creationToolControl\(tool, tt\)\)/);
});
