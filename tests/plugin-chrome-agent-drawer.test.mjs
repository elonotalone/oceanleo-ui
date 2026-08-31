// W22：PluginChromeFrame 内建 AI 抽屉 —— 包内回归
//
// 改造前 oceandino/tests/plugin-chrome-adoption.test.mjs 只查外壳与主题，
// 查不到 AI 键这一层，缺陷一路滑到浏览器才被看见。这里钉住：
//   - edit bar 右段恒有 data-edit-bar-agent
//   - 点击开/关左侧 agent 面板
//   - 插件传入的同 id 面板被过滤，内建注册点唯一
//   - 抽屉打开时 stage 仍可交互
//   - 摘掉关键实现时必须红（源码 Canary + 行为断言）

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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
  url: "http://localhost/",
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function source(relPath) {
  return readFileSync(resolve(relPath), "utf8");
}

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
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
  export const PLUGIN_AGENT_DRAWER_LABEL = "AI 助手";
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: PLUGIN_AGENT_DRAWER_ID,
      label: PLUGIN_AGENT_DRAWER_LABEL,
      icon: "agent",
      content: jsx("div", { "data-plugin-agent-panel": editorId, "data-test-agent-stub": true }),
    };
  }
  export function PluginAgentPanel({ editorId }) {
    return jsx("div", { "data-plugin-agent-panel": editorId });
  }
`);
const pluginThemeStubUrl = dataModule(`
  export function usePluginTheme() {
    return { theme: "light", accent: "#4f46e5" };
  }
  export function PluginThemeToggle() {
    return null;
  }
  export function pluginWorkbenchStyle(_theme, accent) {
    return { "--awb-accent": accent };
  }
`);

const frameUrl = await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
  "../../i18n/ui/useUI": uiStubUrl,
  "../AdvancedEditorIcon": iconStubUrl,
  "../plugin-theme": pluginThemeStubUrl,
  "./agent-drawer-panel": agentPanelStubUrl,
  "./PluginAgentPanel": agentPanelStubUrl,
});
const { PluginChromeFrame } = await import(frameUrl);
const { PLUGIN_AGENT_DRAWER_ID } = await import(
  await compileModule("src/shell/plugin-chrome/agent-drawer.ts"),
);

async function mountFrame(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PluginChromeFrame, {
        pluginId: "design-canvas",
        title: "设计画布",
        ...props,
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

test("frame edit bar 右段恒渲染 data-edit-bar-agent", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("div", { "data-test-stage": true }),
  });
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  assert.ok(agentBtn, "AI 键必须存在");
  assert.equal(agentBtn.getAttribute("aria-pressed"), "false");
  await unmount();
});

test("点击 AI 键：左侧出现 agent 面板，再点关闭", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("input", {
      "data-test-stage-input": true,
      type: "text",
      defaultValue: "editable",
    }),
  });
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  await act(async () => agentBtn.click());
  assert.equal(agentBtn.getAttribute("aria-pressed"), "true");
  const panel = container.querySelector(
    `[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`,
  );
  assert.ok(panel, "左侧 agent 面板应展开");
  assert.ok(
    panel.querySelector("[data-test-agent-stub]"),
    "面板内容应来自内建工厂",
  );
  await act(async () => agentBtn.click());
  assert.equal(agentBtn.getAttribute("aria-pressed"), "false");
  assert.equal(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
    null,
    "再点应关闭",
  );
  await unmount();
});

test("抽屉打开时 stage 仍可交互", async () => {
  const { container, unmount } = await mountFrame({
    children: React.createElement("input", {
      "data-test-stage-input": true,
      type: "text",
      defaultValue: "",
    }),
  });
  const input = container.querySelector("[data-test-stage-input]");
  const agentBtn = container.querySelector("[data-edit-bar-agent]");
  await act(async () => agentBtn.click());
  assert.ok(
    container.querySelector(`[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`),
  );
  input.value = "typed-while-agent-open";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(input.value, "typed-while-agent-open");
  assert.equal(input.disabled, false);
  await unmount();
});

test("插件传入的同 id 面板被过滤，内建注册点唯一", async () => {
  const { container, unmount } = await mountFrame({
    panels: [
      {
        id: PLUGIN_AGENT_DRAWER_ID,
        label: "插件自建 agent",
        content: React.createElement("div", {
          "data-test-plugin-agent-override": true,
        }),
      },
    ],
    children: null,
  });
  await act(async () => {
    container.querySelector("[data-edit-bar-agent]").click();
  });
  const panel = container.querySelector(
    `[data-plugin-chrome-panel="${PLUGIN_AGENT_DRAWER_ID}"]`,
  );
  assert.ok(panel);
  assert.ok(
    panel.querySelector("[data-test-agent-stub]"),
    "必须是内建工厂，不是插件 override",
  );
  assert.equal(
    panel.querySelector("[data-test-plugin-agent-override]"),
    null,
  );
  await unmount();
});

test("editBar 槽内显式不提供 AdvancedLayout，避免 SelectionToolbar 双 AI 键", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(
    frameSrc,
    /AdvancedLayoutContext\.Provider value=\{null\}/,
    "editBar 槽内必须置 null layout",
  );
  assert.match(frameSrc, /data-edit-bar-agent/, "frame 自己渲染 AI 键");
});

test("plugin-chrome 内 agent 面板只经 createPluginAgentDrawer 工厂注册", () => {
  const factorySrc = source("src/shell/plugin-chrome/agent-drawer-panel.tsx");
  assert.match(factorySrc, /id: PLUGIN_AGENT_DRAWER_ID/);
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /createPluginAgentDrawer\(/);
  assert.match(
    frameSrc,
    /panel\.id !== PLUGIN_AGENT_DRAWER_ID/,
    "必须过滤插件传入的同 id 面板",
  );
});

test("stage 不许加 inert 或 pointer-events-none（P3 结构性承诺）", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  const stageBlock = frameSrc.slice(
    frameSrc.indexOf("data-plugin-chrome-stage"),
    frameSrc.indexOf("</main>", frameSrc.indexOf("data-plugin-chrome-stage")),
  );
  assert.doesNotMatch(stageBlock, /\binert\b/);
  assert.doesNotMatch(stageBlock, /pointer-events-none/);
  assert.doesNotMatch(stageBlock, /aria-hidden/);
});

// ── 反面 Canary：摘掉下列任一实现，对应断言必须红 ─────────────────

test("反面 Canary：无 data-edit-bar-agent 时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /data-edit-bar-agent/);
  assert.match(frameSrc, /usePluginChromeLayout/);
  assert.match(frameSrc, /AdvancedLayoutContext\.Provider value=\{layout\}/);
});

test("反面 Canary：允许插件 override agent 面板时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /filter\(\(panel\) => panel\.id !== PLUGIN_AGENT_DRAWER_ID\)/);
});

test("反面 Canary：stage 加遮挡时必须红", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.doesNotMatch(
    source("src/shell/plugin-chrome/PluginChromeFrame.tsx"),
    /data-plugin-chrome-stage[\s\S]*pointer-events-none/,
  );
});
