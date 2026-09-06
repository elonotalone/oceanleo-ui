// ============================================================================
// X1（规范 v2 §2 / §4）：保存 / 上传 / 下载 与编辑永不混住
// ----------------------------------------------------------------------------
//   · 编辑栏文档段只收 `group === "edit"`（缺省）；save / download 一律不进编辑栏；
//     `adapter.upload` 不再在编辑栏长出「从本地添加到画布」。
//   · 第一行 `save-state` 槽是一个保存菜单：本体显示状态，点开列出 save 组动作；
//     没有 save 组但有 `persistence.flush` 时只列「立即保存」。
//   · 素材库抽屉（use-inline-advanced-panels 的 materials 面板）第一项是「从本地上传」，
//     点它触发壳里那个隐藏 <input type=file>。
//   · 第一行可点击元素仍然全部落在 GLOBAL_ROW_SLOTS（6 槽不变）。
// ============================================================================
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

const FORBIDDEN_EDIT_BAR_LABELS = [
  "保存",
  "套用",
  "Apply",
  "Save",
  "Reload",
  "Discard",
  "从本地添加到画布",
  "另存为二创副本",
  "截图存入我的库",
  "收起编辑栏",
];

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
        export function FloatingContextToolbar({ children }) { return children ?? null; }
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
          return {
            state: globalThis.__x1AutoSaveState || "saved",
            flushLatest: async () => {
              globalThis.__x1FlushCalls = (globalThis.__x1FlushCalls || 0) + 1;
              return { ok: true };
            },
            retry: async () => {},
          };
        }
      `),
      "./use-advanced-recovery": dataModule(`export function useAdvancedRecovery() {}`),
      "./workbench-routes": dataModule(`
        export function editBarOwnershipForItem() { return "host"; }
      `),
    })
    ))();
}

function loadPanels() {
  return (async () =>
    import(
      await compileModule("src/shell/use-inline-advanced-panels.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
        "./InlineEditorMaterialPanel": dataModule(`
          import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
          export function InlineEditorMaterialPanel() {
            return jsx("div", { "data-probe-material-panel": true });
          }
        `),
        "./plugin-chrome/PluginAgentPanel": dataModule(`
          export function PluginAgentPanel() { return null; }
        `),
        "./SplitWorkspace": dataModule(`
          export function useConsoleAgentFocus() { return null; }
        `),
        "./plugin-theme": dataModule(`
          export function PluginThemeScope({ children }) { return children ?? null; }
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
    HTMLInputElement: window.HTMLInputElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
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
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  try {
    await run({ window, render, find, findAll, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

async function resetStores() {
  const { resetPluginModeCache } = await import(
    "../src/shell/plugin-chrome/plugin-mode-store.ts"
  );
  const { resetPluginPageCache } = await import(
    "../src/shell/plugin-chrome/plugin-page-store.ts"
  );
  resetPluginModeCache();
  resetPluginPageCache();
}

const gridItem = {
  key: "creation:grid-1",
  source: "creation",
  id: "grid-1",
  title: "表格",
  kind: "document",
  siteId: "study",
  favorite: false,
  meta: {},
};

function visibleLabel(node) {
  return (node.textContent || node.getAttribute("aria-label") || "").trim();
}

function assertGlobalRowAllowlist(row) {
  const clickables = [...row.querySelectorAll("button, a, [role=button]")];
  assert.ok(clickables.length > 0, "第一行一个可点击元素都没有");
  for (const node of clickables) {
    const slot = node.closest("[data-global-row-slot]");
    assert.ok(slot, `第一行有一个没有槽位的可点击元素：${visibleLabel(node)}`);
    assert.ok(
      GLOBAL_ROW_SLOTS.includes(slot.getAttribute("data-global-row-slot")),
      `第一行槽位 ${slot.getAttribute("data-global-row-slot")} 不在 GLOBAL_ROW_SLOTS 里`,
    );
  }
  assert.equal(GLOBAL_ROW_SLOTS.length, 6, "第一行槽位数变了");
}

test("编辑栏只收 edit 组；save 进保存菜单、download 进下载菜单、upload 不进编辑栏", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  await resetStores();
  globalThis.__x1AutoSaveState = "saved";
  const triggered = [];

  await withDom(async ({ window, render, find, findAll, click }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: gridItem,
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          actions: [
            { id: "recompute", label: "重新计算", onTrigger: () => triggered.push("recompute") },
            { id: "apply-draft", label: "套用草稿", group: "save", onTrigger: () => triggered.push("apply-draft") },
            { id: "save-site", label: "保存", group: "save", onTrigger: () => triggered.push("save-site") },
            { id: "export-xlsx", label: "导出表格", group: "download", onTrigger() {} },
          ],
          upload: { accept: "*/*", onFiles() {} },
          persistence: { editRevision: 1, dirty: false, flush: async () => ({ ok: true }) },
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );

    const editBar = find("[data-workspace-edit-bar]");
    assert.ok(editBar, "编辑栏没出现");
    assert.ok(
      editBar.querySelector('[data-workspace-action-id="recompute"]'),
      "edit 组动作没进编辑栏文档段",
    );
    for (const id of ["apply-draft", "save-site", "export-xlsx", "local-upload"]) {
      assert.equal(
        editBar.querySelector(`[data-workspace-action-id="${id}"]`),
        null,
        `${id} 不该出现在编辑栏`,
      );
    }
    for (const button of editBar.querySelectorAll("button")) {
      const label = visibleLabel(button);
      assert.ok(label.length > 0, "编辑栏里有空标签按钮");
      assert.ok(
        !FORBIDDEN_EDIT_BAR_LABELS.includes(label),
        `编辑栏里出现了非编辑动作「${label}」`,
      );
    }

    const row = find("[data-plugin-global-row]");
    assert.ok(row, "第一行没渲染出来");
    assertGlobalRowAllowlist(row);
    for (const id of ["recompute", "apply-draft", "save-site"]) {
      assert.equal(
        row.querySelector(`[data-workspace-action-id="${id}"]`),
        null,
        `${id} 直接画在第一行了（应该在菜单里）`,
      );
    }

    const launcher = row.querySelector(
      '[data-global-row-slot="save-state"] [data-workspace-save-launcher]',
    );
    assert.ok(launcher, "save-state 槽里没有保存菜单按钮");
    assert.match(launcher.textContent || "", /已保存/, "保存按钮本体应显示状态");
    assert.equal(launcher.getAttribute("aria-haspopup"), "menu");
    assert.equal(launcher.getAttribute("aria-expanded"), "false");
    await click(launcher);
    assert.equal(launcher.getAttribute("aria-expanded"), "true");
    const menu = window.document.querySelector("[data-workspace-save-menu]");
    assert.ok(menu, "保存菜单没点开");
    assert.deepEqual(
      [...menu.querySelectorAll("[data-workspace-save-action-id]")].map(
        (node) => node.dataset.workspaceSaveActionId,
      ),
      ["apply-draft", "save-site"],
      "保存菜单应只列 save 组，且不出现「立即保存」",
    );
    assert.equal(
      menu.querySelector('[data-workspace-save-action-id="recompute"]'),
      null,
    );
    await click(menu.querySelector('[data-workspace-save-action-id="apply-draft"]'));
    assert.deepEqual(triggered, ["apply-draft"]);
    assert.equal(findAll("[data-plugin-mode-toggle]").length, 0);
  });
});

test("没有 save 组但能刷盘时，保存菜单只有「立即保存」，点它走 flush", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  await resetStores();
  globalThis.__x1AutoSaveState = "saved";
  globalThis.__x1FlushCalls = 0;

  await withDom(async ({ window, render, find, click }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: gridItem,
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          actions: [{ id: "recompute", label: "重新计算", onTrigger() {} }],
          persistence: { editRevision: 1, dirty: false, flush: async () => ({ ok: true }) },
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );
    const launcher = find("[data-workspace-save-launcher]");
    assert.ok(launcher);
    await click(launcher);
    const menu = window.document.querySelector("[data-workspace-save-menu]");
    assert.ok(menu, "保存菜单没点开");
    const items = [...menu.querySelectorAll("[data-workspace-save-action-id]")];
    assert.deepEqual(
      items.map((node) => node.dataset.workspaceSaveActionId),
      ["flush-now"],
    );
    assert.match(items[0].textContent || "", /立即保存/);
    await click(items[0]);
    assert.equal(globalThis.__x1FlushCalls, 1, "「立即保存」没有触发 flush");
  });
});

