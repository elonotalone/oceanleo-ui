import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const ttStubUrl = dataModule(`
  const tt = (value, vars) =>
    String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
      vars && key in vars ? String(vars[key]) : match,
    );
  export function useUI() {
    return tt;
  }
`);

const toastStubUrl = dataModule(`
  export function useToast() {
    const handle = {
      id: "t",
      dismiss() {},
      success() {},
      error() {},
      info() {},
      loading() {},
    };
    return {
      success(title) {
        globalThis.__w3Toasts = globalThis.__w3Toasts || [];
        globalThis.__w3Toasts.push(title);
        return handle;
      },
      error() { return handle; },
      info() { return handle; },
      loading() { return handle; },
      show() { return handle; },
      dismiss() {},
      dismissAll() {},
    };
  }
`);

function durableItem(overrides = {}) {
  const artifactId =
    overrides.artifactId || "21c1e4d9-0818-4bbe-ae33-b4d01a5beafd";
  const revisionId = overrides.revisionId || "rev-w3";
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "需签字盖章页清单",
    kind: "document",
    siteId: "library",
    favorite: false,
    artifactId,
    revisionId,
    artifactType: "document",
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      artifactType: "document",
      access: {
        canRead: true,
        canPreview: true,
        canEdit: true,
        canFork: true,
        canInsert: true,
        canReplace: true,
        canFavorite: true,
        canBind: true,
        canExportSource: true,
      },
      integrity: { ok: true, code: "ok", reason: "" },
      renditions: {},
    },
    meta: {},
    ...overrides,
  };
}

const artifactClientStubUrl = dataModule(`
  export async function setArtifactFavorite(item, favorite) {
    const delay = Number(globalThis.__w3FavoriteDelay || 0);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    globalThis.__w3Favorites = globalThis.__w3Favorites || [];
    globalThis.__w3Favorites.push({
      artifactId: item.artifactId,
      revisionId: item.revisionId,
      favorite,
    });
    if (globalThis.__w3FavoriteFail) {
      return { ok: false, error: "操作失败，请重试" };
    }
    return {
      ok: true,
      data: {
        ...item,
        favorite,
        artifactId: item.artifactId,
        revisionId: item.revisionId,
      },
    };
  }
  export async function listMyArtifacts() {
    return {
      ok: true,
      data: {
        items: [
          {
            id: "mine-1",
            artifactId: "art-mine-1",
            revisionId: "rev-mine",
            title: "我的文稿",
            kind: "document",
            favorite: false,
            meta: {},
          },
        ],
        nextCursor: null,
        total: 1,
      },
    };
  }
`);

const actionBarUrl = await compileModule(
  "src/shell/AdvancedWorkspaceActionBar.tsx",
  {
    "../i18n/ui/useUI": ttStubUrl,
    "../ui/Toast": toastStubUrl,
    "./SplitWorkspace": dataModule(
      `export function useRightPaneSlot() { return null; }`,
    ),
    "./artifact-client": artifactClientStubUrl,
  },
);
const { AdvancedWorkspaceActionBar } = await import(actionBarUrl);
const { shareUrlForLibraryItem } = await import(
  await compileModule("src/shell/editor-item-social-chrome.tsx", {
    "../i18n/ui/useUI": ttStubUrl,
    "../ui/Toast": toastStubUrl,
    "./artifact-client": artifactClientStubUrl,
  })
);

const noop = () => {};
function actionBarProps(overrides = {}) {
  const { adapter, ...rest } = overrides;
  return {
    adapter: {
      id: "grid",
      label: "表格",
      stage: null,
      persistence: { dirty: false, editRevision: 0, flush: noop },
      ...adapter,
    },
    item: durableItem(),
    autoSaveState: "saved",
    activeLibraryPanelId: null,
    onBack: noop,
    onOpenLibrary: noop,
    onRetrySave: noop,
    onTriggerAction: noop,
    ...rest,
  };
}

