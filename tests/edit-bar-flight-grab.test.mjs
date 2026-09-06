/**
 * 编辑栏「飞行途中被抓住」的行为闸（W31 · P1）。
 *
 * 管的是一件用户做得到、而此前没有任何断言在管的事：**把编辑栏甩出去，趁它
 * 还在飞的时候一把抓住它。** `V1` 实测这一抓会让条先往回跳 57px 再跟手
 * （`verdicts/V1-verdict.md` A2），根因是 `startDrag` 调 `releasePositionSpring()`
 * 把视觉态拉回逻辑态——而那段注释写的恰好是「不会从某个中间帧跳一下」。
 *
 * `motion-system.md` §Proof and acceptance 第 2 条把这件事定为
 * **候选 B 相对候选 A 存在的全部理由**：「松手后再次抓起并反向拖动时，
 * `linear()` 版本出现 ≥ 1 帧的位置跳变，spring 版本速度连续」。
 * 所以这一条不是锦上添花，它是那个技术选型的验收项本身。
 *
 * ⚠️ 每条断言前都有一个**正对照**：先证明这一刻真的有过冲（视觉态确实离开了
 * 逻辑态），否则「没跳变」会在弹簧根本没飞的情况下白白变绿——那正是本波
 * 反复出现的假绿形态。
 *
 * harness 的形状照抄 `tests/edit-bar-motion.test.mjs`（假 rAF + rect 替身），
 * 理由同那份：既有的 `edit-bar-dock-console.test.mjs` 从不推进 rAF 帧，
 * 看到的永远是弹簧的第 0 帧，飞行途中的事它结构上看不见。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const FRAME_MS = 1000 / 60;
const EXPANDED_WIDTH = 300;

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

function FlightHarness({ storageKey }) {
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

/**
 * 舞台故意开到 2000 宽：默认停放现在是画布水平居中（X2，规范 v2 §4），
 * 从居中点往右甩 200px 再加惯性，1000 宽的舞台会撞上右边界的夹取——
 * 那时逻辑态被夹在边界、视觉态过冲在边界外，「抓取当帧跳回逻辑态」就成了
 * 边界夹取的副作用，测的不再是这条用例要测的飞行途中抓取。
 */
const STAGE_WIDTH = 2000;

function installRectStub() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  // 可见边界还会与 window.innerWidth 相交（readVisibleBounds），视口也要一起开宽。
  const originalInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: STAGE_WIDTH,
  });
  window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
    if (this.hasAttribute("data-edit-bar-test-root")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: STAGE_WIDTH, bottom: 600,
        width: STAGE_WIDTH, height: 600, toJSON() {},
      };
    }
    if (this.hasAttribute("data-edit-bar-test-stage")) {
      return {
        x: 0, y: 110, left: 0, top: 110, right: STAGE_WIDTH, bottom: 600,
        width: STAGE_WIDTH, height: 490, toJSON() {},
      };
    }
    if (this.hasAttribute("data-workspace-edit-bar-toolbar")) {
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
        x: 0, y: 0, left: 0, top: 0, right: STAGE_WIDTH, bottom: 600,
        width: STAGE_WIDTH, height: 600, toJSON() {},
      };
    }
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
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