test("既没有 save 组也没有持久化时，保存槽只是状态，不弹菜单", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  await resetStores();
  globalThis.__x1AutoSaveState = "saved";

  await withDom(async ({ window, render, find, click }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: gridItem,
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );
    const launcher = find("[data-workspace-save-launcher]");
    assert.ok(launcher);
    assert.equal(launcher.getAttribute("aria-haspopup"), null);
    await click(launcher);
    assert.equal(window.document.querySelector("[data-workspace-save-menu]"), null);
    assertGlobalRowAllowlist(find("[data-plugin-global-row]"));
  });
});

test("素材库抽屉第一项是「从本地上传」，点它触发宿主的本地上传", async () => {
  const { useInlineAdvancedPanels } = await loadPanels();
  let uploads = 0;
  let api = null;

  await withDom(async ({ render, find, findAll, click }) => {
    function Host({ withUpload }) {
      const panels = useInlineAdvancedPanels({
        adapter: {
          id: "grid",
          label: "表格",
          stage: null,
          ...(withUpload ? { upload: { onFiles() {} } } : {}),
        },
        item: gridItem,
        siteId: "study",
        accent: "#6d5dfc",
        ownerId: "test-owner",
        pluginThemeId: null,
        workbenchMaterials: null,
        onLocalUpload: () => {
          uploads += 1;
        },
      });
      api = panels;
      return panels.fallbackDetail
        ? React.createElement(
            "div",
            { "data-probe-drawer": true },
            panels.fallbackDetail.content,
          )
        : null;
    }
    await render(React.createElement(Host, { withUpload: true }));
    await act(async () => api.openDrawer("materials"));
    const drawer = find("[data-probe-drawer]");
    assert.ok(drawer, "素材抽屉没打开");
    const uploadButton = drawer.querySelector("[data-workspace-local-upload]");
    assert.ok(uploadButton, "抽屉里没有「从本地上传」");
    assert.match(uploadButton.textContent || "", /从本地上传/);
    // 「第一项」：抽屉里第一个可点击元素就是它，素材面板排在它后面。
    const firstClickable = drawer.querySelector("button, a, [role=button]");
    assert.equal(firstClickable, uploadButton, "「从本地上传」不是抽屉第一项");
    const panel = drawer.querySelector("[data-probe-material-panel]");
    assert.ok(panel, "素材面板没了");
    assert.ok(
      uploadButton.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
      "素材面板排在了上传按钮前面",
    );
    await click(uploadButton);
    assert.equal(uploads, 1, "点「从本地上传」没有触发宿主上传");

    // 插件不接受上传时不给这一项，抽屉直接是素材面板。
    await render(React.createElement(Host, { withUpload: false }));
    await act(async () => api.openDrawer("materials"));
    assert.equal(findAll("[data-workspace-local-upload]").length, 0);
    assert.ok(find("[data-probe-material-panel]"));
  });
});
