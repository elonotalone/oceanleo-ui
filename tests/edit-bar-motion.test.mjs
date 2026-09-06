/**
 * 编辑栏动效的行为闸。前两道机检管的是「弹簧接在对的地方、只写对的属性」，
 * 这一道管的是**它真的动了**。
 *
 * ⚠️ 为什么既有的 `edit-bar-dock-console.test.mjs` 不受动效影响，而这里必须
 * 自己推帧：那份测试从不推进 rAF 帧，看到的永远是弹簧的第 0 帧。
 * 所以本文件装一个假 rAF（照抄 `motion-spring-math.test.mjs` 的
 * `installFakeFrames`），显式推帧——不推帧的话，这里测的就是「什么都没动」，
 * 而那正是本份活要消灭的状态。
 *
 * harness 的形状照抄 `edit-bar-dock-console.test.mjs`：`compileModule` 打桩 +
 * `getBoundingClientRect` 替身。不同的是这里不要 dock，只要浮动态，
 * 因为要测的是形变与惯性，不是停靠。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const FRAME_MS = 1000 / 60;
/** 展开态胶囊的宽度，与下面的 rect 替身一致。 */
const EXPANDED_WIDTH = 300;
/** `EDIT_BAR_COLLAPSED_SIZE_PX`，收起圆直径。 */
const COLLAPSED_SIZE = 48;

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

/**
 * 假 rAF。装在 `globalThis` 上：`spring.ts` 刻意每次现取
 * `globalThis.requestAnimationFrame`（不在模块加载时捕获），所以这里换得掉。
 * React 的调度器走 MessageChannel，不受影响。
 */
function installFakeFrames() {
  const previous = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  let pending = null;
  let nextHandle = 1;
  let clock = 0;

  globalThis.requestAnimationFrame = (callback) => {
    pending = { handle: nextHandle++, callback };
    return pending.handle;
  };
  globalThis.cancelAnimationFrame = (handle) => {
    if (pending && pending.handle === handle) pending = null;
  };

  return {
    get pending() {
      return pending !== null;
    },
    async advance(stepMs = FRAME_MS) {
      clock += stepMs;
      const frame = pending;
      pending = null;
      // 弹簧的 onChange 会 setState（形变结束时），所以推帧要在 act 里。
      await act(async () => {
        frame?.callback(clock);
      });
    },
    async run(maxFrames, stepMs = FRAME_MS) {
      let frames = 0;
      while (pending && frames < maxFrames) {
        await this.advance(stepMs);
        frames += 1;
      }
      return frames;
    },
    restore() {
      globalThis.requestAnimationFrame = previous.request;
      globalThis.cancelAnimationFrame = previous.cancel;
    },
  };
}

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
    return { "--awb-accent": accent };
  }
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
const floatingUrl = await compileModule("src/shell/FloatingContextToolbar.tsx", {
  "react-dom": reactDomUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./advanced-workbench-chrome": chromeStubUrl,
  "./edit-bar-dock-controller": controllerUrl,
  "./EditBarDockControls": controlsUrl,
  "./edit-bar-dock-state": stateUrl,
});
const { FloatingContextToolbar, useFloatingContextToolbar } =
  await import(floatingUrl);

void jsxRuntimeUrl;

function MotionHarness({ storageKey }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: rootRef,
    stageRef,
    resetKey: storageKey,
    storageKey,
  });
  return React.createElement(
    "div",
    { ref: rootRef, "data-edit-bar-test-root": true },
    React.createElement("div", {
      ref: stageRef,
      "data-edit-bar-test-stage": true,
    }),
    React.createElement(
      FloatingContextToolbar,
      { controller, accent: "#6d5dfc" },
      React.createElement(
        "div",
        { "data-edit-bar-test-content": true },
        React.createElement("span", null, "selection controls"),
        controller.trailing,
      ),
    ),
  );
}

function installRectStub() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
        width: 1000, height: 600, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 0, y: 110, left: 0, top: 110, right: 1000, bottom: 600,
        width: 1000, height: 490, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
      // 与既有 harness 同一套：从自己的 transform 反解位置，
      // 这样「位置有没有动」才看得见。
      const transform = this.style.transform || "";
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(transform);
      const left = match ? Number(match[1]) : 100;
      const top = match ? Number(match[2]) : 46;
      return {
        x: left, y: top, left, top,
        right: left + EXPANDED_WIDTH, bottom: top + 52,
        width: EXPANDED_WIDTH, height: 52, toJSON() {},
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
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  };
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

async function pointer(target, type, values) {
  await act(async () => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(event, name, { configurable: true, value });
    }
    target.dispatchEvent(event);
  });
}

