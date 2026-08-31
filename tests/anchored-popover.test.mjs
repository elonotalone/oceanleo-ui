import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef, useState } from "react";

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
Object.defineProperty(window, "innerWidth", {
  configurable: true,
  value: 1_024,
});
Object.defineProperty(window, "innerHeight", {
  configurable: true,
  value: 768,
});

class PopoverResizeObserver {
  static instances = new Set();

  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    PopoverResizeObserver.instances.add(this);
  }

  observe(target) {
    this.targets.add(target);
  }

  disconnect() {
    this.targets.clear();
    PopoverResizeObserver.instances.delete(this);
  }

  static flush() {
    for (const observer of PopoverResizeObserver.instances) {
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
globalThis.ResizeObserver = PopoverResizeObserver;
window.ResizeObserver = PopoverResizeObserver;

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
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const popoverUrl = await compileModule("src/shell/anchored-popover.tsx", {
  react: reactUrl,
  "react-dom": reactDomUrl,
});
const { AnchoredPopover, computeAnchoredPopoverPosition } =
  await import(popoverUrl);

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
      new Promise((resolveFrame) =>
        window.requestAnimationFrame(resolveFrame),
      ),
  );
}

/**
 * 关闭之后的正确形状。
 *
 * **这里原先断言的是 `=== null`**，而那在当时是对的：`open` 一转 false，
 * `if (!open || !portalRoot) return null` 就把元素瞬间卸载了。
 * 现在退场交给平台原生能力（`@starting-style` + `transition-behavior:
 * allow-discrete`），而原生退场的前提是元素**还在树上**，
 * 所以判据从「消失了」改成「留在原地，但对键盘、指针、读屏全部失效」。
 *
 * 这不是把断言改弱去迁就实现：原先只锁一件事（不在 DOM 里），
 * 现在锁四件。少任何一条，退场那 200ms 里的弹层就会变成一个
 * 看不见却仍然能被 Tab 走进去、能被读屏念出来的陷阱。
 */
function assertClosedInPlace(panel, label) {
  assert.ok(panel, `${label}：退场期间元素必须留在 DOM 里`);
  assert.equal(
    panel.dataset.leoOverlayState,
    "closed",
    `${label}：状态要翻到 closed，CSS 靠它选中退场那一档`,
  );
  assert.equal(panel.hasAttribute("hidden"), true, `${label}：要挂 hidden`);
  assert.equal(
    panel.getAttribute("aria-hidden"),
    "true",
    `${label}：读屏不许再念到它`,
  );
  assert.equal(
    panel.hasAttribute("inert"),
    true,
    `${label}：不许再接到 Tab 或点击`,
  );
}

/**
 * 打开时的正确形状。存在的意义是**证明上面那四条不是恒真的**——
 * 如果实现把 `hidden` / `inert` / `aria-hidden` 一直挂着，
 * `assertClosedInPlace` 照样会绿，而弹层根本就打不开。
 * 顺带钉住 React 19 的一个真实分歧点：`inert={false}` 不许落成属性。
 */
function assertOpenInPlace(panel, label) {
  assert.ok(panel, `${label}：打开时元素必须在 DOM 里`);
  assert.equal(panel.dataset.leoOverlayState, "open", `${label}：状态要是 open`);
  assert.equal(
    panel.hasAttribute("hidden"),
    false,
    `${label}：打开时不许挂 hidden`,
  );
  assert.equal(
    panel.hasAttribute("inert"),
    false,
    `${label}：打开时不许挂 inert（React 19 的 inert={false} 不该落属性）`,
  );
  assert.equal(
    panel.getAttribute("aria-hidden"),
    null,
    `${label}：打开时不许挂 aria-hidden`,
  );
}

test("geometry clamps horizontally and flips above when below cannot fit", () => {
  assert.deepEqual(
    computeAnchoredPopoverPosition(
      anchorRect,
      panelSize,
      { left: 0, top: 0, width: 1_024, height: 768 },
      { align: "end" },
    ),
    {
      left: 776,
      top: 574,
      maxWidth: 1_008,
      maxHeight: 686,
      placement: "above",
    },
  );
});

test("geometry constrains oversized panels to a narrow visual viewport", () => {
  assert.deepEqual(
    computeAnchoredPopoverPosition(
      {
        left: 120,
        top: 40,
        right: 152,
        bottom: 80,
        width: 32,
        height: 40,
      },
      { width: 352, height: 300 },
      { left: 0, top: 0, width: 160, height: 240 },
      { align: "end", maxHeight: 512 },
    ),
    {
      left: 8,
      top: 86,
      maxWidth: 144,
      maxHeight: 146,
      placement: "below",
    },
  );
});

