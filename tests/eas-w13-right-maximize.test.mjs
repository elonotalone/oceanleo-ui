// W13：右上角 ✕ 改为「右侧全屏」；右栏自带 ✕ 删掉。
// 先在今天的代码上红（没有 rightMaximized、右栏还有关闭 ✕、顶栏仍是 close 槽），
// 改完再绿。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
  url: "https://website.oceanleo.com/history/session-1",
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
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
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
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const iconsStubUrl = dataModule(`
  export function IconLibrary() { return null; }
`);
const dockStubUrl = dataModule(`
  export function EditBarDockHost() { return null; }
`);
const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name }) {
    return jsx("span", { "data-icon": name, "aria-hidden": "true" });
  }
`);
const buttonStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function Button({ children, ...rest }) {
    return jsx("button", { type: "button", ...rest, children });
  }
  export function IconButton({ label, icon, onClick, ...rest }) {
    return jsx("button", {
      type: "button",
      ...rest,
      "aria-label": label,
      title: label,
      onClick,
      children: icon,
    });
  }
`);
const popoverStubUrl = dataModule(`
  export function AnchoredPopover() { return null; }
`);
const themeStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PluginThemeToggle() { return null; }
  export function usePluginTheme() {
    return { theme: "light", accent: "#4f46e5" };
  }
  export function usePluginThemePortal() { return null; }
  export function pluginWorkbenchStyle() { return {}; }
`);
const floatingToolbarStubUrl = dataModule(`
  export function useFloatingContextToolbar() {
    return {
      mode: "docked",
      dropActive: false,
      leading: null,
      trailing: null,
      portalRoot: null,
    };
  }
  export function FloatingContextToolbar() { return null; }
`);
const globalRowStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PluginGlobalRow() {
    return jsx("div", { "data-plugin-global-row": true });
  }
`);
const pageRowStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function PluginPageRow() {
    return jsx("div", { "data-plugin-page-row": true });
  }
`);
const pageStoreStubUrl = dataModule(`
  export function usePluginPage() {
    return { pageId: "artifact", setPage() {} };
  }
`);

const {
  SplitWorkspace,
  useRightPaneSlot,
  useWorkspacePane,
  useRegisterConsoleAgentFocus,
} = await import(
  await compileModule("src/shell/SplitWorkspace.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./icons": iconsStubUrl,
    "./EditBarDockHost": dockStubUrl,
  })
);

const actionBarSplitStubUrl = dataModule(`
  export function useRightPaneSlot() {
    return globalThis.__w13RightPaneSlot === undefined
      ? null
      : globalThis.__w13RightPaneSlot;
  }
  export function useWorkspacePane() { return null; }
`);

const { AdvancedWorkspaceActionBar } = await import(
  await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "../ui/Button": buttonStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./anchored-popover": popoverStubUrl,
    "./plugin-theme": themeStubUrl,
    "./SplitWorkspace": actionBarSplitStubUrl,
  })
);

const agentPanelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export const PLUGIN_AGENT_DRAWER_ID = "agent";
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: PLUGIN_AGENT_DRAWER_ID,
      label: "AI 助手",
      icon: "agent",
      content: jsx("div", { "data-plugin-agent-panel": editorId }),
    };
  }
`);
const gestureLayerStubUrl = dataModule(`
  export function PluginChromeEditBarGestureLayer({ children }) {
    return children;
  }
`);
const frameSplitStubUrl = dataModule(`
  export function useConsoleAgentFocus() { return null; }
  export function useRightPaneSlot() {
    return globalThis.__w13FrameSlot === undefined
      ? null
      : globalThis.__w13FrameSlot;
  }
`);

