import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { readFileSync } from "node:fs";

import { resetPluginModeCache } from "../src/shell/plugin-chrome/plugin-mode-store.ts";
import { resetPluginPageCache } from "../src/shell/plugin-chrome/plugin-page-store.ts";

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
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  try {
    await run({ render, find, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("编辑栏只在编辑页存在：无选中也在；切 pro / aux 后消失；切回再出现", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  resetPluginModeCache();
  resetPluginPageCache();

  await withDom(async ({ render, find, click }) => {
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
          mode: { current: "normal", setMode() {} },
          pages: {
            aux: [{ id: "code", label: "Code", kind: "aux" }],
          },
        },
        onClose() {},
      }),
    );

    assert.ok(
      find("[data-workspace-edit-bar]"),
      "编辑页没有编辑栏（没选中也不该消失）",
    );
    assert.ok(
      find("[data-workspace-edit-bar]").getAttribute("data-empty") !== null,
      "没选中且没有文档动作时 data-empty 应为真",
    );

    await click(find('[data-plugin-page="pro"]'));
    assert.equal(
      find("[data-workspace-edit-bar]"),
      null,
      "专业编辑页还留着编辑栏",
    );

    await click(find('[data-plugin-page="code"]'));
    assert.equal(find("[data-workspace-edit-bar]"), null, "aux 页还留着编辑栏");

    await click(find('[data-plugin-page="artifact"]'));
    assert.ok(find("[data-workspace-edit-bar]"), "切回编辑页，编辑栏没回来");
  });
});

test("文档段按钮有可见文字；没有 icon 的动作不画缺省齿轮", async () => {
  const source = readFileSync(
    "src/shell/plugin-chrome/EditBarDocumentSegment.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /action\.icon \|\| ["']settings["']/);
  assert.match(source, /from ["']\.\.\/\.\.\/ui\/Button["']/);
  assert.match(source, /<Button[\s\S]*?<span>\{label\}<\/span>/);
  assert.doesNotMatch(source, /<IconButton/);

  const url = await compileModule(
    "src/shell/plugin-chrome/EditBarDocumentSegment.tsx",
    {
      "../../i18n/ui/useUI": ttStubUrl,
      "../../ui/Button": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function Button({ children, ...rest }) {
          return jsx("button", { ...rest, children });
        }
      `),
      "../AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedEditorIcon({ name }) {
          return jsx("svg", { "data-icon": name });
        }
      `),
    },
  );
  const { EditBarDocumentSegment } = await import(url);

  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(EditBarDocumentSegment, {
        actions: [
          { id: "grid-recalculate", label: "重新计算", onTrigger() {} },
          {
            id: "with-icon",
            label: "带图标",
            icon: "download",
            onTrigger() {},
          },
        ],
        onTrigger() {},
      }),
    );
    const recalc = find('[data-workspace-action-id="grid-recalculate"]');
    assert.ok(recalc, "重新计算按钮没画出来");
    assert.match(recalc.textContent || "", /重新计算/);
    assert.equal(
      recalc.querySelector("[data-icon]"),
      null,
      "没有 icon 的动作不该画出缺省齿轮",
    );
    const withIcon = find('[data-workspace-action-id="with-icon"]');
    assert.match(withIcon.textContent || "", /带图标/);
    assert.equal(withIcon.querySelector("[data-icon]")?.getAttribute("data-icon"), "download");
  });
});
