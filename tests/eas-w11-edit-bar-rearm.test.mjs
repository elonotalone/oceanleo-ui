/**
 * W11：先单击一下，再按住即可拖动。选中状态不设时间窗口。
 * 全部指针回放走 Chromium 顺序助手；13 个插件 id + 三个 PluginChromeFrame 宿主各跑主路径。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  createPointerClock,
  installClockTimers,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  resetPointerCaptureShim,
  tap,
} from "./helpers/chromium-pointer-sequence.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const PLUGIN_IDS = [
  "richdoc",
  "grid",
  "chart-editor",
  "deck",
  "image",
  "pdf",
  "audio",
  "video-timeline",
  "threed",
  "game",
  "design-canvas",
  "website",
  "video-canvas",
];
const CHROME_HOSTS = ["design-canvas", "website", "video-canvas"];

function surfaceNumber(name) {
  const src = readFileSync(resolve(REPO, "src/shell/edit-bar-surface.ts"), "utf8");
  const match = src.match(new RegExp(`export const ${name} = (\\d+)`));
  assert.ok(match, `edit-bar-surface.ts 里没有 ${name}`);
  return Number(match[1]);
}

const COLLAPSED_SIZE = surfaceNumber("EDIT_BAR_COLLAPSED_SIZE_PX");
const CONTROL_SIZE = surfaceNumber("EDIT_BAR_CONTROL_SIZE_PX");
const PILL_PADDING = surfaceNumber("EDIT_BAR_PILL_PADDING_PX");
const TOOLBAR_HEIGHT = CONTROL_SIZE + PILL_PADDING * 2;

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
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

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
`);
const agentPanelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export const PLUGIN_AGENT_DRAWER_ID = "agent";
  export function createPluginAgentDrawer({ editorId }) {
    return { id: "agent", label: "AI", icon: "agent", content: jsx("div", { "data-plugin-agent-panel": editorId }) };
  }
  export function PluginAgentPanel({ editorId }) {
    return jsx("div", { "data-plugin-agent-panel": editorId });
  }
`);
const pluginThemeStubUrl = dataModule(`
  export function usePluginTheme() { return { theme: "light", accent: "#4f46e5" }; }
  export function PluginThemeToggle() { return null; }
  export function pluginWorkbenchStyle(_theme, accent) { return { "--awb-accent": accent }; }
  export function usePluginThemePortal() { return null; }
`);
const splitWorkspaceStubUrl = dataModule(`
  export function useConsoleAgentFocus() { return null; }
`);

const frameUrl = await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
  "react-dom": reactDomUrl,
  "../../i18n/ui/useUI": uiStubUrl,
  "../AdvancedEditorIcon": iconStubUrl,
  "../plugin-theme": pluginThemeStubUrl,
  "../SplitWorkspace": splitWorkspaceStubUrl,
  "./agent-drawer-panel": agentPanelStubUrl,
  "./PluginAgentPanel": agentPanelStubUrl,
});
const { PluginChromeFrame } = await import(frameUrl);

function resetHint() {
  globalThis.__oceanleoEditBarRearmHintShown = false;
}

function translateOf(element) {
  const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(element?.style.transform || "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function installRectStub() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  const rect = (left, top, width, height) => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() {},
  });
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(this.style.transform || "");
      return rect(match ? Number(match[1]) : 100, match ? Number(match[2]) : 60, 300, TOOLBAR_HEIGHT);
    }
    if (this.hasAttribute("data-plugin-chrome")) return rect(0, 0, 1000, 600);
    if (this.hasAttribute("data-plugin-chrome-stage")) return rect(0, 110, 1000, 490);
    if (this.hasAttribute("data-plugin-chrome-edit-bar")) {
      return rect(0, 56, 1000, COLLAPSED_SIZE);
    }
    if (
      this.hasAttribute("data-workspace-docked-toolbar") ||
      this.hasAttribute("data-workspace-floating-toolbar")
    ) {
      return rect(0, 0, 1000, 600);
    }
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  };
}

async function mountFrame(pluginId, editBar) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PluginChromeFrame, {
        pluginId,
        title: pluginId,
        editBar:
          editBar ||
          React.createElement("div", { "data-test-edit-bar": true }, "工具条"),
        children: React.createElement("div", { "data-test-stage": true }),
      }),
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function barOf(container) {
  return container.querySelector("[data-workspace-edit-bar-toolbar]");
}

function beginClock(start) {
  const clock = createPointerClock(start);
  return { clock, restoreTimers: installClockTimers(clock) };
}

async function holdDrag(target, clock, { pointerId, pointerType, from, to, afterMs }) {
  let down;
  await act(async () => {
    clock.now += afterMs;
    down = pointerDown(target, {
      clock,
      pointerId,
      pointerType,
      clientX: from.x,
      clientY: from.y,
    });
    clock.now += 16;
    pointerMove(target, {
      clock,
      pointerId: down.pointerId,
      pointerType,
      clientX: to.x,
      clientY: to.y,
    });
  });
  return down;
}

test("源码门禁：controller 里没有 DOUBLE_PRESS_MS / .detail / dblclick", () => {
  const src = readFileSync(resolve(REPO, "src/shell/edit-bar-dock-controller.tsx"), "utf8");
  assert.doesNotMatch(src, /DOUBLE_PRESS_MS/);
  assert.doesNotMatch(src, /\.detail\b/);
  assert.doesNotMatch(src, /dblclick/i);
  assert.doesNotMatch(src, /REARM_WINDOW_MS|REARM_SLOP_/);
});

for (const pluginId of [...PLUGIN_IDS, ...CHROME_HOSTS]) {
  test(`主路径 · ${pluginId}：松开后 150 / 800 / 1499 / 10000 ms 再按住就能拖`, async () => {
    window.localStorage.clear();
    resetPointerCaptureShim();
    resetHint();
    const restore = installRectStub();
    const mounted = await mountFrame(pluginId);
    const anywhere = () => mounted.container.querySelector("[data-test-edit-bar]");
    const bar = () => barOf(mounted.container);
    try {
      assert.ok(anywhere() && bar(), "条和内容必须在");
      assert.match(bar().className, /touch-none/, "条根必须 touch-action: none");
      for (const gap of [150, 800, 1499, 10000]) {
        const { clock, restoreTimers } = beginClock(10_000 + gap);
        try {
          const before = translateOf(bar());
          await act(async () => {
            tap(anywhere(), { clock, clientX: 400, clientY: 70, pointerId: 1 });
          });
          assert.ok(bar().hasAttribute("data-edit-bar-armed"), `${gap}ms 前第一下松开后应武装`);
          await holdDrag(anywhere(), clock, {
            pointerId: 1,
            pointerType: "mouse",
            from: { x: 400, y: 70 },
            to: { x: 460, y: 70 },
            afterMs: gap,
          });
          const dragged = translateOf(bar());
          assert.ok(before && dragged, "必须量得到位置");
          assert.ok(
            Math.abs(dragged.x - before.x) >= 40,
            `${pluginId} 隔 ${gap}ms 应拖动，实际 ${before.x} → ${dragged.x}`,
          );
          clock.now += 16;
          await act(async () => {
            pointerUp(anywhere(), { clock, pointerId: 1, clientX: 460, clientY: 70 });
          });
        } finally {
          restoreTimers();
        }
      }
    } finally {
      await mounted.unmount();
      restore();
    }
  });
}

test("隔 1501 ms：第二下仍可拖，且拖动不触发按钮", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  let clicks = 0;
  const mounted = await mountFrame(
    "richdoc",
    React.createElement(
      "button",
      { type: "button", "data-test-bold": true, onClick: () => { clicks += 1; } },
      "加粗",
    ),
  );
  try {
    const btn = mounted.container.querySelector("[data-test-bold]");
    const { clock, restoreTimers } = beginClock(20_000);
    try {
    const before = translateOf(barOf(mounted.container));
    await act(async () => {
      tap(btn, { clock, clientX: 200, clientY: 70, pointerId: 1 });
    });
    assert.equal(clicks, 1, "第一下加粗恰好一次");
    await holdDrag(btn, clock, {
      pointerId: 1,
      pointerType: "mouse",
      from: { x: 200, y: 70 },
      to: { x: 260, y: 70 },
      afterMs: 1501,
    });
    const draggedAfterLongGap = translateOf(barOf(mounted.container));
    assert.ok(Math.abs(draggedAfterLongGap.x - before.x) >= 40, "1501ms 后第二下按住仍应拖");
    clock.now += 16;
    await act(async () => {
      pointerUp(btn, { clock, pointerId: 1, clientX: 260, clientY: 70 });
    });
    assert.equal(clicks, 1, "拖动那一下不得再次触发按钮");
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("第一下加粗恰好一次；第二下按住或拖动 onClick 0；快速点撤销两次", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  let bold = 0;
  let undo = 0;
  const mounted = await mountFrame(
    "deck",
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { type: "button", "data-test-bold": true, onClick: () => { bold += 1; } },
        "加粗",
      ),
      React.createElement(
        "button",
        { type: "button", "data-test-undo": true, onClick: () => { undo += 1; } },
        "撤销",
      ),
    ),
  );
  try {
    const boldBtn = mounted.container.querySelector("[data-test-bold]");
    const undoBtn = mounted.container.querySelector("[data-test-undo]");
    const { clock, restoreTimers } = beginClock(30_000);
    try {
    await act(async () => {
      tap(boldBtn, { clock, clientX: 180, clientY: 70, pointerId: 1 });
    });
    assert.equal(bold, 1);
    await holdDrag(boldBtn, clock, {
      pointerId: 1,
      pointerType: "mouse",
      from: { x: 180, y: 70 },
      to: { x: 240, y: 70 },
      afterMs: 200,
    });
    clock.now += 16;
    await act(async () => {
      pointerUp(boldBtn, { clock, pointerId: 1, clientX: 240, clientY: 70 });
    });
    assert.equal(bold, 1, "第二下拖动不得再点加粗");

    await act(async () => {
      tap(undoBtn, { clock, clientX: 220, clientY: 70, pointerId: 2 });
    });
    assert.equal(undo, 1);
    clock.now += 80;
    await act(async () => {
      tap(undoBtn, { clock, clientX: 220, clientY: 70, pointerId: 2, clickCount: 2 });
    });
    assert.equal(undo, 2, "第二下快速点撤销必须再撤销一次");
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("第二下按住 300ms 不动：没有 click，带 data-edit-bar-lifted；Esc 归位", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  let clicks = 0;
  const mounted = await mountFrame(
    "image",
    React.createElement(
      "button",
      { type: "button", "data-test-tool": true, onClick: () => { clicks += 1; } },
      "工具",
    ),
  );
  try {
    const btn = mounted.container.querySelector("[data-test-tool]");
    const bar = () => barOf(mounted.container);
    const { clock, restoreTimers } = beginClock(40_000);
    try {
    await act(async () => {
      tap(btn, { clock, clientX: 200, clientY: 70, pointerId: 1 });
    });
    const before = translateOf(bar());
    let down;
    await act(async () => {
      clock.now += 100;
      down = pointerDown(btn, { clock, pointerId: 1, clientX: 200, clientY: 70 });
      clock.now += 300;
      pointerMove(btn, {
        clock,
        pointerId: down.pointerId,
        clientX: 200,
        clientY: 70,
      });
    });
    assert.ok(bar().hasAttribute("data-edit-bar-lifted"), "按住 300ms 应抬起");
    assert.equal(clicks, 1, "抬起过程不得再 click");
    await act(async () => {
      bar().dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    assert.deepEqual(translateOf(bar()), before, "Esc 必须恢复位置");
    assert.equal(clicks, 1, "Esc 不得产生 click");
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("双击后再按住能拖；触屏换 pointerId；pointercancel 归位；buttons 0 结束", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  const mounted = await mountFrame("pdf");
  try {
    const anywhere = mounted.container.querySelector("[data-test-edit-bar]");
    const bar = () => barOf(mounted.container);
    const { clock, restoreTimers } = beginClock(50_000);
    try {
    await act(async () => {
      tap(anywhere, {
        clock,
        pointerType: "touch",
        pointerId: 31,
        clientX: 400,
        clientY: 70,
      });
    });
    const origin = translateOf(bar());
    const cancelDown = await holdDrag(anywhere, clock, {
      pointerId: 32,
      pointerType: "touch",
      from: { x: 400, y: 70 },
      to: { x: 480, y: 70 },
      afterMs: 80,
    });
    const dragged = translateOf(bar());
    assert.ok(dragged && origin && dragged.x !== origin.x, "触屏换 pointerId 必须能拖");
    await act(async () => {
      pointerCancel(anywhere, {
        clock,
        pointerId: cancelDown.pointerId,
        pointerType: "touch",
        clientX: 480,
        clientY: 70,
      });
    });
    const restored = translateOf(bar());
    assert.notDeepEqual(restored, dragged, "pointercancel 必须离开拖中的位置");
    assert.equal(
      bar().getAttribute("data-edit-bar-move-mode"),
      null,
      "pointercancel 之后不得还在按住拖",
    );
    const before = translateOf(bar());
    await act(async () => {
      tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 1, clickCount: 1 });
    });
    clock.now += 40;
    await act(async () => {
      tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 1, clickCount: 2 });
    });
    await holdDrag(anywhere, clock, {
      pointerId: 1,
      pointerType: "mouse",
      from: { x: 400, y: 70 },
      to: { x: 470, y: 70 },
      afterMs: 80,
    });
    assert.ok(Math.abs(translateOf(bar()).x - before.x) >= 40, "双击后再按住应能拖");
    clock.now += 16;
    await act(async () => {
      pointerUp(anywhere, { clock, pointerId: 1, clientX: 470, clientY: 70 });
    });

    await act(async () => {
      tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 3 });
    });
    await holdDrag(anywhere, clock, {
      pointerId: 3,
      pointerType: "mouse",
      from: { x: 400, y: 70 },
      to: { x: 430, y: 70 },
      afterMs: 100,
    });
    const mid = translateOf(bar());
    clock.now += 16;
    await act(async () => {
      pointerMove(anywhere, {
        clock,
        pointerId: 3,
        pointerType: "mouse",
        buttons: 0,
        clientX: 500,
        clientY: 70,
      });
    });
    assert.deepEqual(translateOf(bar()), mid, "buttons 0 视为松开，不得继续跟手");
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("条外按下清掉 CLICKED；滑块上第二下条不动；没先点按住拖提示一次", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  let slider = 0;
  const mounted = await mountFrame(
    "audio",
    React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { "data-test-edit-bar": true }, "空白"),
      React.createElement("input", {
        type: "range",
        "data-test-slider": true,
        defaultValue: "40",
        onInput: () => { slider += 1; },
        onChange: () => { slider += 1; },
      }),
    ),
  );
  try {
    const anywhere = mounted.container.querySelector("[data-test-edit-bar]");
    const range = mounted.container.querySelector("[data-test-slider]");
    const stage = mounted.container.querySelector("[data-test-stage]");
    const bar = () => barOf(mounted.container);
    const { clock, restoreTimers } = beginClock(60_000);
    try {
    await act(async () => {
      tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 1 });
    });
    assert.ok(bar().hasAttribute("data-edit-bar-armed"));
    clock.now += 40;
    await act(async () => {
      pointerDown(stage, { clock, pointerId: 9, clientX: 20, clientY: 400 });
    });
    assert.equal(bar().hasAttribute("data-edit-bar-armed"), false, "条外按下必须清掉武装");

    await act(async () => {
      tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 1 });
    });
    const before = translateOf(bar());
    await holdDrag(range, clock, {
      pointerId: 4,
      pointerType: "mouse",
      from: { x: 240, y: 70 },
      to: { x: 300, y: 70 },
      afterMs: 80,
    });
    assert.ok(Math.abs(translateOf(bar()).x - before.x) >= 40, "条上任意位置第二下都应可拖动");
    clock.now += 16;
    await act(async () => {
      pointerUp(range, { clock, pointerId: 4, clientX: 300, clientY: 70 });
    });

    resetHint();
    clock.now += 40;
    await act(async () => {
      pointerDown(stage, { clock, pointerId: 8, clientX: 20, clientY: 400 });
    });
    await act(async () => {
      const first = pointerDown(anywhere, { clock, pointerId: 5, clientX: 400, clientY: 70 });
      clock.now += 40;
      pointerMove(anywhere, {
        clock,
        pointerId: first.pointerId,
        clientX: 480,
        clientY: 70,
      });
    });
    const hint = mounted.container.querySelector("[data-edit-bar-rearm-hint][role='status']");
    assert.ok(hint, "没先点就按住拖必须出提示");
    assert.match(hint.textContent, /先点一下，再按住就能拖动/);
    clock.now += 40;
    await act(async () => {
      pointerUp(anywhere, { clock, pointerId: 5, clientX: 480, clientY: 70 });
    });
    await act(async () => {
      const again = pointerDown(anywhere, { clock, pointerId: 6, clientX: 400, clientY: 70 });
      clock.now += 40;
      pointerMove(anywhere, {
        clock,
        pointerId: again.pointerId,
        clientX: 480,
        clientY: 70,
      });
    });
    assert.equal(
      mounted.container.querySelectorAll("[data-edit-bar-rearm-hint]").length,
      1,
      "同一页会话提示只出一次",
    );
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("全程跟随：15 步累计指针位移 150px，编辑条位置误差不超过 4px", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  resetHint();
  const restore = installRectStub();
  const mounted = await mountFrame("deck");
  try {
    const anywhere = mounted.container.querySelector("[data-test-edit-bar]");
    const bar = () => barOf(mounted.container);
    const { clock, restoreTimers } = beginClock(70_000);
    try {
      await act(async () => {
        tap(anywhere, { clock, clientX: 400, clientY: 70, pointerId: 1 });
      });
      const before = translateOf(bar());
      await act(async () => {
        clock.now += 16;
        pointerDown(anywhere, { clock, pointerId: 1, clientX: 400, clientY: 70 });
        for (let i = 1; i <= 15; i += 1) {
          clock.now += 16;
          pointerMove(anywhere, {
            clock,
            pointerId: 1,
            clientX: 400 + i * 10,
            clientY: 70,
          });
        }
      });
      const after = translateOf(bar());
      assert.ok(before && after, "必须量得到拖动前后位置");
      assert.ok(Math.abs((after.x - before.x) - 150) <= 4, `全程应跟随 150px，实际 ${after.x - before.x}`);
      await act(async () => {
        pointerUp(anywhere, { clock, pointerId: 1, clientX: 550, clientY: 70 });
      });
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});

test("收起的圆：按住就能拖，点一下展开", async () => {
  window.localStorage.clear();
  resetPointerCaptureShim();
  const restore = installRectStub();
  const mounted = await mountFrame("game");
  try {
    const bar = () => barOf(mounted.container);
    await act(async () => {
      bar().dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: ".",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const pill = mounted.container.querySelector("[data-edit-bar-collapsed-pill]");
    assert.ok(pill, "Ctrl+. 应收成圆");
    const { clock, restoreTimers } = beginClock(70_000);
    try {
    const parked = translateOf(bar());
    await act(async () => {
      const down = pointerDown(pill, { clock, pointerId: 8, clientX: 200, clientY: 200 });
      clock.now += 16;
      pointerMove(pill, {
        clock,
        pointerId: down.pointerId,
        clientX: 320,
        clientY: 260,
      });
    });
    const dragged = translateOf(bar());
    assert.ok(dragged && (dragged.x !== parked.x || dragged.y !== parked.y), "圆按住应能拖");
    clock.now += 16;
    await act(async () => {
      pointerUp(pill, { clock, pointerId: 8, clientX: 320, clientY: 260 });
    });
    assert.ok(mounted.container.querySelector("[data-edit-bar-collapsed-pill]"), "拖过圆不得展开");
    await act(async () => {
      mounted.container.querySelector("[data-edit-bar-collapsed-pill]").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    assert.ok(mounted.container.querySelector("[data-test-edit-bar]"), "点圆应展开");
    } finally {
      restoreTimers();
    }
  } finally {
    await mounted.unmount();
    restore();
  }
});