test("portal follows fullscreen, repositions, and owns escape/outside focus", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          ref: anchorRef,
          type: "button",
          "data-popover-anchor": true,
          onClick: () => setOpen(true),
        },
        "anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open,
          anchorRef,
          onClose: () => setOpen(false),
          role: "dialog",
          ariaLabel: "Anchored tools",
          align: "end",
          attributes: { "data-popover-under-test": true },
        },
        React.createElement(
          "button",
          { type: "button", "data-popover-first-action": true },
          "first",
        ),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    let panel = document.querySelector("[data-popover-under-test]");
    const anchor = mounted.container.querySelector("[data-popover-anchor]");
    assert.ok(panel);
    assert.equal(panel.parentElement, document.body);
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(panel.getAttribute("aria-label"), "Anchored tools");
    assert.equal(panel.dataset.anchoredPlacement, "above");
    assert.equal(panel.style.left, "776px");
    assert.equal(panel.style.top, "574px");
    assert.equal(
      document.activeElement?.hasAttribute("data-popover-first-action"),
      true,
    );

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
      PopoverResizeObserver.flush();
    });
    panel = document.querySelector("[data-popover-under-test]");
    assert.equal(panel.dataset.anchoredPlacement, "below");
    assert.equal(panel.style.left, "8px");
    assert.equal(panel.style.top, "66px");

    const fullscreen = document.createElement("div");
    fullscreen.setAttribute("data-fullscreen-root", "");
    document.body.append(fullscreen);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: fullscreen,
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("fullscreenchange"));
    });
    panel = fullscreen.querySelector("[data-popover-under-test]");
    assert.ok(panel, "open popover moves into the fullscreen root");

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
    assertClosedInPlace(
      fullscreen.querySelector("[data-popover-under-test]"),
      "Escape 关闭",
    );
    assert.equal(document.activeElement, anchor);

    await act(async () => {
      anchor.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await frame();
    // 重新打开必须把三条不可达属性全摘掉，否则弹层只能开一次。
    assertOpenInPlace(
      fullscreen.querySelector("[data-popover-under-test]"),
      "重新打开",
    );
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => {
      outside.dispatchEvent(
        new window.Event("pointerdown", { bubbles: true, cancelable: true }),
      );
    });
    await frame();
    assertClosedInPlace(
      fullscreen.querySelector("[data-popover-under-test]"),
      "外部点击关闭",
    );
    outside.remove();
    fullscreen.remove();
  } finally {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    await mounted.unmount();
  }
});

test("menu and listbox composites move focus with arrow keys", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { ref: anchorRef, type: "button", "data-popover-anchor": true },
        "anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open: true,
          anchorRef,
          onClose() {},
          role: "menu",
          ariaLabel: "Downloads",
        },
        React.createElement(
          "button",
          { type: "button", role: "menuitem", tabIndex: -1 },
          "first",
        ),
        React.createElement(
          "button",
          { type: "button", role: "menuitem", tabIndex: -1 },
          "second",
        ),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.equal(document.activeElement, items[0]);
    await act(async () => {
      items[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(document.activeElement, items[1]);
  } finally {
    await mounted.unmount();
  }
});

