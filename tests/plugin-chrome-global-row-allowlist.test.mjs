import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { GLOBAL_ROW_SLOTS } from "../src/shell/plugin-chrome/plugin-pages.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const ttStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);

function loadShell() {
  return (async () =>
    import(
      await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
      "../i18n/ui/useUI": ttStubUrl,
      "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
      "./advanced-layout-context": dataModule(`
        import { createContext } from ${JSON.stringify(reactUrl)};
        export const AdvancedLayoutContext = createContext(null);
        export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
        export function focusAdvancedToolsTrigger() {}
        export function useAdvancedToolsLauncherRegistration() {}
      `),
      "./AdvancedStageControls": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedStageControls() { return null; }
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
        export function EditBarDockHost() { return null; }
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
      "./EditBarDockHost": dataModule(`export function EditBarDockHost() { return null; }`),
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
      "./SplitWorkspace": dataModule(`
        export function useRightPaneSlot() { return null; }
        export function useWorkspacePane() { return null; }
      `),
      "./use-advanced-autosave": dataModule(`
        export function useAdvancedAutoSave() {
          return { state: "saved", flushLatest: async () => ({ ok: true }), retry: async () => {} };
        }
      `),
      "./use-advanced-recovery": dataModule(`export function useAdvancedRecovery() {}`),
      "./workbench-routes": dataModule(`
        export function editBarOwnershipForItem() { return "host"; }
      `),
    })
    ))();
}

async function withDom(run) {
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
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (element) => act(async () => root.render(element));
  const find = (selector) => container.querySelector(selector);
  const findAll = (selector) => [...container.querySelectorAll(selector)];
  try {
    await run({ window, render, find, findAll });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("第一行可点击元素全部落在 GLOBAL_ROW_SLOTS；非 download 动作在编辑栏", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  const { resetPluginModeCache } = await import(
    "../src/shell/plugin-chrome/plugin-mode-store.ts"
  );
  const { resetPluginPageCache } = await import(
    "../src/shell/plugin-chrome/plugin-page-store.ts"
  );
  resetPluginModeCache();
  resetPluginPageCache();

  await withDom(async ({ render, find, findAll }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: {
          key: "creation:grid-1",
          source: "creation",
          id: "grid-1",
          title: "表格",
          kind: "document",
          siteId: "study",
          favorite: false,
          meta: {},
        },
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          actions: [
            { id: "recompute", label: "重新计算", onTrigger() {} },
            {
              id: "export-xlsx",
              label: "导出表格",
              group: "download",
              onTrigger() {},
            },
          ],
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );

    const row =
      find("[data-plugin-global-row]") ||
      find("[data-advanced-workspace-actions]");
    assert.ok(row, "第一行没渲染出来");
    const clickables = [
      ...row.querySelectorAll("button, a, [role=button]"),
    ];
    assert.ok(clickables.length > 0, "第一行一个可点击元素都没有");
    for (const node of clickables) {
      const slot = node.closest("[data-global-row-slot]");
      assert.ok(
        slot,
        `第一行有一个没有槽位的可点击元素：${node.getAttribute("aria-label") || node.textContent}`,
      );
      const value = slot.getAttribute("data-global-row-slot");
      assert.ok(
        GLOBAL_ROW_SLOTS.includes(value),
        `第一行槽位 ${value} 不在 GLOBAL_ROW_SLOTS 里`,
      );
    }
    assert.equal(
      row.querySelector('[data-workspace-action-id="recompute"]'),
      null,
      "非 download 动作还画在第一行",
    );
    const editBar = find("[data-workspace-edit-bar]");
    assert.ok(editBar, "编辑栏没出现");
    assert.ok(
      editBar.querySelector('[data-workspace-action-id="recompute"]'),
      "非 download 动作没有进编辑栏文档段",
    );
    assert.equal(
      findAll("[data-plugin-mode-toggle]").length,
      0,
      "第一行还挂着专业模式开关",
    );
  });
});