const { PluginChromeFrame } = await import(
  await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../AdvancedEditorIcon": iconStubUrl,
    "../plugin-theme": themeStubUrl,
    "./agent-drawer-panel": agentPanelStubUrl,
    "./PluginAgentPanel": agentPanelStubUrl,
    "../SplitWorkspace": frameSplitStubUrl,
    "../PluginChromeEditBarGestureLayer": gestureLayerStubUrl,
    "../FloatingContextToolbar": floatingToolbarStubUrl,
    "./PluginGlobalRow": globalRowStubUrl,
    "./PluginPageRow": pageRowStubUrl,
    "./plugin-page-store": pageStoreStubUrl,
  })
);

function MaximizeProbe() {
  const slot = useRightPaneSlot();
  return React.createElement(
    "button",
    {
      type: "button",
      "data-probe-maximize": true,
      "aria-pressed": slot?.rightMaximized === true,
      onClick: () => slot?.toggleRightMaximized?.(),
    },
    slot?.rightMaximized ? "退出右侧全屏" : "右侧全屏",
  );
}

function WorkspaceOpsProbe() {
  const pane = useWorkspacePane();
  const paneRef = React.useRef(pane);
  paneRef.current = pane;
  useRegisterConsoleAgentFocus(true, () => {
    globalThis.__w13AgentFocused = true;
  });
  React.useEffect(() => {
    const current = paneRef.current;
    if (!current) return;
    current.registerLibraryPanel("materials", {
      ownerId: "w13-lib",
      id: "materials",
      label: "素材库",
      content: React.createElement("div", { "data-w13-library": true }),
    });
    return () => current.unregisterLibraryPanel("materials", "w13-lib");
  }, []);
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      {
        type: "button",
        "data-probe-detail": true,
        onClick: () =>
          pane?.showDetail({
            ownerId: "w13",
            id: "detail",
            label: "详情",
            content: React.createElement("div", { "data-w13-detail": true }),
          }),
      },
      "detail",
    ),
    React.createElement(
      "button",
      {
        type: "button",
        "data-probe-library": true,
        onClick: () => pane?.openLibraryPanel("materials"),
      },
      "library",
    ),
  );
}

function HeaderFlagProbe() {
  const slot = useRightPaneSlot();
  return React.createElement(
    "button",
    {
      type: "button",
      "data-probe-header": true,
      onClick: () => slot?.setRightEditorHeader?.(true),
    },
    "header",
  );
}

function adapterFixture() {
  return {
    id: "grid",
    label: "表格",
    actions: [],
  };
}