// D1（2026-10-23）：分享 / 收藏不再是第一行的独立按钮，状态与动作收进 useEditorItemSocial，
// 由 `···` 菜单画。两条身份保护（链接带当前条目、迟到的收藏结果不改新条目）照旧，测在 hook 上。
function socialProbe(useEditorItemSocial) {
  return function SocialProbe({ item }) {
    const social = useEditorItemSocial(item);
    return React.createElement(
      "div",
      { "data-editor-item-social": true, "data-artifact-id": social.artifactId || undefined },
      React.createElement("button", { "data-editor-chrome-action": "share", onClick: () => void social.share() }),
      React.createElement("button", {
        "data-editor-chrome-action": "favorite",
        "aria-pressed": String(social.favorite),
        onClick: () => void social.toggleFavorite(),
      }),
    );
  };
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
    url: "https://p.dev.oceanleo.com/library",
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
    CustomEvent: window.CustomEvent,
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
    await run({ window, render, find, click, container });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("W3: 素材库/我的库是同线宽描边图标，无障碍名仍是原句", () => {
  const html = renderToStaticMarkup(
    React.createElement(AdvancedWorkspaceActionBar, actionBarProps()),
  );
  assert.match(html, /data-workspace-library-panel="materials"/);
  assert.match(html, /data-workspace-library-panel="mine"/);
  assert.match(html, /aria-label="素材库"/);
  assert.match(html, /aria-label="我的库"/);
  assert.doesNotMatch(
    html.replace(/aria-label="[^"]*"/g, "").replace(/title="[^"]*"/g, ""),
    />素材库</,
  );
  assert.doesNotMatch(
    html.replace(/aria-label="[^"]*"/g, "").replace(/title="[^"]*"/g, ""),
    />我的库</,
  );
});

test("W3: 保存失败只留图标，错误进 title，状态字仍给读屏", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AdvancedWorkspaceActionBar,
      actionBarProps({
        autoSaveState: "error",
        autoSaveError: "保存被拒绝（integrity-failed）",
      }),
    ),
  );
  assert.match(html, /data-workspace-save-launcher/);
  assert.match(html, /保存被拒绝（integrity-failed）/);
  assert.match(html, /sr-only/);
  assert.match(html, /保存遇到问题/);
});

test("W3: share URL 带上 LibraryItem 身份", () => {
  const item = durableItem();
  const previous = globalThis.window;
  globalThis.window = {
    location: { href: "https://p.dev.oceanleo.com/library?item=stale" },
  };
  try {
    const url = shareUrlForLibraryItem(item);
    assert.match(url, /item=21c1e4d9-0818-4bbe-ae33-b4d01a5beafd/);
    assert.doesNotMatch(url, /item=stale/);
  } finally {
    if (previous) globalThis.window = previous;
    else delete globalThis.window;
  }
});

test("shared editor top row restores its close control and invokes the host close", async () => {
  let closed = 0;
  await withDom(async ({ render, find, click }) => {
    await render(React.createElement(AdvancedWorkspaceActionBar, actionBarProps({
      showClose: true,
      onClose() { closed += 1; },
    })));
    await click(find('[data-global-row-slot="close"] button'));
    assert.equal(closed, 1);
  });
});

