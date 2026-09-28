/** E1: press-to-drag edit bar, exercised through the real controller and toolbar. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act, useRef } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  createPointerClock, installClockTimers, pointerDown, pointerMove,
  pointerUp, resetPointerCaptureShim,
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
const { resetEditBarDoublePressStamp } = await import(controllerUrl);

async function mountBar(attribute = "aria-pressed") {
  window.localStorage.clear();
  resetEditBarDoublePressStamp();
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
  let harnessKey = 0;
  await act(async () => root.render(React.createElement(Harness, { key: harnessKey })));
  const liveButton = () => container.querySelector("[data-test-toggle]");
  const liveBar = () => container.querySelector("[data-workspace-edit-bar-toolbar]");
  const liveIcon = () => liveButton()?.querySelector("[data-test-icon]");
  async function tap({ duration = 20, pointerType = "mouse", x = 200, y = 100 } = {}) {
    await act(async () => {
      const down = pointerDown(liveIcon(), { clock, pointerType, pointerId: 1, clientX: x, clientY: y });
      clock.now += duration;
      pointerUp(liveIcon(), { clock, pointerType, pointerId: 1, clientX: x, clientY: y, downPrevented: down.prevented });
    });
  }
  async function press({ pointerType = "mouse", x = 200, y = 100, pointerId = 1 } = {}) {
    await act(async () => {
      pointerDown(liveIcon(), { clock, pointerType, pointerId, clientX: x, clientY: y });
    });
  }
  async function move(x = 260, y = 100, pointerType = "mouse", pointerId = 1) {
    await act(async () => {
      clock.now += 16;
      pointerMove(liveIcon(), { clock, pointerType, pointerId, clientX: x, clientY: y });
    });
  }
  async function up(x = 260, y = 100, pointerType = "mouse", pointerId = 1) {
    await act(async () => {
      clock.now += 16;
      pointerUp(liveIcon(), { clock, pointerType, pointerId, clientX: x, clientY: y });
    });
  }
  async function remount() {
    harnessKey += 1;
    await act(async () => root.render(React.createElement(Harness, { key: harnessKey })));
  }
  return {
    get bar() { return liveBar(); },
    get button() { return liveButton(); },
    get icon() { return liveIcon(); },
    clock, tap, press, move, up, remount,
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

test("栏重挂后第一次按下仍出光圈并可拖", async () => {
  const h = await mountBar();
  try {
    await h.tap();
    await h.remount();
    await h.press();
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "重挂后第一次按下必须走进武装",
    );
    await h.move();
    assert.equal(h.controller.dragging, true, "重挂后按住移动必须起拖");
  } finally { await h.close(); }
});

test("合成事件 timeStamp 与栏上时钟不是同一纪元，按下仍进入武装", async () => {
  const h = await mountBar();
  try {
    await act(async () => {
      pointerDown(h.icon, {
        clock: { now: 1 },
        pointerType: "mouse",
        pointerId: 1,
        clientX: 200,
        clientY: 100,
      });
    });
    assert.equal(h.controller.moveMode, true, "合成按下必须进入武装");
    assert.ok(h.bar.querySelector("[data-edit-bar-move-shield]"));
  } finally { await h.close(); }
});

test("第一次按下移动 4px 即起拖", async () => {
  const h = await mountBar();
  try {
    await h.press();
    await act(async () => {
      h.clock.now += 10;
      pointerMove(h.icon, { clock: h.clock, pointerId: 1, clientX: 204, clientY: 100 });
    });
    assert.equal(h.controller.dragging, true, "第一次按下移动达鼠标阈值必须起拖");
  } finally { await h.close(); }
});

test("按下出光圈，长按保持，按住移动可拖", async () => {
  const h = await mountBar();
  try {
    await h.press();
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "按下必须立刻出光圈",
    );
    await act(async () => { h.clock.now += 300; });
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "长按期间光圈必须保持",
    );
    await h.move();
    assert.equal(h.controller.dragging, true, "长按移动必须起拖");
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "拖的过程中光圈必须还在",
    );
  } finally { await h.close(); }
});

test("按下后 buttons=0 的 pointermove 不得当成抬起", async () => {
  const h = await mountBar();
  try {
    await h.press();
    await act(async () => {
      const move = new Event("pointermove", { bubbles: true, cancelable: true });
      Object.defineProperty(move, "pointerId", { value: 1 });
      Object.defineProperty(move, "buttons", { value: 0 });
      Object.defineProperty(move, "clientX", { value: 200 });
      Object.defineProperty(move, "clientY", { value: 100 });
      Object.defineProperty(move, "timeStamp", { value: h.clock.now });
      window.dispatchEvent(move);
    });
    assert.equal(h.controller.moveMode, true, "假抬起不得结束武装");
    assert.ok(h.bar.querySelector("[data-edit-bar-move-shield]"), "假抬起不得灭光圈");
    await h.move();
    assert.equal(h.controller.dragging, true, "假抬起之后仍可按住拖");
  } finally { await h.close(); }
});

test("轻点只触发按钮，不留 armed/selected 属性或 rearmWindow", async () => {
  const h = await mountBar();
  try {
    await h.tap();
    assert.equal(h.clicks, 1);
    assert.equal(h.button.getAttribute("aria-pressed"), "true");
    assert.deepEqual(h.bar.getAttributeNames().filter((name) => /^data-edit-bar-(armed|selected)/.test(name)), []);
    assert.equal("rearmWindow" in h.controller, false);
    assert.equal(h.controller.moveMode, false);
    assert.equal(h.bar.querySelector("[data-edit-bar-move-shield]"), null);
  } finally { await h.close(); }
});

for (const attribute of ["aria-pressed", "aria-expanded"]) {
  test(`第一次按住拖：图标命中不切换 ${attribute}，松开不点击`, async () => {
    const h = await mountBar(attribute);
    try {
      await h.press();
      await h.move();
      assert.equal(h.controller.dragging, true, "第一次按下移动立即拖");
      assert.equal(h.button.getAttribute(attribute), "false");
      assert.equal(h.clicks, 0, "起拖不得点击按钮");
      await h.up();
      assert.equal(h.clicks, 0, "拖完松开不得点击按钮");
      assert.equal(h.controller.dragging, false);
    } finally { await h.close(); }
  });
}

for (const gap of [0, 399, 400, 401, 1501, 10000]) {
  test(`轻点后再隔 ${gap}ms 按下移动：仍可拖`, async () => {
    const h = await mountBar();
    try {
      await h.tap();
      assert.equal(h.button.getAttribute("aria-pressed"), "true");
      h.clock.now += gap;
      await h.press();
      await h.move();
      assert.equal(h.controller.dragging, true);
      assert.equal(h.controller.moveMode, true);
      assert.equal(h.button.getAttribute("aria-pressed"), "true", "已完成的轻点不得被随后的拖拽撤销");
      await h.up();
    } finally { await h.close(); }
  });
}

for (const [dx, dy] of [[12, 0], [13, 0], [0, 13], [9, 9]]) {
  test(`按在距原点 (${dx}, ${dy})px 处仍能拖`, async () => {
    const h = await mountBar();
    try {
      await h.press({ x: 200 + dx, y: 100 + dy });
      await h.move(260 + dx, 100 + dy);
      assert.equal(h.controller.dragging, true);
      await h.up(260 + dx, 100 + dy);
    } finally { await h.close(); }
  });
}

test("按住超过抬起阈值后移动仍可拖", async () => {
  const h = await mountBar();
  try {
    await h.press();
    await act(async () => { h.clock.now += 500; });
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), true);
    await h.move();
    assert.equal(h.controller.dragging, true);
    await h.up();
  } finally { await h.close(); }
});

for (const pointerType of ["mouse", "touch"]) {
  test(`${pointerType}：第一次按下移动阈值 ${pointerType === "touch" ? 8 : 4}px`, async () => {
    const h = await mountBar();
    const threshold = pointerType === "touch" ? 8 : 4;
    try {
      await h.press({ pointerType });
      await h.move(200 + threshold - 1, 100, pointerType);
      assert.equal(h.controller.dragging, false);
      await h.move(200 + threshold, 100, pointerType);
      assert.equal(h.controller.dragging, true);
      await h.up(200 + threshold, 100, pointerType);
    } finally { await h.close(); }
  });
}

test("不移动就松开：点击恰好一次", async () => {
  const h = await mountBar();
  try {
    await h.press();
    await h.up(200);
    assert.equal(h.clicks, 1);
    assert.equal(h.button.getAttribute("aria-pressed"), "true");
    assert.equal(h.controller.dragging, false);
    assert.equal(h.controller.moveMode, false);
  } finally { await h.close(); }
});

test("按下立刻出光圈；插入光圈丢掉 capture 不得清掉；抬起才消失", async () => {
  const h = await mountBar();
  try {
    await h.press();
    assert.equal(h.controller.moveMode, true, "按下必须进入 moveMode");
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "按下当下必须画出光圈",
    );
    await act(async () => {
      const lost = new Event("lostpointercapture", { bubbles: true });
      Object.defineProperty(lost, "pointerId", { value: 1 });
      h.bar.dispatchEvent(lost);
    });
    assert.equal(
      h.controller.moveMode,
      true,
      "光圈 DOM 插入导致的 lostpointercapture 不得结束武装",
    );
    assert.ok(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      "丢失捕获后光圈必须还在",
    );
    await h.up(200);
    assert.equal(h.controller.moveMode, false, "抬起才离开 moveMode");
    assert.equal(
      h.bar.querySelector("[data-edit-bar-move-shield]"),
      null,
      "抬起光圈必须消失",
    );
  } finally { await h.close(); }
});

test("按住 300ms 没移动：保留抬起视觉，松开仍是一次正常点击", async () => {
  const h = await mountBar();
  try {
    await h.press();
    await act(async () => { h.clock.now += 300; });
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), true);
    assert.equal(h.clicks, 0, "按住时不提前点击");
    await h.up(200);
    assert.equal(h.clicks, 1, "没发生拖动，松开仍应点击");
    assert.equal(h.bar.hasAttribute("data-edit-bar-lifted"), false);
  } finally { await h.close(); }
});