function translateXOf(element) {
  const match = /translate3d\(([-\d.]+)px/.exec(element?.style.transform || "");
  return match ? Number(match[1]) : null;
}

/**
 * 把收起圆往右甩出去，停在**飞行途中**。
 *
 * 返回抓取前那一刻的三个读数：视觉 x、逻辑（已落盘的）x、以及圆本身。
 * 收起态而不是展开态：圆的拖拽是经典的按住即拖，在这份 harness 里最好驱动，
 * 与 `edit-bar-motion.test.mjs:443` 的惯性用例同一条路径。
 */
async function flingAndFreezeMidFlight(container, frames, storageKey) {
  await collapseBar(container);
  await frames.run(600);
  const pill = container.querySelector("[data-edit-bar-collapsed-pill]");
  assert.ok(pill, "收起圆没出现，后面的甩动无从谈起");

  await pointer(pill, "pointerdown", {
    pointerId: 7, pointerType: "mouse", button: 0,
    clientX: 200, clientY: 200, timeStamp: 1000,
  });
  // 等间距的快速移动 = 一个稳定的大速度，松手后弹簧会明显过冲。
  for (let step = 1; step <= 5; step += 1) {
    await pointer(pill, "pointermove", {
      pointerId: 7, pointerType: "mouse",
      clientX: 200 + step * 40, clientY: 200,
      timeStamp: 1000 + step * 10,
    });
  }
  await pointer(pill, "pointerup", {
    pointerId: 7, pointerType: "mouse",
    clientX: 400, clientY: 200, timeStamp: 1060,
  });

  const parked = JSON.parse(
    window.localStorage.getItem(storageKey),
  ).collapsedPosition;
  assert.ok(parked, "松手时逻辑态必须已经落盘");

  // 飞到过冲最明显的那几帧上停住。
  const bar = () => container.querySelector("[data-workspace-edit-bar-toolbar]");
  for (let i = 0; i < 3 && frames.pending; i += 1) await frames.advance();

  return {
    pill: container.querySelector("[data-edit-bar-collapsed-pill]"),
    bar,
    visualX: translateXOf(bar()),
    logicalX: parked.x,
  };
}

test("飞行途中抓住编辑栏：抓取那一帧的位移必须连续，不许跳回逻辑态", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar-flight-grab:continuity";
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(FlightHarness, { storageKey });
  const container = mounted.container;
  try {
    const flight = await flingAndFreezeMidFlight(container, frames, storageKey);

    // 正对照①：这一刻弹簧确实还在飞。没有这条，下面的「没跳变」可能只是
    // 因为压根没动过。
    assert.equal(
      frames.pending,
      true,
      "弹簧此刻应当还在飞，否则这条用例测的不是「飞行途中」",
    );
    // 正对照②：视觉态确实已经离开逻辑态（这就是 V1 实测的那 57px 过冲）。
    // 没有这条，「视觉 == 逻辑」会让断言在零过冲时白白变绿。
    const overshoot = Math.abs(flight.visualX - flight.logicalX);
    assert.ok(
      overshoot > 8,
      `此刻过冲只有 ${overshoot}px，视觉态几乎没离开逻辑态，` +
        `这条用例无法证明任何事（视觉 ${flight.visualX} / 逻辑 ${flight.logicalX}）`,
    );

    // 真正的判据：抓住它的那一刻，屏幕上的位移必须连续。
    await pointer(flight.pill, "pointerdown", {
      pointerId: 8, pointerType: "mouse", button: 0,
      clientX: 600, clientY: 200, timeStamp: 2000,
    });
    const grabbedX = translateXOf(flight.bar());

    assert.ok(
      Math.abs(grabbedX - flight.visualX) < 0.5,
      `抓取当帧跳变 ${(grabbedX - flight.visualX).toFixed(1)}px：` +
        `抓之前在 ${flight.visualX}，一抓就变成 ${grabbedX}` +
        `（逻辑态是 ${flight.logicalX}——跳回逻辑态正是 V1 报的那条罪）。` +
        `新手势必须把弹簧的**视觉**位置收编为起点，而不是把视觉拉回逻辑。`,
    );
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});

test("抓住之后反向拖拽从抓取点起算：跟手，且不带进过冲那段欠账", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar-flight-grab:reverse";
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(FlightHarness, { storageKey });
  const container = mounted.container;
  try {
    const flight = await flingAndFreezeMidFlight(container, frames, storageKey);
    assert.ok(
      Math.abs(flight.visualX - flight.logicalX) > 8,
      "正对照：抓取前必须真的有过冲，否则本条无法区分「从视觉起算」和「从逻辑起算」",
    );

    await pointer(flight.pill, "pointerdown", {
      pointerId: 8, pointerType: "mouse", button: 0,
      clientX: 600, clientY: 200, timeStamp: 2000,
    });
    const grabbedX = translateXOf(flight.bar());

    // 反向拖 120px：条应当停在 `抓取前它所在的位置 - 120`，而不是 `逻辑态 - 120`。
    //
    // 这一条与上一条**不是同一个断言**：上一条管抓取那一帧画出来的值，这一条管
    // 后续每一次 move 用的**手势原点**（`drag.originPosition`）。只修好第一帧、
    // 却仍拿逻辑态当原点的实现，会在这里当场红。
    const positions = [];
    for (let step = 1; step <= 3; step += 1) {
      await pointer(flight.pill, "pointermove", {
        pointerId: 8, pointerType: "mouse",
        clientX: 600 - step * 40, clientY: 200,
        timeStamp: 2000 + step * 10,
      });
      positions.push(translateXOf(flight.bar()));
    }

    const expected = flight.visualX - 120;
    const actual = positions[positions.length - 1];
    assert.ok(
      Math.abs(actual - expected) < 0.5,
      `反向拖 120px 之后应当在 ${expected.toFixed(1)}，实际在 ${actual}：` +
        `手势的原点不是抓住它时它所在的位置` +
        `（抓取前视觉 ${flight.visualX}、抓取当帧 ${grabbedX}、逻辑态 ${flight.logicalX}）`,
    );
    assert.ok(
      positions[0] > positions[positions.length - 1],
      `反向拖拽没有跟手：${positions.join(" → ")}`,
    );
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});

test("弹簧已收敛时抓取：行为逐字不变（别顺手改了静止态的候选 A 行为）", async () => {
  window.localStorage.clear();
  const storageKey = "test:edit-bar-flight-grab:settled";
  const restoreRect = installRectStub();
  const frames = installFakeFrames();
  const mounted = await createMounted(FlightHarness, { storageKey });
  const container = mounted.container;
  try {
    const flight = await flingAndFreezeMidFlight(container, frames, storageKey);
    // 这一次让它飞完。
    await frames.run(600);
    assert.equal(frames.pending, false, "全部 settled 之后 rAF 必须停");

    const bar = flight.bar;
    const settledTransform = bar().style.transform;
    assert.equal(
      settledTransform,
      `translate3d(${flight.logicalX}px, ${JSON.parse(window.localStorage.getItem(storageKey)).collapsedPosition.y}px, 0)`,
      "收敛之后视觉态必须与逻辑态逐字重合",
    );

    const pill = container.querySelector("[data-edit-bar-collapsed-pill]");
    await pointer(pill, "pointerdown", {
      pointerId: 9, pointerType: "mouse", button: 0,
      clientX: 500, clientY: 300, timeStamp: 3000,
    });

    assert.equal(
      bar().style.transform,
      settledTransform,
      "静止态被抓住时 transform 必须逐字不变——这条守的是「别顺手把候选 A 的行为一起改了」",
    );
  } finally {
    await mounted.unmount();
    frames.restore();
    restoreRect();
  }
});