test("W3: 分享把当前条目 URL 交给剪贴板；收藏走 setArtifactFavorite 且核对身份", async () => {
  globalThis.__w3Favorites = [];
  globalThis.__w3Toasts = [];
  await withDom(async ({ window, render, find, click }) => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copied = text;
        },
      },
    });
    const item = durableItem();
    let opened = null;
    await render(
      React.createElement(
        AdvancedWorkspaceActionBar,
        actionBarProps({
          item,
          onOpenLibrary: (id) => {
            opened = id;
          },
        }),
      ),
    );
    // D1（2026-10-23）：分享 / 收藏在 `···` 菜单里，点了做的事与原来的独立按钮一样。
    assert.equal(find('[data-editor-chrome-action="share"]'), null, "分享还是第一行的独立按钮");
    const openMore = async () => {
      await click(find('[data-global-row-slot="more"] [data-workspace-more-launcher]'));
      return window.document.querySelector("[data-workspace-more-menu]");
    };
    let menu = await openMore();
    assert.ok(menu, "··· 菜单没点开");
    const share = menu.querySelector('[data-editor-chrome-action="share"]');
    assert.ok(share, "分享按钮没画出来");
    assert.ok(menu.querySelector('[data-editor-chrome-action="favorite"]'), "收藏按钮没画出来");
    await click(share);
    await waitUntil(() => (globalThis.__w3Toasts || []).length > 0);
    assert.match(String(window.__copied || ""), /item=21c1e4d9-0818-4bbe-ae33-b4d01a5beafd/);
    assert.deepEqual(globalThis.__w3Toasts, ["已复制"]);
    menu = await openMore();
    const favorite = menu.querySelector('[data-editor-chrome-action="favorite"]');
    assert.equal(favorite.hasAttribute("disabled"), false);
    assert.match(favorite.textContent || "", /收藏/);
    await click(favorite);
    await waitUntil(() => (globalThis.__w3Favorites || []).length > 0);
    assert.deepEqual(globalThis.__w3Favorites, [
      {
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        favorite: true,
      },
    ]);
    await waitUntil(() => (globalThis.__w3Toasts || []).includes("已加入收藏"));
    assert.ok(globalThis.__w3Toasts.includes("已加入收藏"), "收藏成功没有看得见的反馈");
    menu = await openMore();
    assert.match(
      menu.querySelector('[data-editor-chrome-action="favorite"]').textContent || "",
      /取消收藏/,
      "收藏后菜单项没变成「取消收藏」",
    );
    await click(find('[data-workspace-library-panel="mine"]'));
    assert.equal(opened, "mine");
  });
});

