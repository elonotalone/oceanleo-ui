/** E1: bounded double press, exercised through the real controller and toolbar. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act, useRef } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  createPointerClock, installClockTimers, pointerDown, pointerMove,
  pointerUp, resetPointerCaptureShim, tap,
} from "./helpers/chromium-pointer-sequence.mjs";

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

const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
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
  export function actionGroup(action) { return action.group || "edit"; }
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

async function mountBar(attribute = "aria-pressed") {
  window.localStorage.clear();
  resetPointerCaptureShim();
  const clock = createPointerClock(1000);
  const restoreTimers = installClockTimers(clock);
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const width = this.hasAttribute("data-workspace-edit-bar-toolbar") ? 300 : 1000;
    const height = width === 300 ? 38 : 600;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} };
  };
  let controller;
  let clicks = 0;
  let renders = 0;
  function Harness() {
    renders += 1;
    const workspaceRootRef = useRef(null);
    const stageRef = useRef(null);
    controller = useFloatingContextToolbar({ workspaceRootRef, stageRef, resetKey: "e1" });
    return React.createElement("div", { ref: workspaceRootRef },
      React.createElement("div", { ref: stageRef }),
      React.createElement(FloatingContextToolbar, { controller, accent: "#336699", assistant: null },
        React.createElement("button", {
          "data-test-toggle": true,
          [attribute]: "false",
          onClick: (event) => {
            clicks += 1;
            const button = event.currentTarget;
            button.setAttribute(attribute, button.getAttribute(attribute) === "true" ? "false" : "true");
          },
        }, React.createElement("svg", null, React.createElement("path", { "data-test-icon": true }))),
      ),
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness)));
  const button = container.querySelector("[data-test-toggle]");
  const bar = container.querySelector("[data-workspace-edit-bar-toolbar]");
  const icon = button.querySelector("[data-test-icon]");
  async function first({ duration = 20, pointerType = "mouse", x = 200, y = 100 } = {}) {
    await act(async () => {
      const down = pointerDown(icon, { clock, pointerType, pointerId: 1, clientX: x, clientY: y });
      clock.now += duration;
      pointerUp(icon, { clock, pointerType, pointerId: 1, clientX: x, clientY: y, downPrevented: down.prevented });
    });
  }
  async function second({ gap = 120, x = 200, y = 100, pointerType = "mouse" } = {}) {
    await act(async () => {
      clock.now += gap;
      pointerDown(icon, { clock, pointerType, pointerId: 2, clientX: x, clientY: y });
    });
  }
  async function move(x = 260, y = 100, pointerType = "mouse") {
    await act(async () => {
      clock.now += 16;
      pointerMove(icon, { clock, pointerType, pointerId: 2, clientX: x, clientY: y });
    });
  }
  async function up(x = 260, y = 100, pointerType = "mouse") {
    await act(async () => {
      clock.now += 16;
      pointerUp(icon, { clock, pointerType, pointerId: 2, clientX: x, clientY: y, clickCount: 2 });
    });
  }
  return {
    bar, button, icon, clock, first, second, move, up,
    get controller() { return controller; },
    get clicks() { return clicks; },
    get renders() { return renders; },
    async close() {
      await act(async () => root.unmount());
      container.remove();
      restoreTimers();
      window.HTMLElement.prototype.getBoundingClientRect = originalRect;
      resetPointerCaptureShim();
    },
  };
}

test("单击只触发按钮，不重渲染控制器、不留 armed/selected 属性或 rearmWindow", async () => {
  const h = await mountBar();
  try {
    const renders = h.renders;
    await h.first();
    assert.equal(h.clicks, 1);
    assert.equal(h.button.getAttribute("aria-pressed"), "true");
    assert.deepEqual(h.bar.getAttributeNames().filter((name) => /^data-edit-bar-(armed|selected)/.test(name)), []);
    assert.equal("rearmWindow" in h.controller, false);
    assert.equal(h.renders, renders, "单击不得触发编辑栏状态更新");
  } finally { await h.close(); }
});

for (const attribute of ["aria-pressed", "aria-expanded"]) {
  test(`首次直接双击拖：图标命中回退 ${attribute}，第二下松开不点击`, async () => {
    const h = await mountBar(attribute);
    try {
      await h.first();
      assert.equal(h.clicks, 1);
      await h.second();
      await h.move();
      assert.equal(h.controller.dragging, true, "无需任何额外单击，第二下移动立即拖");
      assert.equal(h.button.getAttribute(attribute), "false");
      assert.equal(h.clicks, 2, "只有首击和恢复开关的点击");
      await h.up();
      assert.equal(h.clicks, 2, "拖完第二下不得点击按钮");
      assert.equal(h.controller.dragging, false);
    } finally { await h.close(); }
  });
}

for (const gap of [399, 400, 401, 1501, 10000]) {
  test(`第一下松开后 ${gap}ms：${gap <= 400 ? "可拖" : "不能拖"}`, async () => {
    const h = await mountBar();
    try {
      await h.first();
      await h.second({ gap });
      await h.move();
      assert.equal(h.controller.dragging, gap <= 400);
      assert.equal(h.controller.moveMode, gap <= 400);
      if (gap > 400) assert.equal(h.button.getAttribute("aria-pressed"), "true", "不能回退过期的第一次点击");
      await h.up();
    } finally { await h.close(); }
  });
}

for (const [dx, dy, expected] of [[12, 0, true], [13, 0, false], [0, 13, false], [9, 9, false]]) {
  test(`两次按下相距 (${dx}, ${dy})px：拖动=${expected}`, async () => {
    const h = await mountBar();
    try {
      await h.first();
      await h.second({ x: 200 + dx, y: 100 + dy });
      await h.move(260 + dx, 100 + dy);
      assert.equal(h.controller.dragging, expected);
      await h.up(260 + dx, 100 + dy);
    } finally { await h.close(); }
  });
}

test("400ms 从首次松开计时，第二下按住超过窗口仍可拖", async () => {
  const h = await mountBar();
  try {
    await h.first({ duration: 900 });
    await h.second({ gap: 399 });
    await act(async () => { h.clock.now += 500; });
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), true);
    await h.move();
    assert.equal(h.controller.dragging, true);
    await h.up();
  } finally { await h.close(); }
});

test("距离比较两次按下点，不用首次松开点", async () => {
  const h = await mountBar();
  try {
    await act(async () => {
      pointerDown(h.icon, { clock: h.clock, pointerId: 1, clientX: 200, clientY: 100 });
      h.clock.now += 16;
      pointerUp(h.icon, { clock: h.clock, pointerId: 1, clientX: 203, clientY: 100 });
    });
    await h.second({ x: 213 });
    await h.move(270);
    assert.equal(h.controller.dragging, false, "相距 13px，尽管离松开点只有 10px");
    await h.up(270);
  } finally { await h.close(); }
});

for (const pointerType of ["mouse", "touch"]) {
  test(`${pointerType}：第二下移动阈值 ${pointerType === "touch" ? 8 : 4}px`, async () => {
    const h = await mountBar();
    const threshold = pointerType === "touch" ? 8 : 4;
    try {
      await h.first({ pointerType });
      await h.second({ pointerType });
      await h.move(200 + threshold - 1, 100, pointerType);
      assert.equal(h.controller.dragging, false);
      await h.move(200 + threshold, 100, pointerType);
      assert.equal(h.controller.dragging, true);
      await h.up(200 + threshold, 100, pointerType);
    } finally { await h.close(); }
  });
}

test("第二下不移动就松开：两次点击都生效且只各一次", async () => {
  const h = await mountBar();
  try {
    await h.first();
    await h.second();
    await h.up(200);
    assert.equal(h.clicks, 2);
    assert.equal(h.button.getAttribute("aria-pressed"), "false");
    assert.equal(h.controller.dragging, false);
    assert.equal(h.controller.moveMode, false);
  } finally { await h.close(); }
});

test("超时或超距的按下成为新的第一下，下次邻近快速按下可以拖", async () => {
  for (const [gap, x] of [[401, 200], [120, 240]]) {
    const h = await mountBar();
    try {
      await h.first();
      await act(async () => {
        h.clock.now += gap;
        tap(h.icon, { clock: h.clock, pointerId: 1, clientX: x, clientY: 100 });
      });
      assert.equal(h.clicks, 2);
      await h.second({ x });
      await h.move(x + 60);
      assert.equal(h.controller.dragging, true);
      assert.equal(h.button.getAttribute("aria-pressed"), "true", "只回退新的第一下");
      await h.up(x + 60);
    } finally { await h.close(); }
  }
});

test("第二下按住 300ms 没移动：保留抬起视觉，松开仍是第二次正常点击", async () => {
  const h = await mountBar();
  try {
    await h.first();
    await h.second();
    await act(async () => { h.clock.now += 300; });
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), true);
    assert.equal(h.clicks, 1, "按住时不提前点击");
    await h.up(200);
    assert.equal(h.clicks, 2, "没发生拖动，松开仍应点击");
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), false);
  } finally { await h.close(); }
});
