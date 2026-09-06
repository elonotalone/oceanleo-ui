// ============================================================================
// SplitWorkspace 右栏在屏幕上 → 登记 workbenchOpen（plugin-chrome X4）
// ----------------------------------------------------------------------------
// 操作员截图（V3 §三）里「模型组合」压住的是 /history 右栏**标题行**上的「我的库」
// 页签——不是编辑器盖上之后才压，是库面板一开就压。所以登记点不能只放在
// ResultCanvas 的前台（编辑器 / 详情预览），右栏本身可见就得登记。
//
// 这里判的是 SplitWorkspace 的真实接线：
//   - 受控 `library.open`：true → 登记；翻成 false（用户点 ✕ 收起）→ 注销；
//   - 无 library 的旧双栏形态（`right != null`）→ 登记；`right` 为 null → 不登记；
//   - 整棵卸载 → 注销。
// 普通 agent 对话页 AgentChat 把 `rightOpen` 初值设成 false，所以那里选择框照常在；
// 本测试同时钉住这一点：`library.open=false` 时 store 必须是 false。
// ============================================================================

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
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
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

const store = await import("../src/shell/workbench-open-store.ts");

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const iconsStubUrl = dataModule(`
  export function IconLibrary() { return null; }
`);
const dockStubUrl = dataModule(`
  export function EditBarDockHost() { return null; }
`);

// 桩表里不放 `react`（否则 store 被就地编译成另一份实例）。
const { SplitWorkspace } = await import(
  await compileModule("src/shell/SplitWorkspace.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./icons": iconsStubUrl,
    "./EditBarDockHost": dockStubUrl,
  })
);

async function mount(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next) => {
    await act(async () => {
      root.render(
        React.createElement(SplitWorkspace, {
          left: React.createElement("div", { "data-left": true }, "chat"),
          right: React.createElement("div", { "data-right": true }, "library"),
          fillParent: true,
          ...next,
        }),
      );
    });
  };
  await render(props);
  return {
    container,
    render,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("受控 library.open：开 → 登记；收起 → 注销；再开 → 再登记", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mount({ library: { open: true, onOpenChange() {} } });
  try {
    assert.equal(store.workbenchOpenSnapshot(), true, "右栏（库）在屏幕上必须登记");
    await mounted.render({ library: { open: false, onOpenChange() {} } });
    assert.equal(
      store.workbenchOpenSnapshot(),
      false,
      "用户点 ✕ 收起库之后选择框要回来",
    );
    await mounted.render({ library: { open: true, onOpenChange() {} } });
    assert.equal(store.workbenchOpenSnapshot(), true);
  } finally {
    await mounted.unmount();
  }
  assert.equal(store.workbenchOpenSnapshot(), false, "整棵卸载必须注销");
  store.resetWorkbenchOpenForTests();
});

test("普通 agent 对话页形态（library.open=false 初值）：不登记，选择框照常在", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mount({ library: { open: false, onOpenChange() {} } });
  try {
    // 注意：右栏节点为 keep-alive 仍留在 DOM 里（隐藏），判据只看 store。
    assert.equal(store.workbenchOpenSnapshot(), false);
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("无 library 旧双栏形态：right 有内容 → 登记；right 为 null → 不登记", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mount({});
  try {
    assert.equal(store.workbenchOpenSnapshot(), true);
    await mounted.render({ right: null });
    assert.equal(store.workbenchOpenSnapshot(), false);
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});
