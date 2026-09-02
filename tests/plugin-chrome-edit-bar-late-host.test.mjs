/**
 * chrome 编辑栏：宿主晚挂时先保 AI 键，就绪后补装手势。
 *
 * 配 `plugin-chrome-edit-bar-portal-gate.test.mjs`（源码闸）一起守这件事。
 * 13 件插件的逐件可达仍由 `edit-bar-gesture-coverage.test.mjs` 负责；
 * 这里钉的是那三个 embed 类插件会踩到的「控制器 portalRoot 还是 null」路径。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useMemo, useRef, useState } from "react";

import {
  readEditBarPortalHost,
  resolveEditBarGestureSurface,
} from "../src/shell/edit-bar-dock-state.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

test("没有宿主：留在行里，不上浮层", () => {
  assert.deepEqual(resolveEditBarGestureSurface(null), {
    kind: "inline",
    portalRoot: null,
  });
  assert.deepEqual(resolveEditBarGestureSurface(undefined), {
    kind: "inline",
    portalRoot: null,
  });
});

test("活宿主在、控制器 portalRoot 仍是 null：必须上手势", () => {
  const host = { parentElement: null };
  const portal = readEditBarPortalHost({
    liveHost: host,
    dockHost: null,
    stageHost: null,
    controllerPortalRoot: null,
  });
  assert.equal(portal, host);
  assert.deepEqual(resolveEditBarGestureSurface(portal), {
    kind: "floating",
    portalRoot: host,
  });
});

test("活宿主缺席时才退回控制器快照，快照也没有才 inline", () => {
  const snapshot = { parentElement: null };
  const dock = { parentElement: snapshot };
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: dock,
      stageHost: null,
      controllerPortalRoot: null,
    }),
    snapshot,
  );
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: null,
      stageHost: null,
      controllerPortalRoot: snapshot,
    }),
    snapshot,
  );
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: null,
      stageHost: null,
      controllerPortalRoot: null,
    }),
    null,
  );
});

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stateUrl = pathToFileURL(resolve("src/shell/edit-bar-dock-state.ts")).href;
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
`);
const pluginThemeStubUrl = dataModule(`
  export function pluginWorkbenchStyle(_theme, accent) {
    return { "--pchrome-accent": accent, "--awb-accent": accent };
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
const floatingUrl = await compileModule(
  "src/shell/FloatingContextToolbar.tsx",
  {
    "react-dom": reactDomUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./advanced-workbench-chrome": chromeStubUrl,
    "./edit-bar-dock-controller": controllerUrl,
    "./EditBarDockControls": controlsUrl,
    "./edit-bar-dock-state": stateUrl,
    "./plugin-theme": pluginThemeStubUrl,
  },
);
const layerUrl = await compileModule(
  "src/shell/PluginChromeEditBarGestureLayer.tsx",
  {
    react: reactUrl,
    "react-dom": reactDomUrl,
    "./FloatingContextToolbar": floatingUrl,
    "./edit-bar-dock-state": stateUrl,
    "./plugin-theme": pluginThemeStubUrl,
  },
);
const { PluginChromeEditBarGestureLayer } = await import(layerUrl);
const { useFloatingContextToolbar } = await import(floatingUrl);

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
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(
        this.style.transform || "",
      );
      return rect(
        match ? Number(match[1]) : 100,
        match ? Number(match[2]) : 60,
        300,
        52,
      );
    }
    if (this.hasAttribute("data-plugin-chrome")) return rect(0, 0, 1000, 600);
    if (this.hasAttribute("data-plugin-chrome-stage")) {
      return rect(0, 110, 1000, 490);
    }
    if (this.hasAttribute("data-plugin-chrome-edit-bar")) {
      return rect(0, 56, 1000, 48);
    }
    if (this.hasAttribute("data-test-layer")) return rect(0, 0, 1000, 600);
    return original.call(this);
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  };
}

function LateHostHarness({
  showHost,
  freezeControllerPortal,
}) {
  const layerRef = useRef(null);
  const stageRef = useRef(null);
  const dockRef = useRef(null);
  const controller = useFloatingContextToolbar({
    workspaceRootRef: layerRef,
    stageRef,
    dockRootRef: dockRef,
    resetKey: "w4-late-host",
  });
  const bridgeController = useMemo(
    () =>
      freezeControllerPortal
        ? { ...controller, portalRoot: null }
        : controller,
    [controller, freezeControllerPortal],
  );
  return React.createElement(
    "div",
    { "data-test-root": true },
    showHost
      ? React.createElement("div", {
          ref: layerRef,
          "data-plugin-chrome": "website",
          "data-test-layer": true,
        })
      : null,
    React.createElement(
      "div",
      {
        ref: showHost ? dockRef : undefined,
        "data-plugin-chrome-edit-bar": true,
      },
      React.createElement(
        PluginChromeEditBarGestureLayer,
        {
          bridge: {
            layerRef,
            stageRef,
            dockRef,
            controller: bridgeController,
          },
          accent: "#4f46e5",
          theme: "light",
        },
        React.createElement(
          "div",
          { "data-test-edit-bar": true },
          "工具条",
        ),
        React.createElement(
          "button",
          { type: "button", "data-edit-bar-agent": true },
          "AI",
        ),
      ),
    ),
    showHost
      ? React.createElement("div", {
          ref: stageRef,
          "data-plugin-chrome-stage": true,
        })
      : null,
  );
}

function HostToggleHarness() {
  const [showHost, setShowHost] = useState(false);
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      {
        type: "button",
        "data-test-attach-host": true,
        onClick: () => setShowHost(true),
      },
      "挂上宿主",
    ),
    React.createElement(LateHostHarness, {
      showHost,
      freezeControllerPortal: true,
    }),
  );
}

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function translateOf(element) {
  const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(
    element?.style.transform || "",
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
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

test("没有任何宿主时 AI 键留在行里，浮层不上", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const mounted = await mount(
    React.createElement(LateHostHarness, {
      showHost: false,
      freezeControllerPortal: true,
    }),
  );
  try {
    assert.equal(
      mounted.container.querySelector("[data-workspace-edit-bar-toolbar]"),
      null,
      "没有宿主却上手势浮层——AI 键会从行里被掏空",
    );
    const agent = mounted.container.querySelector("[data-edit-bar-agent]");
    assert.ok(agent, "没有宿主时 AI 键必须还在行里（契约 §9）");
    assert.ok(
      agent.closest("[data-plugin-chrome-edit-bar]"),
      "没有宿主时 AI 键必须仍是停靠行的后代，不能先消失再等浮层",
    );
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("控制器 portalRoot 为 null 但 layer 已挂上：补装手势，AI 键仍在", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const mounted = await mount(
    React.createElement(LateHostHarness, {
      showHost: true,
      freezeControllerPortal: true,
    }),
  );
  try {
    const bar = mounted.container.querySelector(
      "[data-workspace-edit-bar-toolbar]",
    );
    assert.ok(
      bar,
      "layer 已经在 DOM 里，只因为控制器 portalRoot 仍是 null 就不上手势。" +
        "三个 embed 类插件会整栏拖不动",
    );
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-agent]"),
      "补装手势之后 AI 键必须还在（契约 §9）",
    );

    const anywhere = mounted.container.querySelector("[data-test-edit-bar]");
    assert.ok(anywhere, "插件填进来的 edit bar 内容不在");
    const before = translateOf(bar);
    assert.ok(before, "浮层没有位置");
    for (const step of [0, 1]) {
      await pointer(anywhere, "pointerdown", {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        clientX: 400,
        clientY: 70,
        timeStamp: 1000 + step,
      });
    }
    await act(async () => {
      const move = new window.Event("pointermove", { bubbles: true });
      for (const [name, value] of Object.entries({
        pointerId: 1,
        clientX: 520,
        clientY: 300,
        timeStamp: 1100,
      })) {
        Object.defineProperty(move, name, { configurable: true, value });
      }
      window.dispatchEvent(move);
    });
    const dragged = translateOf(bar);
    assert.ok(
      dragged && (dragged.x !== before.x || dragged.y !== before.y),
      `补装之后仍拖不动：${JSON.stringify(before)} → ${JSON.stringify(dragged)}`,
    );
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});

test("宿主晚一拍才挂上：先保 AI，就绪后补装手势且 AI 仍在", async () => {
  window.localStorage.clear();
  const restoreRect = installRectStub();
  const mounted = await mount(React.createElement(HostToggleHarness));
  try {
    assert.equal(
      mounted.container.querySelector("[data-workspace-edit-bar-toolbar]"),
      null,
      "宿主还没挂上就出了浮层",
    );
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-agent]"),
      "宿主还没挂上时 AI 键必须可见",
    );

    await act(async () => {
      mounted.container.querySelector("[data-test-attach-host]").click();
    });

    assert.ok(
      mounted.container.querySelector("[data-workspace-edit-bar-toolbar]"),
      "宿主挂上之后没有补装手势——会永远拖不动",
    );
    assert.ok(
      mounted.container.querySelector("[data-edit-bar-agent]"),
      "补装之后 AI 键消失了。降级存在就是为了不让这件事发生",
    );
  } finally {
    await mounted.unmount();
    restoreRect();
  }
});
