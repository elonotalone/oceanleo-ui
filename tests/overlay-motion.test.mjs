// ============================================================================
// 弹层进出场（W03 / motion-system.md §规范三）
// ----------------------------------------------------------------------------
// 锁三件事，每一件都对应一条「把它改回去就当场红」：
//   1. 进出场用平台原生能力（`@starting-style` + `transition-behavior:
//      allow-discrete`），时长曲线只从 `--leo-` token 取、**不写 fallback 裸值**；
//   2. 动效有来源：`transform-origin` 由已有的锚点几何推导，弹层从触发它的那个
//      按钮长出来，不是从中间淡入；
//   3. 退场期间元素**仍在 DOM 里**，收尾由 `transitionend` 驱动（按属性报到防抖）
//      并有从实测时长推导的超时兜底；reduced-motion 下时长归零但仍正确收尾。
// ============================================================================
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef, useState } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

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
  url: "https://word.oceanleo.com/",
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
  getComputedStyle: window.getComputedStyle.bind(window),
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

const visualViewport = new window.EventTarget();
Object.assign(visualViewport, {
  width: 1_024,
  height: 768,
  offsetLeft: 0,
  offsetTop: 0,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: visualViewport,
});
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_024 });
Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });

class OverlayResizeObserver {
  static instances = new Set();

  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    OverlayResizeObserver.instances.add(this);
  }

  observe(target) {
    this.targets.add(target);
  }

  disconnect() {
    this.targets.clear();
    OverlayResizeObserver.instances.delete(this);
  }

  static flush() {
    for (const observer of OverlayResizeObserver.instances) {
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
globalThis.ResizeObserver = OverlayResizeObserver;
window.ResizeObserver = OverlayResizeObserver;

// 锚点在右下角：横向要 clamp、纵向要 flip 到 above，两条几何一次都过一遍。
let anchorRect = {
  x: 980,
  y: 700,
  left: 980,
  top: 700,
  right: 1_020,
  bottom: 740,
  width: 40,
  height: 40,
  toJSON() {
    return this;
  },
};
const panelSize = { width: 240, height: 120 };
const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
  if (this.hasAttribute("data-popover-anchor")) return anchorRect;
  if (this.hasAttribute("data-anchored-popover")) {
    const left = Number.parseFloat(this.style.left || "0");
    const top = Number.parseFloat(this.style.top || "0");
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + panelSize.width,
      bottom: top + panelSize.height,
      width: panelSize.width,
      height: panelSize.height,
      toJSON() {
        return this;
      },
    };
  }
  return originalRect.call(this);
};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

const popoverUrl = await compileModule("src/shell/anchored-popover.tsx", {
  react: reactUrl,
  "react-dom": reactDomUrl,
});
const {
  AnchoredPopover,
  LEO_OVERLAY_MOTION_CSS,
  computeAnchoredPopoverTransformOrigin,
  ensureOverlayMotionStyles,
  overlayTransitionBudgetMs,
  parseCssTimeMs,
  runAfterOverlayExit,
} = await import(popoverUrl);

async function createMounted(Component) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function frame() {
  await act(
    () =>
      new Promise((resolveFrame) => window.requestAnimationFrame(resolveFrame)),
  );
}

/** 造一个能被 `overlayTransitionBudgetMs` 读出确定时长的替身元素。 */
function fakeTransitioningElement({
  duration = "200ms, 200ms",
  delay = "0s",
  property = "opacity, transform",
} = {}) {
  const listeners = new Map();
  const element = {
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          transitionDuration: duration,
          transitionDelay: delay,
          transitionProperty: property,
        }),
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, propertyName) {
      for (const handler of [...(listeners.get(type) ?? [])]) {
        handler({ target: element, propertyName });
      }
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return element;
}

/* ---------------------------- ① 原生能力与 token ---------------------------- */

