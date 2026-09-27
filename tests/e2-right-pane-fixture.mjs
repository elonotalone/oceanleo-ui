// Real shared pane/shell; only editor cores and unrelated services are stubbed.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";


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
  const tt = (value) => value; export function useUI() { return tt; }
`);
const iconsStubUrl = dataModule(`
  export function IconLibrary() { return null; }
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

const splitUrl = await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "./icons": iconsStubUrl,
});
const { SplitWorkspace, useRightPaneSlot, useWorkspacePane } = await import(splitUrl);

const { AdvancedWorkspaceActionBar } = await import(
  await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "../ui/Button": buttonStubUrl,
    "./AdvancedEditorIcon": iconStubUrl,
    "./anchored-popover": popoverStubUrl,
    "./plugin-theme": themeStubUrl,
    "./SplitWorkspace": splitUrl,
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
const { PluginChromeFrame } = await import(
  await compileModule("src/shell/plugin-chrome/PluginChromeFrame.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../AdvancedEditorIcon": iconStubUrl,
    "../plugin-theme": themeStubUrl,
    "./agent-drawer-panel": agentPanelStubUrl,
    "./PluginAgentPanel": agentPanelStubUrl,
    "../SplitWorkspace": splitUrl,
    "../PluginChromeEditBarGestureLayer": gestureLayerStubUrl,
    "../FloatingContextToolbar": floatingToolbarStubUrl,
    "./PluginGlobalRow": globalRowStubUrl,
    "./PluginPageRow": pageRowStubUrl,
    "./plugin-page-store": pageStoreStubUrl,
  })
);


const reactUrl = pathToFileURL(require.resolve("react")).href;
const { InlineAdvancedWorkbenchShell } = await import(await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
      "../i18n/ui/useUI": uiStubUrl,
      "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
      "./advanced-layout-context": dataModule(`
        import { createContext } from ${JSON.stringify(reactUrl)};
        export const AdvancedLayoutContext = createContext(null);
        export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
        export function focusAdvancedToolsTrigger() {}
        export function useAdvancedToolsLauncherRegistration() {}
      `),
      "./AdvancedStageControls": dataModule(`
        export function AdvancedStageControls() { return null; }
      `),
      "./AdvancedWorkbenchStage": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
      `),
      "./FloatingContextToolbar": dataModule(`
        import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
        export function FloatingContextToolbar({ children, documentSegment }) {
          return jsxs("div", { "data-workspace-edit-bar": true, "data-empty": !children && !documentSegment ? true : undefined, children: [children ?? null, documentSegment ?? null] });
        }
        export function useFloatingContextToolbar() {
          return { mode: "docked", dropActive: false, leading: null, trailing: null };
        }
      `),
      "./advanced-leave-flush": dataModule(`
        export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
      `),
      "./inline-advanced-workbench-drop": dataModule(`
        export function useInlineAdvancedWorkbenchDrop() {
          return { dropMessage: "", performUpload() {}, handleDrop() {} };
        }
      `),
      "./use-inline-advanced-panels": dataModule(`
        export function useInlineAdvancedPanels() {
          return {
            drawers: [],
            activeDrawerId: "",
            activeMaterialAction: null,
            transientPanel: null,
            fallbackDetail: null,
            openDrawer() {},
            openTransientPanel() {},
            updateTransientPanel() {},
            closeDetail() {},
          };
        }
      `),
      "./advanced-session-context": dataModule(`
        export function useAdvancedSession() { return null; }
      `),
      "./workbench-material-provider": dataModule(`
        export function useWorkbenchMaterials() { return null; }
      `),
      "./SplitWorkspace": splitUrl,
      "./use-advanced-autosave": dataModule(`
        export function useAdvancedAutoSave() {
          return { state: "saved", flushLatest: async () => ({ ok: true }), retry: async () => {} };
        }
      `),
      "./use-advanced-recovery": dataModule(`export function useAdvancedRecovery() {}`),
      "./workbench-routes": dataModule(`
        export function editBarOwnershipForItem() { return "host"; }
      `),
  "./InlineAdvancedWorkbenchHeader": dataModule(`
    import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
    export function InlineAdvancedWorkbenchHeader({ adapter }) {
      return jsxs("div", {"data-claim-header": adapter.label, children: [
        jsx("div", {children: "素材库 我的库"}), jsx("div", {children: adapter.label})
      ]});
    }
  `),
}));

const item = { id: "same-item", key: "same-item", kind: "deck", title: "deck", source: "creation", favorite: false, meta: {} };
function shell(label) {
  return React.createElement(InlineAdvancedWorkbenchShell, {
    key: label, item, onClose() {},
    adapter: { id: "deck", label, actions: [] },
  });
}
async function mount(right) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (content) => act(async () => root.render(
    React.createElement(SplitWorkspace, {
      left: React.createElement("div", null, "chat"), right: content,
      fillParent: true, library: { open: true, label: "预览" },
    }),
  ));
  await render(right);
  return {container, render, async unmount() { await act(async () => root.unmount()); container.remove(); }};
}
export { React, act, splitUrl, uiStubUrl, jsxRuntimeUrl, reactUrl, SplitWorkspace,
  useRightPaneSlot, useWorkspacePane, AdvancedWorkspaceActionBar, PluginChromeFrame,
  InlineAdvancedWorkbenchShell, shell, mount };