test("W3: 独立库页点我的库打开面板且不卸编辑器", async () => {
  const { InlineAdvancedWorkbenchShell } = await import(
    await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
      "./AgentChat": dataModule(`export function AgentChat({workspaceContent}) { return workspaceContent; }`),
      "./WorkspaceSession": dataModule(`export function useOptionalWorkspaceSession(){return null;} export function WorkspaceSessionProvider({children}){return children;}`),
      "../i18n/ui/useUI": ttStubUrl,
      "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
      "./advanced-layout-context": dataModule(`
        import { createContext } from ${JSON.stringify(reactUrl)};
        export const AdvancedLayoutContext = createContext(null);
        export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
        export function focusAdvancedToolsTrigger() {}
        export function useAdvancedToolsLauncherRegistration() {}
      `),
      "./AdvancedStageControls": dataModule(
        `export function AdvancedStageControls() { return null; }`,
      ),
      "./AdvancedWorkbenchStage": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
      `),
      "./FloatingContextToolbar": dataModule(`
        import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
        export function FloatingContextToolbar({ children, documentSegment }) {
          return jsxs("div", { "data-workspace-edit-bar": true, children: [children ?? null, documentSegment ?? null] });
        }
        export function useFloatingContextToolbar() {
          return { mode: "docked", dropActive: false, leading: null, trailing: null };
        }
      `),
      "./EditBarDockHost": dataModule(
        `export function EditBarDockHost() { return null; }`,
      ),
      "./inline-advanced-workbench-drop": dataModule(`
        export function useInlineAdvancedWorkbenchDrop() {
          return { dropMessage: "", performUpload() {}, handleDrop() {} };
        }
      `),
      "./use-inline-advanced-panels": dataModule(`
        import { useState } from ${JSON.stringify(reactUrl)};
        export function useInlineAdvancedPanels() {
          const [fallbackDetail, setFallbackDetail] = useState(null);
          const [activeDrawerId, setActiveDrawerId] = useState("");
          const [transientPanel, setTransientPanel] = useState(null);
          return {
            drawers: [],
            activeDrawerId,
            activeMaterialAction: null,
            transientPanel,
            fallbackDetail,
            openDrawer(id) {
              setTransientPanel(null);
              setActiveDrawerId(id);
              setFallbackDetail({ label: id, content: id });
            },
            openTransientPanel(id, label, content) {
              setTransientPanel({ id, label });
              setActiveDrawerId(id);
              setFallbackDetail({ label, content });
            },
            updateTransientPanel() {},
            closeDetail() {
              setFallbackDetail(null);
              setActiveDrawerId("");
              setTransientPanel(null);
            },
            closeDrawer() {},
            isPanelOpen(id) { return activeDrawerId === id; },
            editBarDrawers: [],
          };
        }
      `),
      "./advanced-session-context": dataModule(
        `export function useAdvancedSession() { return null; }`,
      ),
      "./workbench-material-provider": dataModule(
        `export function useWorkbenchMaterials() { return null; }`,
      ),
      "./SplitWorkspace": dataModule(`
        export function useRightPaneSlot() { return null; }
        export function useWorkspacePane() { return null; }
      `),
      "./use-advanced-autosave": dataModule(`
        export function useAdvancedAutoSave() {
          return {
            state: "saved",
            flushLatest: async () => ({ ok: true }),
            retry: async () => {},
            handOffToBackground() {
              globalThis.__w3HandOff = (globalThis.__w3HandOff || 0) + 1;
            },
          };
        }
      `),
      "./use-advanced-recovery": dataModule(
        `export function useAdvancedRecovery() {}`,
      ),
      "./workbench-routes": dataModule(`
        export * from ${JSON.stringify(new URL("../src/shell/workbench-routes.ts", import.meta.url).href)};
        export function editBarOwnershipForItem() { return "host"; }
      `),
      "../ui/Toast": toastStubUrl,
      "./advanced-leave-flush": dataModule(`
        export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
      `),
      "./artifact-client": artifactClientStubUrl,
    })
  );

  await withDom(async ({ window, render, find, click }) => {
    globalThis.__w3HandOff = 0;
    let closed = 0;
    const actions = [];
    window.addEventListener("oceanleo:workspace-action", (event) => {
      actions.push(event.detail);
    });
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: durableItem(),
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          mode: { current: "normal", setMode() {} },
        },
        onClose() {
          closed += 1;
        },
      }),
    );
    assert.ok(find("[data-inline-editor]"), "编辑器舞台没了");
    await click(find('[data-workspace-library-panel="mine"]'));
    await waitFor(find, '[data-inline-editor-mine-item="art-mine-1"]');
    assert.ok(find("[data-inline-editor]"), "点我的库把编辑器卸掉了");
    assert.ok(
      find("[data-inline-editor-mine-panel]"),
      "独立承载里我的库面板没打开",
    );
    assert.ok(find('[data-inline-editor-mine-item="art-mine-1"]'));
    assert.equal(
      find('[data-workspace-library-panel="mine"]').getAttribute("aria-pressed"),
      "true",
    );
    const pane = find("[data-editor-fallback-pane]");
    assert.ok(pane, "独立侧栏内容层没挂上");
    assert.match(pane.className, /data-agent-conversation/);
    await click(find('[data-inline-editor-mine-item="art-mine-1"]'));
    assert.equal(actions.length, 1, "点库条目没有发出 typed open");
    assert.equal(actions[0].action.tab, "mine");
    assert.equal(actions[0].action.itemId, "art-mine-1");
    assert.equal(actions[0].action.intent, "edit");
    assert.equal(globalThis.__w3HandOff, 1, "换条目没有走 leave/save handOff");
    assert.equal(closed, 0, "换条目把编辑器 onClose 掉了");
    assert.ok(find("[data-inline-editor]"), "换条目卸了当前编辑器舞台");
  });
});

async function waitUntil(predicate, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return true;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return Boolean(predicate());
}

async function waitFor(find, selector, tries = 40) {
  await waitUntil(() => find(selector), tries);
  return find(selector);
}

const frameStubs = {
  "../../i18n/ui/useUI": ttStubUrl,
  "./agent-drawer-panel": dataModule(`
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
  `),
  "../plugin-theme": dataModule(`
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
    export function usePluginThemePortal() { return null; }
  `),
  "../SplitWorkspace": dataModule(`
    export function useConsoleAgentFocus() { return null; }
    export function useRightPaneSlot() { return null; }
    export function useWorkspacePane() { return null; }
  `),
  "../PluginChromeEditBarGestureLayer": dataModule(`
    export function PluginChromeEditBarGestureLayer({ children }) {
      return children;
    }
  `),
  "../FloatingContextToolbar": dataModule(`
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
  `),
  "../artifact-client": artifactClientStubUrl,
  "../../ui/Toast": toastStubUrl,
  "../AdvancedEditorIcon": dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function AdvancedEditorIcon({ name, className }) {
      return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
    }
  `),
  "./plugin-mode": dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function PluginModeToggle() {
      return jsx("button", { type: "button", "data-plugin-mode-toggle": true });
    }
    export function PluginModeAdapterBridge() { return null; }
  `),
};

let frameModulePromise;
function loadFrame() {
  if (!frameModulePromise) {
    frameModulePromise = compileModule(
      "src/shell/plugin-chrome/PluginChromeFrame.tsx",
      frameStubs,
    ).then((url) => import(url));
  }
  return frameModulePromise;
}

test("W3: 自有 chrome 画出我的库和带身份的分享/收藏，点我的库不卸舞台", async () => {
  const { PluginChromeFrame } = await loadFrame();
  globalThis.__w3Favorites = [];
  globalThis.__w3Toasts = [];
  await withDom(async ({ window, render, find, click }) => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copied = text;
        },
      },
    });
    const item = durableItem();
    await render(
      React.createElement(PluginChromeFrame, {
        pluginId: "design-canvas",
        title: "设计画布",
        item,
        children: React.createElement("div", { "data-test-stage": true }, "舞台"),
      }),
    );
    assert.ok(find("[data-plugin-chrome-stage] [data-test-stage]"), "舞台没了");
    assert.ok(find('[data-workspace-library-panel="mine"]'));
    assert.equal(
      find('[data-workspace-library-panel="mine"]').getAttribute("aria-label"),
      "我的库",
    );
    assert.equal(find("[data-plugin-theme-toggle]"), null, "自有 chrome 还有主题键");
    assert.equal(
      find("[data-editor-item-social]").getAttribute("data-artifact-id"),
      item.artifactId,
    );
    const openMore = async () => {
      await click(find('[data-global-row-slot="more"] [data-workspace-more-launcher]'));
      return window.document.querySelector("[data-workspace-more-menu]");
    };
    let menu = await openMore();
    const share = menu?.querySelector('[data-editor-chrome-action="share"]');
    assert.ok(share, "自有 chrome 的 ··· 没有分享");
    assert.ok(menu.querySelector('[data-editor-chrome-action="favorite"]'), "自有 chrome 的 ··· 没有收藏");
    await click(share);
    await waitUntil(() => (globalThis.__w3Toasts || []).length > 0);
    assert.match(
      String(window.__copied || ""),
      /item=21c1e4d9-0818-4bbe-ae33-b4d01a5beafd/,
    );
    assert.deepEqual(globalThis.__w3Toasts, ["已复制"]);
    // W01 R2：宿主页面没有任何 toast 在渲染时（门户实测如此），反馈必须画在 `···` 旁边。
    await waitUntil(() => find("[data-more-menu-feedback]"));
    const feedback = find("[data-more-menu-feedback]");
    assert.equal(feedback?.getAttribute("data-more-menu-feedback"), "notice", "没有 toast 时分享成功看不见");
    assert.equal(feedback.textContent, "已复制");
    assert.notEqual(feedback.className, "sr-only");
    // 页面上有 toast 在渲染时不重复显示。
    const viewport = window.document.createElement("div");
    viewport.setAttribute("data-leo-toast-viewport", "");
    window.document.body.appendChild(viewport);
    menu = await openMore();
    await click(menu.querySelector('[data-editor-chrome-action="favorite"]'));
    await waitUntil(() => (globalThis.__w3Favorites || []).length > 0);
    await waitUntil(() => (globalThis.__w3Toasts || []).includes("已加入收藏"));
    assert.equal(find("[data-more-menu-feedback]"), null, "有 toast 时 ··· 旁又画了一遍");
    viewport.remove();
    assert.deepEqual(globalThis.__w3Favorites, [
      {
        artifactId: item.artifactId,
        revisionId: item.revisionId,
        favorite: true,
      },
    ]);
    const actions = [];
    window.addEventListener("oceanleo:workspace-action", (event) => {
      actions.push(event.detail);
    });
    await click(find('[data-workspace-library-panel="mine"]'));
    await waitFor(find, '[data-inline-editor-mine-item="art-mine-1"]');
    assert.ok(find("[data-plugin-chrome-stage] [data-test-stage]"), "点我的库卸了舞台");
    assert.ok(find('[data-plugin-chrome-panel="mine"]'));
    assert.ok(find('[data-inline-editor-mine-item="art-mine-1"]'));
    const panelBody = find("[data-plugin-chrome-panel-body]");
    assert.ok(panelBody);
    assert.match(panelBody.className, /data-agent-conversation/);
    await click(find('[data-inline-editor-mine-item="art-mine-1"]'));
    assert.equal(actions.length, 1, "自有 chrome 点库条目没有发出 typed open");
    assert.equal(actions[0].action.itemId, "art-mine-1");
    assert.equal(actions[0].action.intent, "edit");
  });
});

test("W3: host chrome 不自画库钮和分享收藏，舞台仍在", async () => {
  const { PluginChromeFrame } = await loadFrame();
  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(PluginChromeFrame, {
        pluginId: "design-canvas",
        title: "设计画布",
        chrome: "host",
        item: durableItem(),
        children: React.createElement("div", { "data-test-stage": true }, "舞台"),
      }),
    );
    assert.ok(find("[data-plugin-chrome-stage] [data-test-stage]"));
    assert.equal(find('[data-workspace-library-panel="mine"]'), null);
    assert.equal(find('[data-editor-chrome-action="share"]'), null);
    assert.equal(find('[data-editor-chrome-action="favorite"]'), null);
  });
});

test("W3-r2: 收藏过期请求不得改新打开条目的图标", async () => {
  const { useEditorItemSocial } = await import(
    await compileModule("src/shell/editor-item-social-chrome.tsx", {
      "../i18n/ui/useUI": ttStubUrl,
      "../ui/Toast": toastStubUrl,
      "./artifact-client": artifactClientStubUrl,
    })
  );
  const EditorItemSocialChrome = socialProbe(useEditorItemSocial);
  globalThis.__w3Favorites = [];
  globalThis.__w3FavoriteDelay = 50;
  try {
    await withDom(async ({ render, find, click }) => {
      const first = durableItem();
      const second = durableItem({
        artifactId: "21c1e4d9-0818-4bbe-ae33-bbbbbbbbbbbb",
        id: "21c1e4d9-0818-4bbe-ae33-bbbbbbbbbbbb",
        revisionId: "rev-next",
        favorite: false,
      });
      await render(React.createElement(EditorItemSocialChrome, { item: first }));
      await click(find('[data-editor-chrome-action="favorite"]'));
      await render(React.createElement(EditorItemSocialChrome, { item: second }));
      await waitUntil(() => (globalThis.__w3Favorites || []).length > 0);
      const star = find('[data-editor-chrome-action="favorite"]');
      assert.equal(star.getAttribute("aria-pressed"), "false");
      assert.equal(
        find("[data-editor-item-social]").getAttribute("data-artifact-id"),
        second.artifactId,
      );
    });
  } finally {
    globalThis.__w3FavoriteDelay = 0;
  }
});

test("W3-r2: 独立侧栏空对话与长对话走 stretch，控制面板自己滚", async () => {
  const { InlineAdvancedWorkbenchShell } = await import(
    await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
      "./AgentChat": dataModule(`export function AgentChat({workspaceContent}) { return workspaceContent; }`),
      "./WorkspaceSession": dataModule(`export function useOptionalWorkspaceSession(){return null;} export function WorkspaceSessionProvider({children}){return children;}`),
      "../i18n/ui/useUI": ttStubUrl,
      "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
      "../ui/Toast": toastStubUrl,
      "./advanced-layout-context": dataModule(`
        import { createContext } from ${JSON.stringify(reactUrl)};
        export const AdvancedLayoutContext = createContext(null);
        export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
        export function focusAdvancedToolsTrigger() {}
        export function useAdvancedToolsLauncherRegistration() {}
      `),
      "./AdvancedStageControls": dataModule(
        `export function AdvancedStageControls() { return null; }`,
      ),
      "./AdvancedWorkbenchStage": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedWorkbenchStage() {
          return jsx("div", { "data-probe-stage": true });
        }
      `),
      "./FloatingContextToolbar": dataModule(`
        import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
        export function FloatingContextToolbar({ children, documentSegment }) {
          return jsxs("div", { "data-workspace-edit-bar": true, children: [children ?? null, documentSegment ?? null] });
        }
        export function useFloatingContextToolbar() {
          return { mode: "docked", dropActive: false, leading: null, trailing: null };
        }
      `),
      "./EditBarDockHost": dataModule(
        `export function EditBarDockHost() { return null; }`,
      ),
      "./inline-advanced-workbench-drop": dataModule(`
        export function useInlineAdvancedWorkbenchDrop() {
          return { dropMessage: "", performUpload() {}, handleDrop() {} };
        }
      `),
      "./use-inline-advanced-panels": dataModule(`
        import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
        export function useInlineAdvancedPanels() {
          const long = Array.from({ length: 40 }, (_, index) => "行" + index).join(" ");
          return {
            drawers: [],
            activeDrawerId: "agent",
            activeMaterialAction: null,
            transientPanel: null,
            fallbackDetail: {
              label: "AI 助手",
              content: jsxs("div", {
                "data-agent-conversation": true,
                children: [
                  jsx("div", {
                    "data-agent-conversation-scroll": true,
                    children: long,
                  }),
                  jsx("div", {
                    "data-agent-composer-dock": true,
                    children: "composer",
                  }),
                ],
              }),
            },
            openDrawer() {},
            openTransientPanel() {},
            updateTransientPanel() {},
            closeDetail() {},
            closeDrawer() {},
            isPanelOpen() { return false; },
            editBarDrawers: [],
          };
        }
      `),
      "./advanced-session-context": dataModule(
        `export function useAdvancedSession() { return null; }`,
      ),
      "./workbench-material-provider": dataModule(
        `export function useWorkbenchMaterials() { return null; }`,
      ),
      "./SplitWorkspace": dataModule(`
        export function useRightPaneSlot() { return null; }
        export function useWorkspacePane() { return null; }
      `),
      "./use-advanced-autosave": dataModule(`
        export function useAdvancedAutoSave() {
          return { state: "saved", flushLatest: async () => ({ ok: true }), retry: async () => {} };
        }
      `),
      "./use-advanced-recovery": dataModule(
        `export function useAdvancedRecovery() {}`,
      ),
      "./workbench-routes": dataModule(`
        export * from ${JSON.stringify(new URL("../src/shell/workbench-routes.ts", import.meta.url).href)};
        export function editBarOwnershipForItem() { return "host"; }
      `),
      "./advanced-leave-flush": dataModule(`
        export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
      `),
      "./artifact-client": artifactClientStubUrl,
    })
  );
  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(InlineAdvancedWorkbenchShell, {
        item: durableItem(),
        adapter: {
          id: "grid",
          label: "表格",
          stage: React.createElement("div"),
          mode: { current: "normal", setMode() {} },
        },
        onClose() {},
      }),
    );
    const pane = find("[data-editor-fallback-pane]");
    assert.ok(pane);
    assert.match(pane.className, /overflow-y-auto/);
    assert.match(pane.className, /data-agent-conversation/);
    assert.ok(pane.querySelector("[data-agent-conversation]"));
    assert.ok(pane.querySelector("[data-agent-conversation-scroll]"));
    assert.ok(pane.querySelector("[data-agent-composer-dock]"));
    assert.equal(find("[data-inline-editor-mine-panel]"), null);
  });
});