test("进出场词汇用原生能力表达，且只认 --leo- token", () => {
  // `@starting-style` 是入场的全部机制：没有它，元素一出现就是终态，没有进场。
  assert.match(LEO_OVERLAY_MOTION_CSS, /@starting-style/);
  // `display` / `overlay` 的离散过渡是「退场期间元素还在」的全部机制。
  assert.match(LEO_OVERLAY_MOTION_CSS, /display var\(--leo-dur-\d\) allow-discrete/);
  assert.match(LEO_OVERLAY_MOTION_CSS, /overlay var\(--leo-dur-\d\) allow-discrete/);

  // 层级：弹层与遮罩淡出同档，对话框面板高一档（§规范一「跨层差一档」）。
  assert.match(
    LEO_OVERLAY_MOTION_CSS,
    /\.leo-overlay \{[^}]*opacity var\(--leo-dur-3\)/,
  );
  assert.match(
    LEO_OVERLAY_MOTION_CSS,
    /\.leo-overlay-panel \{[^}]*opacity var\(--leo-dur-4\)/,
  );

  // 红线 9 + 裁定 A-2：token 一律裸引，**不许带 fallback**——带了就会在 token
  // 落地后静默保留两套真相。
  assert.doesNotMatch(LEO_OVERLAY_MOTION_CSS, /var\(--leo-[a-z0-9-]+\s*,/);
  // 也不许有任何裸时长与裸曲线。
  assert.doesNotMatch(LEO_OVERLAY_MOTION_CSS, /\d\s*m?s\b/);
  assert.doesNotMatch(LEO_OVERLAY_MOTION_CSS, /cubic-bezier|linear\(/);
});

test("引用的每个 token 都真的在 globals.css 的生成区里", async () => {
  const globals = await readFile(
    new URL("../src/theme/globals.css", import.meta.url),
    "utf8",
  );
  const referenced = [
    ...new Set(
      [...LEO_OVERLAY_MOTION_CSS.matchAll(/var\((--leo-[a-z0-9-]+)\)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  // 探针：先用一个确定存在的名字验一次断言本身（_COMMON.md §6 零命中纪律）。
  assert.ok(referenced.length >= 4, "至少引用了四个 token");
  assert.ok(globals.includes("--leo-dur-3:"), "对照探针：globals.css 里有 --leo-dur-3");
  for (const token of referenced) {
    assert.ok(
      globals.includes(`${token}:`),
      `${token} 必须由 W01 的 token 层定义，弹层不自己造`,
    );
  }
});

test("reduced-motion 把弹层用到的两档时长归零", async () => {
  const globals = await readFile(
    new URL("../src/theme/globals.css", import.meta.url),
    "utf8",
  );
  const reduced = globals.slice(
    globals.indexOf("prefers-reduced-motion: reduce"),
  );
  assert.match(reduced, /--leo-dur-3:\s*0ms/);
  assert.match(reduced, /--leo-dur-4:\s*0ms/);
});

test("样式表每份文档只注入一次", () => {
  ensureOverlayMotionStyles(document);
  ensureOverlayMotionStyles(document);
  ensureOverlayMotionStyles(document);
  assert.equal(document.querySelectorAll("#leo-overlay-motion").length, 1);
  assert.match(
    document.getElementById("leo-overlay-motion").textContent,
    /@starting-style/,
  );
});

/* ------------------------------ ② 动效有来源 ------------------------------ */

test("transform-origin 从锚点几何推导：贴着锚点的那条边 + 锚点中心的横坐标", () => {
  // 在下方展开 ⇒ 从面板顶边长出来（y=0）。
  assert.equal(
    computeAnchoredPopoverTransformOrigin(
      { left: 100, width: 40 },
      { left: 80, placement: "below" },
      { width: 240, height: 120 },
    ),
    "40px 0px", // 锚点中心 120 − 面板左边 80 = 40
  );
  // 翻到上方 ⇒ 从面板底边长出来（y=面板高）。
  assert.equal(
    computeAnchoredPopoverTransformOrigin(
      { left: 100, width: 40 },
      { left: 80, placement: "above" },
      { width: 240, height: 120 },
    ),
    "40px 120px",
  );
  // 锚点被 clamp 挤到面板外时，原点收在面板边界上，不会跑到负数或溢出。
  assert.equal(
    computeAnchoredPopoverTransformOrigin(
      { left: 0, width: 20 },
      { left: 400, placement: "below" },
      { width: 240, height: 120 },
    ),
    "0px 0px",
  );
  assert.equal(
    computeAnchoredPopoverTransformOrigin(
      { left: 900, width: 20 },
      { left: 100, placement: "below" },
      { width: 240, height: 120 },
    ),
    "240px 0px",
  );
});

test("渲染出来的 transform-origin 与锚点位置同步，翻面时跟着翻", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("button", {
        ref: anchorRef,
        type: "button",
        "data-popover-anchor": true,
      }),
      React.createElement(
        AnchoredPopover,
        {
          open: true,
          anchorRef,
          onClose() {},
          role: "menu",
          ariaLabel: "Origin",
          align: "end",
          attributes: { "data-origin-under-test": true },
        },
        React.createElement("button", { type: "button" }, "item"),
      ),
    );
  }

  anchorRect = {
    ...anchorRect,
    x: 980,
    y: 700,
    left: 980,
    top: 700,
    right: 1_020,
    bottom: 740,
    width: 40,
  };
  const mounted = await createMounted(Harness);
  try {
    await frame();
    const panel = document.querySelector("[data-origin-under-test]");
    assert.ok(panel);
    // 进场类必须挂上，否则 CSS 里那套词汇一条都不生效。
    assert.ok(panel.classList.contains("leo-overlay"));
    assert.equal(panel.dataset.leoOverlayState, "open");
    // 锚点中心 1000、面板左边 776 ⇒ 224px；翻到上方 ⇒ 底边 120px。
    assert.equal(panel.dataset.anchoredPlacement, "above");
    assert.equal(panel.style.transformOrigin, "224px 120px");

    anchorRect = {
      ...anchorRect,
      x: 20,
      y: 20,
      left: 20,
      top: 20,
      right: 100,
      bottom: 60,
      width: 80,
    };
    await act(async () => {
      OverlayResizeObserver.flush();
    });
    // 锚点中心 60、面板左边 8 ⇒ 52px；在下方 ⇒ 顶边 0px。
    assert.equal(panel.dataset.anchoredPlacement, "below");
    assert.equal(panel.style.transformOrigin, "52px 0px");
  } finally {
    await mounted.unmount();
  }
});

/* --------------------------- ③ 退场期间元素还在 --------------------------- */

test("关闭后元素留在 DOM 里退场，且既接不到 Tab 也接不到读屏", async () => {
  let setOpenOutside;
  function Harness() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(true);
    setOpenOutside = setOpen;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("button", {
        ref: anchorRef,
        type: "button",
        "data-popover-anchor": true,
      }),
      React.createElement(
        AnchoredPopover,
        {
          open,
          anchorRef,
          onClose: () => setOpen(false),
          role: "menu",
          ariaLabel: "Exit",
          attributes: { "data-exit-under-test": true },
        },
        React.createElement("button", { type: "button" }, "item"),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    const panel = document.querySelector("[data-exit-under-test]");
    assert.ok(panel);

    await act(async () => {
      setOpenOutside(false);
    });
    await frame();

    // 这是本条的全部意义：**关掉之后元素还在**，否则退场动画无处播放。
    const stillThere = document.querySelector("[data-exit-under-test]");
    assert.ok(stillThere, "退场期间元素必须仍在 DOM 里");
    assert.equal(stillThere.dataset.leoOverlayState, "closed");
    assert.equal(stillThere.hasAttribute("hidden"), true);
    assert.equal(stillThere.getAttribute("aria-hidden"), "true");
    assert.equal(stillThere.hasAttribute("inert"), true);
  } finally {
    await mounted.unmount();
  }
});

test("每次重新打开都把 children 重挂一次，上一次的半成品状态不会漏出来", async () => {
  let setOpenOutside;
  let mountCount = 0;
  function Body() {
    const [touched, setTouched] = useState(false);
    React.useEffect(() => {
      mountCount += 1;
    }, []);
    return React.createElement(
      "button",
      {
        type: "button",
        "data-body-state": touched ? "touched" : "fresh",
        onClick: () => setTouched(true),
      },
      "body",
    );
  }
  function Harness() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(true);
    setOpenOutside = setOpen;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("button", {
        ref: anchorRef,
        type: "button",
        "data-popover-anchor": true,
      }),
      React.createElement(
        AnchoredPopover,
        {
          open,
          anchorRef,
          onClose: () => setOpen(false),
          role: "menu",
          ariaLabel: "Remount",
        },
        React.createElement(Body),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    assert.equal(mountCount, 1);
    const body = document.querySelector("[data-body-state]");
    await act(async () => {
      body.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(
      document.querySelector("[data-body-state]").dataset.bodyState,
      "touched",
    );

    await act(async () => setOpenOutside(false));
    await frame();
    // 退场期间旧 children 还挂着（动画要有东西可播）。
    assert.equal(mountCount, 1);
    assert.equal(
      document.querySelector("[data-body-state]").dataset.bodyState,
      "touched",
    );

    await act(async () => setOpenOutside(true));
    await frame();
    assert.equal(mountCount, 2, "重新打开必须重挂 children");
    assert.equal(
      document.querySelector("[data-body-state]").dataset.bodyState,
      "fresh",
      "上一次开着时点过的状态不许漏到下一次",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ----------------------- ③ 退场收尾：防抖与超时兜底 ----------------------- */

test("时长与延迟从计算值读出来，取最长的那条", () => {
  assert.equal(parseCssTimeMs("200ms"), 200);
  assert.equal(parseCssTimeMs("0.28s"), 280);
  assert.equal(parseCssTimeMs(""), 0);
  assert.equal(parseCssTimeMs("auto"), 0);
  assert.equal(
    overlayTransitionBudgetMs(
      fakeTransitioningElement({ duration: "200ms, 280ms", delay: "0s, 40ms" }),
    ),
    320,
  );
  assert.equal(overlayTransitionBudgetMs(null), 0);
});

test("要等全部属性报到才收尾，不被最短的那条提前收走", async () => {
  const element = fakeTransitioningElement({
    duration: "200ms, 280ms",
    property: "opacity, transform",
  });
  let done = 0;
  runAfterOverlayExit(element, () => {
    done += 1;
  });

  element.emit("transitionend", "opacity");
  assert.equal(done, 0, "只有 opacity 报到时不许收尾——transform 还在跑");
  element.emit("transitionend", "transform");
  assert.equal(done, 1);
  // 同一条过渡上重复到达的事件不许把回调打第二遍。
  element.emit("transitionend", "transform");
  element.emit("transitionend", "opacity");
  assert.equal(done, 1);
  assert.equal(element.listenerCount("transitionend"), 0, "收尾后监听要拆掉");
});

test("离散过渡不算收尾信号，`display` 报到不能提前收", () => {
  const element = fakeTransitioningElement({
    duration: "200ms, 200ms, 200ms",
    property: "opacity, display, overlay",
  });
  let done = 0;
  runAfterOverlayExit(element, () => {
    done += 1;
  });
  element.emit("transitionend", "display");
  element.emit("transitionend", "overlay");
  assert.equal(done, 0, "`overlay` 只对顶层元素生效，可能压根不跑");
  element.emit("transitionend", "opacity");
  assert.equal(done, 1);
});

test("transitionend 不来时由超时兜底收尾（元素被 display:none 的情形）", async () => {
  const element = fakeTransitioningElement({
    duration: "40ms",
    property: "opacity",
  });
  let done = 0;
  runAfterOverlayExit(element, () => {
    done += 1;
  });
  assert.equal(done, 0);
  // 兜底是实测时长的 1.5 倍 = 60ms，是比值不是又一个裸时长。
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(done, 1, "兜底必须收尾，否则弹层永远关不掉");
});

test("reduced-motion 下时长为 0，仍然正确收尾", async () => {
  // token 归零后计算值就是 0s，这与 W01 的 reduced-motion 区一致。
  const element = fakeTransitioningElement({
    duration: "0s",
    property: "opacity",
  });
  let done = 0;
  runAfterOverlayExit(element, () => {
    done += 1;
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(done, 1, "零时长不许卡住卸载");
  assert.equal(
    element.listenerCount("transitionend"),
    0,
    "零时长路径不该挂监听",
  );
});

test("取消函数拆掉监听，回调不再来", async () => {
  const element = fakeTransitioningElement();
  let done = 0;
  const cancel = runAfterOverlayExit(element, () => {
    done += 1;
  });
  cancel();
  element.emit("transitionend", "opacity");
  element.emit("transitionend", "transform");
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(done, 0);
});

/* ---------------------- Modal：退场由 CSS 说了算 ---------------------- */

test("Modal 退场等过渡跑完才交还父级卸载，期间面板仍在 DOM 里", async () => {
  const modalUrl = await compileModule("src/ui/index.tsx", {
    react: reactUrl,
    "react-dom": reactDomUrl,
    "../i18n/ui/useUI": `data:text/javascript;base64,${Buffer.from(
      "export const useUI = () => (zh) => zh;",
    ).toString("base64")}`,
  });
  const { Modal } = await import(modalUrl);

  // jsdom 不会把 `var(--leo-dur-4)` 算成真时长，这里替 `getComputedStyle`
  // 把面板那条过渡钉成 280ms，专测「等它跑完」这条行为。
  const realGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element, pseudo) => {
    if (element?.classList?.contains?.("leo-overlay-panel")) {
      return {
        transitionDuration: "280ms, 280ms",
        transitionDelay: "0s",
        transitionProperty: "opacity, transform",
      };
    }
    return realGetComputedStyle(element, pseudo);
  };

  let closed = 0;
  function Harness() {
    return React.createElement(
      Modal,
      { onClose: () => (closed += 1), labelledBy: "t" },
      React.createElement("button", { type: "button", "data-modal-action": true }, "ok"),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    const scrim = document.querySelector(".leo-overlay-scrim");
    const panel = document.querySelector(".leo-overlay-panel");
    assert.ok(scrim && panel);
    assert.equal(scrim.dataset.leoOverlayState, "open");
    assert.equal(panel.dataset.leoOverlayState, "open");
    // 初始聚焦落在面板内第一个可聚焦元素上（原先这条是哑火的）。
    assert.equal(
      document.activeElement?.hasAttribute("data-modal-action"),
      true,
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
    await frame();

    assert.equal(scrim.dataset.leoOverlayState, "closed");
    assert.equal(panel.dataset.leoOverlayState, "closed");
    assert.equal(closed, 0, "过渡还在跑，不许提前把 onClose 打出去");
    assert.ok(
      document.querySelector(".leo-overlay-panel"),
      "退场期间面板必须仍在 DOM 里",
    );

    await act(async () => {
      panel.dispatchEvent(
        new window.Event("transitionend", { bubbles: false }),
      );
    });
    assert.equal(closed, 0, "缺 propertyName 的事件不算报到");

    for (const propertyName of ["opacity", "transform"]) {
      await act(async () => {
        const event = new window.Event("transitionend", { bubbles: false });
        Object.defineProperty(event, "propertyName", { value: propertyName });
        panel.dispatchEvent(event);
      });
    }
    assert.equal(closed, 1, "两条属性都报到之后才收尾");
  } finally {
    window.getComputedStyle = realGetComputedStyle;
    await mounted.unmount();
  }
});

test("Modal 不再用与样式表脱钩的固定 setTimeout 关闭", async () => {
  const source = await readFile(
    new URL("../src/ui/index.tsx", import.meta.url),
    "utf8",
  );
  // 原文是 `setTimeout(onClose, 140)`：那个 140 与 CSS 各写各的。
  assert.doesNotMatch(source, /setTimeout\(\s*onClose/);
  assert.doesNotMatch(source, /setTimeout\([^)]*,\s*\d+\s*\)/);
  assert.match(source, /runAfterOverlayExit/);
});
