// W03：chrome="host" 时 iframe 内一行 chrome 都不画。
// 用户看到的两行顶栏由宿主画；这里只交舞台。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  export function createPluginAgentDrawer({ editorId }) {
    return {
      id: PLUGIN_AGENT_DRAWER_ID,
      label: "AI 助手",
      icon: "agent",
      content: jsx("div", { "data-plugin-agent-panel": editorId }),
    };
  }
`);
const pluginThemeStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function usePluginTheme() {
    return { theme: "light", accent: "#4f46e5" };
  }
  export function PluginThemeToggle({ pluginId }) {
    return jsx("button", {
      type: "button",
      "data-plugin-theme-toggle": pluginId,
      "aria-label": "切换到暗黑主题",
    });
  }
  export function pluginWorkbenchStyle(_theme, accent) {
    return { "--awb-accent": accent };
  }
`);
const splitWorkspaceStubUrl = dataModule(`
  export function useConsoleAgentFocus() { return null; }
`);
const gestureLayerStubUrl = dataModule(`
  export function PluginChromeEditBarGestureLayer({ children }) {
    return children;
  }
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

const frameStubs = {
  "../../i18n/ui/useUI": uiStubUrl,
  "../AdvancedEditorIcon": iconStubUrl,
  "../plugin-theme": pluginThemeStubUrl,
  "./agent-drawer-panel": agentPanelStubUrl,
  "./PluginAgentPanel": agentPanelStubUrl,
  "../SplitWorkspace": splitWorkspaceStubUrl,
  "../PluginChromeEditBarGestureLayer": gestureLayerStubUrl,
  "../FloatingContextToolbar": floatingToolbarStubUrl,
  "./PluginGlobalRow": globalRowStubUrl,
  "./PluginPageRow": pageRowStubUrl,
  "./plugin-page-store": pageStoreStubUrl,
};

const frameUrl = await compileModule(
  "src/shell/plugin-chrome/PluginChromeFrame.tsx",
  frameStubs,
);
const {
  PluginChromeFrame,
  readPluginChromeFromSearch,
  readPluginChromeFromHostMessage,
  readHostSetMode,
} = await import(frameUrl);

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
        views: [{ id: "preview", label: "预览", icon: "preview" }],
        window: {
          onToggleFullscreen: () => {},
          onClose: () => {},
        },
        children: React.createElement("div", { "data-test-stage": true }, "舞台"),
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

test("?embed=1 判为 host；其它 search 判为 self", () => {
  assert.equal(readPluginChromeFromSearch("?embed=1"), "host");
  assert.equal(readPluginChromeFromSearch("?embed=1&editor=1"), "host");
  assert.equal(readPluginChromeFromSearch("?editor=1"), "self");
  assert.equal(readPluginChromeFromSearch(""), "self");
});

test("宿主 init / set-host-layout 的 chrome 标记", () => {
  assert.equal(
    readPluginChromeFromHostMessage(
      {
        protocol: "oceanleo.editor.v1",
        type: "init",
        instanceId: "i1",
        chrome: "host",
      },
      "i1",
    ),
    "host",
  );
  assert.equal(
    readPluginChromeFromHostMessage(
      {
        protocol: "oceanleo.editor.v1",
        type: "set-host-layout",
        instanceId: "i1",
        hostOwnsChrome: true,
      },
      "i1",
    ),
    "host",
  );
  assert.equal(
    readPluginChromeFromHostMessage(
      {
        protocol: "oceanleo.editor.v1",
        type: "init",
        instanceId: "other",
        chrome: "host",
      },
      "i1",
    ),
    null,
  );
  assert.equal(
    readHostSetMode(
      {
        protocol: "oceanleo.editor.v1",
        type: "set-mode",
        instanceId: "i1",
        mode: "pro",
      },
      "i1",
    ),
    "pro",
  );
});

test('chrome="host" 渲染结果里没有顶栏、页签、主题、全屏、编辑栏', async () => {
  const { container, unmount } = await mountFrame({ chrome: "host" });
  assert.equal(container.querySelector("header"), null);
  assert.equal(container.querySelector("[data-workbench-view]"), null);
  assert.equal(container.querySelector("[data-plugin-theme-toggle]"), null);
  assert.equal(container.querySelector('button[aria-label*="全屏"]'), null);
  assert.equal(container.querySelector("[role=toolbar]"), null);
  assert.equal(container.querySelector("[data-plugin-chrome-header]"), null);
  assert.equal(container.querySelector("[data-plugin-chrome-edit-bar]"), null);
  assert.ok(container.querySelector("[data-test-stage]"));
  assert.equal(
    container.querySelector("[data-plugin-chrome-owner]").getAttribute(
      "data-plugin-chrome-owner",
    ),
    "host",
  );
  await unmount();
});

test("chrome 缺省仍自画顶栏（self 兼容；W01 行换不了，见 Frame 文件头）", async () => {
  const { container, unmount } = await mountFrame({});
  assert.ok(container.querySelector("header"));
  assert.ok(container.querySelector("[role=toolbar]"));
  await unmount();
});

test("host 分支源码不渲染 header / toolbar", () => {
  const frameSrc = source("src/shell/plugin-chrome/PluginChromeFrame.tsx");
  assert.match(frameSrc, /if \(chrome === "host"\)/);
  assert.match(frameSrc, /data-plugin-chrome-owner="host"/);
  assert.doesNotMatch(
    frameSrc.slice(
      frameSrc.indexOf('if (chrome === "host")'),
      frameSrc.indexOf("return (", frameSrc.indexOf('if (chrome === "host")') + 1) +
        800,
    ),
    /<header/,
  );
});