// D1（2026-10-23）：有 `···` 宿主时邀请 / 回放进菜单（下一条）；这条锁的是没有宿主时的退路。
test("W3-r2: 邀请/回放各只有一个可聚焦触发器，真实动作仍触发", async () => {
  const { CollabActionSlotInner } = await import(
    await compileModule("src/shell/collab/CollabActionSlotInner.tsx", {
      "../../i18n/ui/useUI": ttStubUrl,
      "../../ui/Toast": toastStubUrl,
      "../../lib/im/client": dataModule(`
        export function useImEnabled() { return true; }
      `),
      "../AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedEditorIcon({ name, className }) {
          return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
        }
      `),
      "../replay/work/GenerateReplayButton": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function GenerateReplayPanel() { return null; }
        export function GenerateReplayButton({ iconOnly }) {
          return jsx("button", {
            type: "button",
            "data-generate-replay": true,
            "aria-label": "生成回放",
            "data-icon-only": iconOnly ? "true" : "false",
            onClick() { globalThis.__w3Replay = true; },
            children: jsx("span", { "data-icon": "history", "aria-hidden": "true" }),
          });
        }
      `),
      "./CollabInviteButton": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function CollabInviteDialog() { return null; }
        export function CollabInviteButton({ iconOnly }) {
          return jsx("button", {
            type: "button",
            "data-collab-invite": true,
            "aria-label": "邀请一起改",
            "data-icon-only": iconOnly ? "true" : "false",
            onClick() { globalThis.__w3Invite = true; },
            children: jsx("span", { "data-icon": "add", "aria-hidden": "true" }),
          });
        }
      `),
      "./CollabLockBanner": dataModule(`
        export function CollabLockBanner() { return null; }
      `),
      "./CollabPresenceBar": dataModule(`
        export function CollabPresenceBar() { return null; }
      `),
      "./pro-mode-lock": dataModule(`
        export function attachProModeLock() { return () => {}; }
      `),
      "./index": dataModule(`export {}`),
    })
  );
  globalThis.__w3Invite = false;
  globalThis.__w3Replay = false;
  await withDom(async ({ render, find, click, container }) => {
    await render(
      React.createElement(CollabActionSlotInner, {
        pluginThemeId: "grid",
        collab: {
          room: { id: "room-1" },
          artifact: {
            id: "art-1",
            title: "文稿",
            editorKind: "richdoc",
          },
        },
      }),
    );
    const invite = find("[data-collab-invite]");
    const replay = find("[data-generate-replay]");
    assert.ok(invite, "邀请触发器没画出来");
    assert.ok(replay, "回放触发器没画出来");
    assert.equal(container.querySelectorAll("[data-collab-invite]").length, 1);
    assert.equal(container.querySelectorAll("[data-generate-replay]").length, 1);
    assert.equal(container.querySelectorAll("button[aria-label='邀请一起改']").length, 1);
    assert.equal(container.querySelectorAll("button[aria-label='生成回放']").length, 1);
    assert.equal(invite.getAttribute("aria-label"), "邀请一起改");
    assert.equal(replay.getAttribute("aria-label"), "生成回放");
    assert.equal(invite.getAttribute("data-icon-only"), "true");
    assert.equal(replay.getAttribute("data-icon-only"), "true");
    assert.ok(invite.querySelector('[data-icon="add"]'));
    assert.ok(replay.querySelector('[data-icon="history"]'));
    await click(invite);
    await click(replay);
    assert.equal(globalThis.__w3Invite, true, "邀请图标没点到真实动作");
    assert.equal(globalThis.__w3Replay, true, "回放图标没点到真实动作");
  });
});