async function mountSplit(extraRight) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(SplitWorkspace, {
        left: React.createElement(
          "div",
          { "data-left-chat": true },
          React.createElement(WorkspaceOpsProbe),
          React.createElement(HeaderFlagProbe),
        ),
        right: React.createElement(
          "div",
          { "data-right-library": true },
          React.createElement(MaximizeProbe),
          extraRight ?? null,
        ),
        fillParent: true,
        library: { open: true, onOpenChange() {}, label: "预览" },
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

async function mountActionBar() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const closed = { n: 0 };
  const render = async () => {
    await act(async () => {
      root.render(
        React.createElement(AdvancedWorkspaceActionBar, {
          adapter: adapterFixture(),
          autoSaveState: "saved",
          activeLibraryPanelId: null,
          showClose: true,
          onBack() {},
          onOpenLibrary() {},
          onRetrySave() {},
          onClose: () => {
            closed.n += 1;
          },
          onTriggerAction() {},
        }),
      );
    });
  };
  await render();
  return {
    container,
    closed,
    render,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function mountFrame(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const closed = { n: 0 };
  const fullscreen = { n: 0 };
  await act(async () => {
    root.render(
      React.createElement(PluginChromeFrame, {
        pluginId: "design-canvas",
        title: "设计画布",
        window: {
          onClose: () => {
            closed.n += 1;
          },
          onToggleFullscreen: () => {
            fullscreen.n += 1;
          },
        },
        children: React.createElement("div", { "data-test-stage": true }),
        ...props,
      }),
    );
  });
  return {
    container,
    closed,
    fullscreen,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function rightPaneHeader(container) {
  return container.querySelector(
    '[data-workspace-pane="main"] [data-pane-header]',
  );
}

function closeXInRightHeader(container) {
  const header = rightPaneHeader(container);
  if (!header) return null;
  return (
    [...header.querySelectorAll("button")].find((button) => {
      const name = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`;
      return name.includes("关闭") || name.includes("✕");
    }) || null
  );
}

test("最大化后左栏仍挂载、不可见，根节点带 data-workspace-maximized=library", async () => {
  const mounted = await mountSplit();
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const left = mounted.container.querySelector('[data-workspace-pane="left"]');
    const chat = mounted.container.querySelector("[data-left-chat]");
    assert.ok(root && left && chat, "分栏没有画出来");
    assert.equal(root.dataset.workspaceMaximized, undefined);
    assert.equal(typeof useRightPaneSlot, "function");

    const toggle = mounted.container.querySelector("[data-probe-maximize]");
    assert.ok(toggle, "探测按钮没渲染，说明右栏没挂上");
    await act(async () => toggle.click());

    assert.equal(root.dataset.workspaceMaximized, "library");
    assert.ok(
      mounted.container.querySelector("[data-left-chat]"),
      "最大化后左栏被卸掉了，对话会停",
    );
    assert.ok(
      left.className.includes("hidden"),
      "最大化后左栏还占着位子",
    );
    assert.equal(
      mounted.container.querySelector('[role="separator"]'),
      null,
      "最大化后分隔条还在",
    );
  } finally {
    await mounted.unmount();
  }
});

test("Esc 退出最大化；defaultPrevented 的 Esc 不退出", async () => {
  const mounted = await mountSplit();
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const toggle = mounted.container.querySelector("[data-probe-maximize]");
    await act(async () => toggle.click());
    assert.equal(root.dataset.workspaceMaximized, "library");

    await act(async () => {
      const blocked = new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      blocked.preventDefault();
      window.dispatchEvent(blocked);
    });
    assert.equal(
      root.dataset.workspaceMaximized,
      "library",
      "已经 preventDefault 的 Esc 不该拆掉右侧全屏",
    );

    await act(async () => {
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(root.dataset.workspaceMaximized, undefined);
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
  } finally {
    await mounted.unmount();
  }
});

test("showDetail 与 openLibraryPanel 自动退出右侧全屏", async () => {
  const mounted = await mountSplit();
  try {
    const root = mounted.container.querySelector("[data-workspace-split]");
    const toggle = mounted.container.querySelector("[data-probe-maximize]");
    await act(async () => toggle.click());
    assert.equal(root.dataset.workspaceMaximized, "library");

    await act(async () =>
      mounted.container.querySelector("[data-probe-detail]").click(),
    );
    assert.equal(root.dataset.workspaceMaximized, undefined);
    assert.ok(mounted.container.querySelector("[data-w13-detail]"));

    await act(async () => toggle.click());
    assert.equal(root.dataset.workspaceMaximized, "library");
    await act(async () =>
      mounted.container.querySelector("[data-probe-library]").click(),
    );
    assert.equal(root.dataset.workspaceMaximized, undefined);
    assert.ok(mounted.container.querySelector("[data-w13-library]"));
  } finally {
    await mounted.unmount();
  }
});

test("编辑器打开期间右栏标题行没有关闭 ✕", async () => {
  const mounted = await mountSplit();
  try {
    assert.equal(
      closeXInRightHeader(mounted.container),
      null,
      "库标题行还留着关掉整栏的 ✕",
    );
    await act(async () =>
      mounted.container.querySelector("[data-probe-header]").click(),
    );
    assert.equal(
      closeXInRightHeader(mounted.container),
      null,
      "编辑器打开后右栏里又冒出关闭 ✕",
    );
  } finally {
    await mounted.unmount();
  }
});

test("顶栏 maximize 槽的 aria-pressed 跟右侧全屏状态走", async () => {
  const slot = {
    rightMaximized: false,
    toggleRightMaximized() {
      this.rightMaximized = !this.rightMaximized;
    },
    setRightMaximized(value) {
      this.rightMaximized = value;
    },
    setRightLabel() {},
    clearRightLabel() {},
    setRightFrameless() {},
    setRightEditorHeader() {},
    editBarLayerRef: { current: null },
    editBarDockRef: { current: null },
    setEditBarDockPresentation() {},
    clearEditBarDockPresentation() {},
  };
  globalThis.__w13RightPaneSlot = slot;
  const mounted = await mountActionBar();
  try {
    assert.equal(
      mounted.container.querySelector('[data-global-row-slot="close"]'),
      null,
      "顶栏还在画 close 槽",
    );
    const slotNode = mounted.container.querySelector(
      '[data-global-row-slot="maximize"]',
    );
    assert.ok(slotNode, "顶栏没有 maximize 槽");
    const button = slotNode.querySelector("button");
    assert.ok(button, "右侧全屏按钮没画出来");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.equal(button.getAttribute("aria-label"), "右侧全屏");

    await act(async () => button.click());
    await mounted.render();
    const pressed = mounted.container.querySelector(
      '[data-global-row-slot="maximize"] button',
    );
    assert.equal(pressed.getAttribute("aria-pressed"), "true");
    assert.equal(pressed.getAttribute("aria-label"), "退出右侧全屏");
    assert.equal(mounted.closed.n, 0, "点右侧全屏走了 onClose");
  } finally {
    globalThis.__w13RightPaneSlot = undefined;
    await mounted.unmount();
  }
});

test("没有 slot 时点按钮调用 requestFullscreen，而不是 onClose", async () => {
  globalThis.__w13RightPaneSlot = null;
  const calls = [];
  const proto = window.HTMLElement.prototype;
  const previous = proto.requestFullscreen;
  proto.requestFullscreen = function requestFullscreen() {
    calls.push(this);
    return Promise.resolve();
  };
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  const host = document.createElement("div");
  host.setAttribute("data-inline-editor", "");
  document.body.append(host);

  const mounted = await mountActionBar();
  try {
    const button = mounted.container.querySelector(
      '[data-global-row-slot="maximize"] button',
    );
    assert.ok(button, "没有 slot 时全屏按钮应该还在（Fullscreen API 可用）");
    await act(async () => button.click());
    assert.equal(mounted.closed.n, 0, "没有 slot 时点按钮仍走了 onClose");
    assert.ok(calls.length > 0, "没有调用 requestFullscreen");
    assert.equal(calls[0], host, "全屏目标不是编辑器根");
  } finally {
    if (previous) proto.requestFullscreen = previous;
    else delete proto.requestFullscreen;
    host.remove();
    globalThis.__w13RightPaneSlot = undefined;
    await mounted.unmount();
  }
});

test("抽出 App 的自画顶栏去掉关闭，分栏里是右侧全屏", async () => {
  const slot = {
    rightMaximized: false,
    toggleRightMaximized() {
      this.rightMaximized = !this.rightMaximized;
    },
    setRightMaximized() {},
  };
  globalThis.__w13FrameSlot = slot;
  const mounted = await mountFrame();
  try {
    const close = [...mounted.container.querySelectorAll("button")].find(
      (button) => (button.getAttribute("aria-label") || "") === "关闭",
    );
    assert.equal(close, undefined, "PluginChromeFrame 还在画关闭");
    const maximize = mounted.container.querySelector(
      'button[aria-label="右侧全屏"]',
    );
    assert.ok(maximize, "分栏里的自画顶栏没有右侧全屏");
    await act(async () => maximize.click());
    assert.equal(slot.rightMaximized, true);
    assert.equal(mounted.closed.n, 0);
    assert.equal(mounted.fullscreen.n, 0, "有 slot 时不该走浏览器全屏回调");
  } finally {
    globalThis.__w13FrameSlot = undefined;
    await mounted.unmount();
  }
});