/** `scale(a, b)` → a。没有 scale 就给 null。 */
function scaleXOf(element) {
  const match = /scale\(([-\d.]+)/.exec(element?.style.transform || "");
  return match ? Number(match[1]) : null;
}

function translateXOf(element) {
  const match = /translate3d\(([-\d.]+)px/.exec(element?.style.transform || "");
  return match ? Number(match[1]) : null;
}

/**
 * 形变中间帧的**有效宽度**。live 层缩放到 `scaleX × to.width`，
 * ghost 层缩放到 `scaleX × from.width`，两者算出来的是同一个视觉盒——
 * 这也顺带证明了两层确实叠在一起，而不是各缩各的。
 */
function effectiveWidth(container, fromWidth, toWidth) {
  const live = container.querySelector("[data-edit-bar-morph-live]");
  const ghost = container.querySelector("[data-edit-bar-morph-ghost]");
  const liveScale = scaleXOf(live);
  const ghostScale = scaleXOf(ghost);
  if (liveScale === null || ghostScale === null) return null;
  const fromLive = liveScale * toWidth;
  const fromGhost = ghostScale * fromWidth;
  assert.ok(
    Math.abs(fromLive - fromGhost) < 0.5,
    `两层没有叠在同一个视觉盒上：live 算出 ${fromLive}，ghost 算出 ${fromGhost}`,
  );
  return fromLive;
}

test("收缩是连续形变：中间帧的宽度既不是展开态也不是 48", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(MotionHarness, {
    storageKey: "test:edit-bar-motion:collapse",
  });
  const container = mounted.container;
  try {
    // 起步：展开态，没有 ghost，内容层不带任何 transform 覆盖。
    assert.equal(
      container.querySelector("[data-edit-bar-morph-ghost]"),
      null,
      "静止时不该有 ghost 层",
    );

    await collapseBar(container);

    // 逻辑态**立刻**落定，不等动画：收起圆当场在，落盘也当场写。
    assert.ok(
      container.querySelector("[data-edit-bar-collapsed-pill]"),
      "收起后内容层应当立刻换成圆（逻辑态不等动画）",
    );
    assert.ok(
      container.querySelector("[data-edit-bar-morph-ghost]"),
      "形变期必须有一层画着胶囊的 ghost 在淡出",
    );

    const widths = [];
    for (let i = 0; i < 6 && frames.pending; i += 1) {
      await frames.advance();
      const width = effectiveWidth(container, EXPANDED_WIDTH, COLLAPSED_SIZE);
      if (width !== null) widths.push(width);
    }

    assert.ok(
      widths.length >= 3,
      `收缩至少要有 3 个中间帧，实际只有 ${widths.length} 个：形变没跑起来`,
    );
    for (const width of widths) {
      assert.ok(
        width < EXPANDED_WIDTH - 1 && width > COLLAPSED_SIZE + 1,
        `中间帧宽度 ${width} 落在了端点上，说明是瞬间切换而不是形变`,
      );
    }
    // 单调收缩：形变不该来回抖。
    assert.ok(
      widths[widths.length - 1] < widths[0],
      `宽度没有在收缩：${widths.join(" → ")}`,
    );

    // 收敛之后 ghost 必须消失，内容层的覆盖也要抹干净——
    // 留着一个 scale(1) 会让后续的真实布局永远差一层变换。
    await frames.run(600);
    assert.equal(
      container.querySelector("[data-edit-bar-morph-ghost]"),
      null,
      "形变结束后 ghost 必须卸载",
    );
    assert.equal(
      container.querySelector("[data-edit-bar-morph-live]").style.transform,
      "",
      "形变结束后内容层不该留下 transform",
    );
    assert.equal(frames.pending, false, "全部 settled 之后 rAF 必须停");
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});

test("展开是连续形变，且真圆当场卸载（淡出的只能是 ghost）", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(MotionHarness, {
    storageKey: "test:edit-bar-motion:expand",
  });
  const container = mounted.container;
  try {
    await collapseBar(container);
    await frames.run(600);
    const pill = container.querySelector("[data-edit-bar-collapsed-pill]");
    assert.ok(pill, "收起后应当有圆");

    await click(pill);

    // 既有断言（`edit-bar-dock-console.test.mjs`）要求点圆之后它当场为 null。
    // 所以能留下来淡出的只能是那层惰性 ghost，不能是真圆。
    assert.equal(
      container.querySelector("[data-edit-bar-collapsed-pill]"),
      null,
      "展开时真圆必须立刻卸载",
    );
    const ghost = container.querySelector("[data-edit-bar-morph-ghost]");
    assert.ok(ghost, "展开时应当留下一层画着圆的 ghost 在淡出");
    assert.equal(
      ghost.getAttribute("aria-hidden"),
      "true",
      "ghost 是纯装饰，必须对辅助技术隐藏",
    );

    const widths = [];
    for (let i = 0; i < 6 && frames.pending; i += 1) {
      await frames.advance();
      const width = effectiveWidth(container, COLLAPSED_SIZE, EXPANDED_WIDTH);
      if (width !== null) widths.push(width);
    }
    assert.ok(
      widths.length >= 3,
      `展开至少要有 3 个中间帧，实际只有 ${widths.length} 个`,
    );
    for (const width of widths) {
      assert.ok(
        width > COLLAPSED_SIZE + 1 && width < EXPANDED_WIDTH - 1,
        `中间帧宽度 ${width} 落在端点上，说明展开还是瞬间切换`,
      );
    }
    assert.ok(
      widths[widths.length - 1] > widths[0],
      `宽度没有在展开：${widths.join(" → ")}`,
    );
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});

test("松手之后位置继续变化若干帧，且逻辑态早已落定", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(MotionHarness, {
    storageKey: "test:edit-bar-motion:inertia",
  });
  const container = mounted.container;
  const bar = () =>
    container.querySelector("[data-workspace-edit-bar-toolbar]");
  try {
    // 收起成圆再拖它：圆的拖拽是经典的按住即拖，比移动模式好在这份 harness 里驱动。
    await collapseBar(container);
    await frames.run(600);
    const pill = container.querySelector("[data-edit-bar-collapsed-pill]");
    assert.ok(pill);

    await pointer(pill, "pointerdown", {
      pointerId: 7, pointerType: "mouse", button: 0,
      clientX: 200, clientY: 200, timeStamp: 1000,
    });
    // 一串等间距的移动 = 一个稳定的速度，松手时弹簧就该带着它往前冲。
    for (let step = 1; step <= 5; step += 1) {
      await pointer(pill, "pointermove", {
        pointerId: 7, pointerType: "mouse",
        clientX: 200 + step * 40, clientY: 200,
        timeStamp: 1000 + step * 10,
      });
    }

    // 拖拽期间视觉态必须**实时**跟住指针，不许有弹簧的延迟。
    const draggingX = translateXOf(bar());
    assert.ok(
      draggingX !== null && draggingX > 300,
      `拖拽中条没有跟住指针，translateX=${draggingX}`,
    );

    await pointer(pill, "pointerup", {
      pointerId: 7, pointerType: "mouse",
      clientX: 400, clientY: 200, timeStamp: 1060,
    });

    // 逻辑态不等动画：落盘在松手的那一刻就写好了。
    const parked = JSON.parse(
      window.localStorage.getItem("test:edit-bar-motion:inertia"),
    ).collapsedPosition;
    assert.ok(parked, "松手时收起位置必须已经落盘，不等动画");

    // 视觉态才是弹簧的活：松手后还要继续动若干帧。
    const positions = [];
    for (let i = 0; i < 8 && frames.pending; i += 1) {
      await frames.advance();
      positions.push(translateXOf(bar()));
    }
    assert.ok(
      positions.length >= 4,
      `松手后只跑了 ${positions.length} 帧，弹簧没有接上`,
    );
    const distinct = new Set(positions);
    assert.ok(
      distinct.size >= 3,
      `松手后位置没有继续变化（${positions.join(" → ")}），仍是瞬时赋值`,
    );

    // 收敛之后视觉态与逻辑态重合，且 rAF 停掉。
    await frames.run(600);
    assert.equal(frames.pending, false, "全部 settled 之后 rAF 必须停");
    assert.equal(
      bar().style.transform,
      `translate3d(${parked.x}px, ${parked.y}px, 0)`,
      "收敛之后视觉态必须与逻辑态逐字重合",
    );
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});

test("__leoMotionJumpAllToRest 能把编辑栏的动效当场按停（W10 的视觉回归闸依赖它）", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(MotionHarness, {
    storageKey: "test:edit-bar-motion:jump",
  });
  const container = mounted.container;
  try {
    assert.equal(
      typeof window.__leoMotionJumpAllToRest,
      "function",
      "钩子必须挂在 window 上，缺了它 W10 那道闸建不起来",
    );

    await collapseBar(container);
    assert.ok(frames.pending, "形变应当已经排上了一帧");

    await act(async () => window.__leoMotionJumpAllToRest());

    assert.equal(
      container.querySelector("[data-edit-bar-morph-ghost]"),
      null,
      "按停之后 ghost 应当已经卸载，截图里不该还留着半透明的旧形态",
    );
    assert.equal(frames.pending, false, "按停之后不该再有排队的帧");
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});