test("fallback inspectors expose their controlled id and restore More focus", async () => {
  const inspectorPanelStubUrl = dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function SelectionInspectorPanel() {
      return jsx("div", { "data-inspector-panel-body": true });
    }
  `);
  const inspectorHostUrl = await compileModule(
    "src/shell/selection-inspector-host.tsx",
    {
      react: reactUrl,
      "./anchored-popover": popoverUrl,
      "./SelectionInspectorPanel": inspectorPanelStubUrl,
    },
  );
  const { useSelectionInspectorHost } = await import(inspectorHostUrl);
  const panelId = "selection-inspector-grid-rows";

  function Harness() {
    const toolbarRef = useRef(null);
    const moreRef = useRef(null);
    const host = useSelectionInspectorHost({
      layout: null,
      groups: [
        {
          panelId,
          label: "行操作",
          icon: "add",
          controls: [],
        },
      ],
      context: {
        version: 1,
        kind: "grid-row",
        id: "cell:sheet:1",
        controls: [],
      },
      onCommand() {},
      accent: "#4f46e5",
      anchorRef: toolbarRef,
      overflowTriggerRef: moreRef,
    });
    return React.createElement(
      "div",
      { ref: toolbarRef },
      React.createElement(
        "button",
        { ref: moreRef, type: "button", "data-more-trigger": true },
        "More",
      ),
      React.createElement(
        "div",
        { "data-selection-overflow-control": true },
        React.createElement(
          "button",
          {
            type: "button",
            "data-inspector-trigger": true,
            "aria-controls": panelId,
            onClick: () => host.openPanel(panelId),
          },
          "Rows",
        ),
      ),
      React.createElement(
        "span",
        { "data-active-panel": true },
        host.activePanelId,
      ),
      host.fallbackPanel,
    );
  }

  const mounted = await createMounted(Harness);
  try {
    const trigger = mounted.container.querySelector("[data-inspector-trigger]");
    const more = mounted.container.querySelector("[data-more-trigger]");
    trigger.focus();
    await act(async () => {
      trigger.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await frame();

    const panel = document.getElementById(panelId);
    assert.ok(panel);
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(
      panel.getAttribute("aria-labelledby"),
      panel.querySelector("h2")?.id,
    );
    assert.equal(
      mounted.container.querySelector("[data-active-panel]")?.textContent,
      panelId,
    );

    const close = panel.querySelector('button[aria-label="关闭属性面板"]');
    assert.equal(document.activeElement, close);
    await act(async () => {
      close.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await frame();
    assert.equal(document.getElementById(panelId), null);
    assert.equal(document.activeElement, more);
  } finally {
    await mounted.unmount();
  }
});

test("selection More delegates placement to the portal instead of an in-pane absolute panel", async () => {
  const source = await readFile(
    new URL("../src/shell/SelectionToolbar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<AnchoredPopover/);
  assert.match(source, /anchorRef=\{moreButtonRef\}/);
  assert.doesNotMatch(source, /className="absolute right-0 top-full/);
  const selectSource = await readFile(
    new URL("../src/shell/SelectionToolbarSelectControl.tsx", import.meta.url),
    "utf8",
  );
  assert.match(selectSource, /overflow-x-hidden/);
  assert.doesNotMatch(selectSource, /minWidth:\s*Math\.max/);
  const inspectorHostSource = await readFile(
    new URL("../src/shell/selection-inspector-host.tsx", import.meta.url),
    "utf8",
  );
  assert.match(inspectorHostSource, /id=\{group\.panelId\}/);
  assert.match(
    inspectorHostSource,
    /closest\("\[data-selection-overflow-control\]"\)/,
  );
});

/* ------------- W03 P3：focus trap / scroll lock / 栈顶纪律 ------------- */

test("dialog 角色默认有 Tab 循环，焦点绕回弹层内部而不是漏到页面上", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { ref: anchorRef, type: "button", "data-popover-anchor": true },
        "anchor",
      ),
      // 弹层外面放一个可聚焦目标：Tab 循环真生效时它一次都不该拿到焦点。
      React.createElement(
        "button",
        { type: "button", "data-outside-target": true },
        "outside",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open: true,
          anchorRef,
          onClose: () => {},
          role: "dialog",
          ariaLabel: "Trapped tools",
          attributes: { "data-trap-panel": true },
        },
        React.createElement(
          "button",
          { type: "button", "data-trap": "first" },
          "first",
        ),
        React.createElement(
          "button",
          { type: "button", "data-trap": "middle" },
          "middle",
        ),
        React.createElement(
          "button",
          { type: "button", "data-trap": "last" },
          "last",
        ),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  const pressTab = async (shiftKey) => {
    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };
  try {
    await frame();
    const panel = document.querySelector("[data-trap-panel]");
    assert.ok(panel);
    const first = panel.querySelector('[data-trap="first"]');
    const last = panel.querySelector('[data-trap="last"]');
    const outside = mounted.container.querySelector("[data-outside-target]");

    assert.equal(document.activeElement, first, "初始聚焦落在第一个可聚焦元素上");

    // 焦点停在最后一个上按 Tab → 绕回第一个。没有循环时它会漏到 outside 上。
    last.focus();
    await pressTab(false);
    assert.equal(document.activeElement, first, "Tab 走到尾部要绕回开头");

    // 反向同样要成立，否则 Shift+Tab 一步就能走出弹层。
    await pressTab(true);
    assert.equal(document.activeElement, last, "Shift+Tab 走到开头要绕回尾部");

    assert.notEqual(
      document.activeElement,
      outside,
      "焦点一次都不许落到弹层外面",
    );
  } finally {
    await mounted.unmount();
  }
});

test("dialog 角色默认锁滚动，关闭时把滚动位置精确放回去", async () => {
  // jsdom 不实现真滚动，所以把 scrollX/scrollY 钉住、把 scrollTo 记下来。
  // 要测的契约就是「锁的时候记住了什么、解锁时还回去什么」。
  const scrollCalls = [];
  const realScrollTo = window.scrollTo;
  const realScrollX = window.scrollX;
  const realScrollY = window.scrollY;
  Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 864 });
  window.scrollTo = (x, y) => scrollCalls.push([x, y]);

  function Harness() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { ref: anchorRef, type: "button", "data-popover-anchor": true },
        "anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open,
          anchorRef,
          onClose: () => setOpen(false),
          role: "dialog",
          ariaLabel: "Scroll locked",
          attributes: { "data-scrolllock-panel": true },
        },
        React.createElement("button", { type: "button" }, "first"),
      ),
    );
  }

  assert.notEqual(
    document.body.style.position,
    "fixed",
    "开工前 body 不该已经被锁住（锁是计数式的，前面的判据必须已经解干净）",
  );

  const mounted = await createMounted(Harness);
  try {
    await frame();
    // `position: fixed` 而不是只有 `overflow: hidden`——后者在 iOS Safari 上
    // 拦不住橡皮筋滚动，页面照样能拖。
    assert.equal(document.body.style.position, "fixed", "打开时要锁住 body");
    assert.equal(
      document.body.style.top,
      "-864px",
      "锁的同时要把当前滚动位置记进 top",
    );
    assert.equal(document.body.style.overflow, "hidden");
    assert.deepEqual(scrollCalls, [], "还没关，不许提前还原");

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

    assert.notEqual(
      document.body.style.position,
      "fixed",
      "解锁要把 position 放回原样",
    );
    assert.deepEqual(
      scrollCalls,
      [[0, 864]],
      "必须精确还原到原来那个像素位置，不是回到文档顶部",
    );
  } finally {
    window.scrollTo = realScrollTo;
    Object.defineProperty(window, "scrollX", {
      configurable: true,
      value: realScrollX,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: realScrollY,
    });
    await mounted.unmount();
  }
});

test("Escape 只关最上层，一次按键不会把嵌套弹层全掀掉", async () => {
  function Harness() {
    const outerAnchorRef = useRef(null);
    const innerAnchorRef = useRef(null);
    const [outerOpen, setOuterOpen] = useState(true);
    const [innerOpen, setInnerOpen] = useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { ref: outerAnchorRef, type: "button", "data-popover-anchor": true },
        "outer anchor",
      ),
      React.createElement(
        "button",
        { ref: innerAnchorRef, type: "button", "data-popover-anchor": true },
        "inner anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open: outerOpen,
          anchorRef: outerAnchorRef,
          onClose: () => setOuterOpen(false),
          role: "dialog",
          ariaLabel: "Outer",
          attributes: { "data-stack-outer": true },
        },
        React.createElement("button", { type: "button" }, "outer action"),
      ),
      // 后挂载的这层在 `openPopoverStack` 上更靠顶，键盘只该由它理会。
      React.createElement(
        AnchoredPopover,
        {
          open: innerOpen,
          anchorRef: innerAnchorRef,
          onClose: () => setInnerOpen(false),
          role: "dialog",
          ariaLabel: "Inner",
          attributes: { "data-stack-inner": true },
        },
        React.createElement("button", { type: "button" }, "inner action"),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  const pressEscape = async () => {
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
  };
  try {
    await frame();
    assertOpenInPlace(document.querySelector("[data-stack-outer]"), "外层初始");
    assertOpenInPlace(document.querySelector("[data-stack-inner]"), "内层初始");

    await pressEscape();
    assertClosedInPlace(
      document.querySelector("[data-stack-inner]"),
      "第一次 Escape 后的内层",
    );
    assertOpenInPlace(
      document.querySelector("[data-stack-outer]"),
      "第一次 Escape 后的外层",
    );

    // 栈顶交还给外层之后，第二次按键才轮到它。
    await pressEscape();
    assertClosedInPlace(
      document.querySelector("[data-stack-outer]"),
      "第二次 Escape 后的外层",
    );
  } finally {
    await mounted.unmount();
  }
});
