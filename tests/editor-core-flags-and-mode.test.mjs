// ============================================================================
// L0 专业模式开关 + 双核 flag 的判据（W01 判据 3/4，editor-core-swap）
//
// 锁的是两条产品承诺，不是实现细节：
//   1. **默认普通模式**（R3）：没存过就是 normal；开关点一次记住，按用户 × 编辑器分开记。
//   2. **默认旧核**（§10 第 3 条）：13 件 flag 全部 legacy；本波不换核的那几件翻了也没用。
//
// 反面验证见 verdicts/W01-delivery.md：把默认档改成 pro / next，这里当场红。
// 注释里不举任何真实 CSS 类名（_COMMON §7b⑧：判据文件会被 Tailwind 扫进产物）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { beforeEach } from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

import {
  DEFAULT_EDITOR_CORE,
  EDITOR_CORE_IDS,
  EDITOR_CORE_SPECS,
  editorSwapsCore,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";

// localStorage 的最小替身：本文件只验读写与默认档，不需要真 DOM。
function installStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
    addEventListener() {},
  };
  return map;
}

beforeEach(() => {
  delete globalThis.window;
});

// ─── 判据 4：双核 flag ──────────────────────────────────────────────────────

test("13 件编辑器每件一个 flag，默认全部 legacy", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(EDITOR_CORE_IDS.length, 13, "13 件，一件不少");
  for (const id of EDITOR_CORE_IDS) {
    assert.equal(resolveEditorCore(id), "legacy", id);
  }
});

test("台账每件都指得回一个 owner 与一个接法", () => {
  for (const id of EDITOR_CORE_IDS) {
    const spec = EDITOR_CORE_SPECS[id];
    assert.match(spec.owner, /^W\d\d$/, `${id} owner`);
    assert.ok(
      ["native", "hosted", "none"].includes(spec.hosting),
      `${id} hosting`,
    );
    // 不换核的件必须显式写 null + hosting none，不许留半截状态。
    if (spec.nextCore === null) {
      assert.equal(spec.hosting, "none", `${id} 不换核就不该有接法`);
    } else {
      assert.notEqual(spec.hosting, "none", `${id} 换核就必须有接法`);
    }
  }
});

test("本波不换核的件恒为 legacy —— 翻 flag 也没用", () => {
  const noSwap = EDITOR_CORE_IDS.filter((id) => !editorSwapsCore(id));
  assert.ok(noSwap.length > 0, "至少有一件本波不换核（否则这条判据在空转）");
  for (const id of noSwap) {
    // 显式入参是最高优先级，连它都压不动 —— 因为没有新核可去，
    // 翻了只会渲染一个不存在的组件。
    assert.equal(resolveEditorCore(id, "next"), "legacy", id);
    installStorage();
    setEditorCoreOverride(id, "next");
    assert.equal(resolveEditorCore(id), "legacy", `${id} 本地覆盖也压不动`);
  }
});

test("换核的件：显式入参 > 本地覆盖 > 默认", () => {
  const swap = EDITOR_CORE_IDS.filter((id) => editorSwapsCore(id));
  assert.ok(swap.length >= 12, "本波换核的件应有 12 件");
  const id = swap[0];

  assert.equal(resolveEditorCore(id), "legacy", "没存过就是默认档");
  assert.equal(resolveEditorCore(id, "next"), "next", "显式入参生效");

  installStorage();
  setEditorCoreOverride(id, "next");
  assert.equal(resolveEditorCore(id), "next", "本地覆盖生效");
  assert.equal(
    resolveEditorCore(id, "legacy"),
    "legacy",
    "显式入参压过本地覆盖",
  );
  setEditorCoreOverride(id, null);
  assert.equal(resolveEditorCore(id), "legacy", "清掉覆盖回默认档");
});

test("非法档位不生效，回默认档（不是抛错，也不是当成 next）", () => {
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  const map = installStorage();
  map.set(`oceanleo.editor-core.${id}`, "NEXT");
  assert.equal(resolveEditorCore(id), "legacy");
  map.set(`oceanleo.editor-core.${id}`, "");
  assert.equal(resolveEditorCore(id), "legacy");
});

test("localStorage 抛异常时不炸，按默认档走", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("私密模式");
      },
      setItem() {
        throw new Error("私密模式");
      },
      removeItem() {
        throw new Error("私密模式");
      },
    },
    addEventListener() {},
  };
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  assert.equal(resolveEditorCore(id), "legacy");
  assert.doesNotThrow(() => setEditorCoreOverride(id, "next"));
});

// ─── 判据 3：L0 专业模式开关的持久化 ────────────────────────────────────────

test("默认普通模式；按用户 × 编辑器分开记", async () => {
  installStorage();
  const {
    DEFAULT_PLUGIN_MODE,
    currentPluginMode,
    pluginModeStorageKey,
    setPluginMode,
    resetPluginModeCache,
  } = await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
  resetPluginModeCache();

  assert.equal(DEFAULT_PLUGIN_MODE, "normal", "R3：默认普通模式");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginMode("grid", "pro");
  assert.equal(currentPluginMode("grid"), "pro", "点一次记住");
  // 「按编辑器」不是一句口号：切到另一件必须仍是普通模式。
  assert.equal(
    currentPluginMode("pdf"),
    "normal",
    "另一件编辑器不受影响",
  );
  assert.equal(pluginModeStorageKey("grid"), "oceanleo.editor-mode.grid");
  assert.notEqual(
    pluginModeStorageKey("grid"),
    pluginModeStorageKey("pdf"),
    "两件不许共用一个 key",
  );

  setPluginMode("grid", "normal");
  assert.equal(currentPluginMode("grid"), "normal", "能切回去");
});

test("存储里的非法值不当成 pro", async () => {
  const map = installStorage();
  const { currentPluginMode, resetPluginModeCache } = await import(
    "../src/shell/plugin-chrome/plugin-mode-store.ts"
  );
  for (const bad of ["PRO", "professional", "1", "true", ""]) {
    map.set("oceanleo.editor-mode.deck", bad);
    // 每轮清缓存，验的才是「解析这个值」而不是「上一轮缓存住的结果」。
    resetPluginModeCache();
    assert.equal(currentPluginMode("deck"), "normal", bad);
  }
});

// ─── 判据 3b：开关真的长在共用顶栏上，而且真的接到内核（真渲染） ─────────────
//
// 这一节**不判源码文本**，理由是 `verdicts/V1-red-1.md` 那次证伪：把顶栏里的开关
// 换成一个普通行内元素之后，上面那 8 例 8/8 仍然全绿 —— 而屏幕上的开关已经没了。
// 也就是说「顶栏真有开关」这条产品判据当时**没有任何守卫**：闸锁住的只是 store 的
// 默认档，锁不住「用户看得见、点得动、点了内核会动」。
//
// 第 9–13 例继续直接挂 Header：撤掉 Header 里的 Toggle 必须当场红（V1-red-1，已绿）。
// 后面另挂 `InlineAdvancedWorkbenchShell`：V1-red-3 证伪过，只挂 Header、测试自己塞
// `pluginThemeId` 时，把壳里那一处改成 `pluginThemeId={null}`，13/13 仍绿，用户十件
// 顶栏开关整组消失。壳那几例必须走生产 `pluginThemeIdForAdapter`，不许测试自己塞。
//
// jsdom 没有 layout，验「不许被藏 / 不许被挤成 0 宽」只钉 class token 与 hidden 属性，
// **不读 getBoundingClientRect、不假装验了可见性**（A-48）。
//
// 注释里不举任何真实 CSS 类名（`_COMMON.md §7b⑧`：判据文件会被 Tailwind 扫进产物）。

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

/**
 * `tt()` 的替身：原样返回并填占位符。
 *
 * **刻意只打这一个桩。** 顶栏本体（`AdvancedWorkspaceActionBar`）、按钮原语、
 * 主题开关全部用真的：打了桩就变成「验我自己写的替身」，而这一节要验的恰恰是
 * 那条用户真会看到的栏上有没有这个开关。
 */
const ttStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);

let headerPromise;
function loadHeader() {
  headerPromise ??= (async () =>
    import(
      await compileModule("src/shell/InlineAdvancedWorkbenchHeader.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
      })
    ))();
  return headerPromise;
}

/**
 * 「共用顶栏要覆盖哪些件」这张清单从**生产代码的表**里取，不在判据里手抄一份
 * （`_COMMON.md §7b⑪b`：清单类判据手抄一份就会漂移）。
 */
let themeModPromise;
function loadThemeMod() {
  themeModPromise ??= (async () =>
    import(
      await compileModule("src/shell/plugin-theme.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
      })
    ))();
  return themeModPromise;
}

let themeIdsPromise;
function loadPluginThemeIds() {
  themeIdsPromise ??= loadThemeMod().then((mod) =>
    Object.keys(mod.PLUGIN_THEME_SPECS),
  );
  return themeIdsPromise;
}

/**
 * 十件共用壳。Header **不打桩**——打了就又变成「测试自己塞 pluginThemeId」
 * （V1-red-3）。其余与开关无关的钩子才换成空实现，形状抄
 * `tests/edit-bar-dock-console.test.mjs` 挂这只壳的那张桩表。
 */
let shellPromise;
function loadShell() {
  shellPromise ??= (async () => {
    const layoutStubUrl = dataModule(`
      import { createContext } from ${JSON.stringify(reactUrl)};
      export const AdvancedLayoutContext = createContext(null);
      export const ADVANCED_TOOLS_PANEL_ID = "advanced-workbench-tools-panel";
      export function focusAdvancedToolsTrigger() {}
      export function useAdvancedToolsLauncherRegistration() {}
    `);
    const chromeStubUrl = dataModule(`
      export function advancedWorkbenchStyle(accent) {
        return { "--awb-accent": accent };
      }
    `);
    const confirmStubUrl = dataModule(`
      export function ConfirmDialog() { return null; }
    `);
    const floatingStubUrl = dataModule(`
      export function FloatingContextToolbar() { return null; }
      export function useFloatingContextToolbar() {
        return { mode: "docked", dropActive: false, leading: null, trailing: null };
      }
    `);
    const panelsStubUrl = dataModule(`
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
    `);
    const dropStubUrl = dataModule(`
      export function useInlineAdvancedWorkbenchDrop() {
        return { dropMessage: "", performUpload() {}, handleDrop() {} };
      }
    `);
    const sessionStubUrl = dataModule(`
      export function useAdvancedSession() { return null; }
    `);
    const materialsStubUrl = dataModule(`
      export function useWorkbenchMaterials() { return null; }
    `);
    const splitStubUrl = dataModule(`
      export function useRightPaneSlot() { return null; }
      export function useWorkspacePane() { return null; }
    `);
    const autosaveStubUrl = dataModule(`
      export function useAdvancedAutoSave() {
        return {
          state: "saved",
          flushLatest: async () => ({ ok: true }),
          retry: async () => {},
        };
      }
    `);
    const recoveryStubUrl = dataModule(`
      export function useAdvancedRecovery() {}
    `);
    const leaveStubUrl = dataModule(`
      export async function flushAdvancedWorkBeforeLeave() { return { ok: true }; }
    `);
    const routesStubUrl = dataModule(`
      export function editBarOwnershipForItem() { return "host"; }
    `);
    const stageStubUrl = dataModule(`
      import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
      export function AdvancedStageControls() { return null; }
      export function AdvancedWorkbenchStage() {
        return jsx("div", { "data-probe-stage": true });
      }
      export function EditBarDockHost() { return null; }
    `);
    return import(
      await compileModule("src/shell/InlineAdvancedWorkbenchShell.tsx", {
        "../i18n/ui/useUI": ttStubUrl,
        "../ui": confirmStubUrl,
        "./advanced-layout-context": layoutStubUrl,
        "./AdvancedStageControls": stageStubUrl,
        "./AdvancedWorkbenchStage": stageStubUrl,
        "./FloatingContextToolbar": floatingStubUrl,
        "./EditBarDockHost": stageStubUrl,
        "./advanced-leave-flush": leaveStubUrl,
        "./inline-advanced-workbench-drop": dropStubUrl,
        "./use-inline-advanced-panels": panelsStubUrl,
        "./advanced-session-context": sessionStubUrl,
        "./advanced-workbench-chrome": chromeStubUrl,
        "./workbench-material-provider": materialsStubUrl,
        "./SplitWorkspace": splitStubUrl,
        "./use-advanced-autosave": autosaveStubUrl,
        "./use-advanced-recovery": recoveryStubUrl,
        "./workbench-routes": routesStubUrl,
      })
    );
  })();
  return shellPromise;
}

/**
 * jsdom 取自 `fabric/node` 自带那份（仓内唯一可用），它的 `canvas` 依赖在本容器里
 * 装不上，所以先拿空对象把 require 缓存顶掉，建完再还回去。
 * 夹具抄 `tests/button-primitive.test.mjs:361-423`，退出时把全局**逐个还原**——
 * 本文件上半段那些纯 store 用例靠 `beforeEach` 删掉 `globalThis.window`，
 * 两边共处一份文件，不还原就会互相污染。
 */
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
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );

  try {
    await run({ window, render, find, click });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

function headerProps(overrides = {}) {
  return {
    adapter: { id: "grid", label: "表格", stage: null },
    autoSaveState: "saved",
    activeDrawerId: "",
    activeLibraryPanelId: null,
    drawers: [],
    accent: "#6d5dfc",
    pluginThemeId: null,
    onBack() {},
    onOpenDrawer() {},
    onCloseDrawer() {},
    onOpenTransientPanel() {},
    onOpenLibrary() {},
    onRetrySave() {},
    onUploadFiles() {},
    ...overrides,
  };
}

/**
 * 把「内核那一侧」也照真的建模：`setMode` 进来之后编辑器自己的档位跟着变。
 *
 * 这不是为了好看。写成一个静态的 `current: "normal"` 会让接线那条 effect 每轮都
 * 认为两边不一致而重复推送，于是断言得去容忍一串重复调用 —— 那正好会**掩盖**
 * 「打开时推一次」和「点一下推一次」的区别，而这两件事是分开的两条产品承诺。
 */
function modeHost(Header, pluginId, calls, extraProps = {}) {
  function ModeHost() {
    const [editorMode, setEditorMode] = React.useState("normal");
    return React.createElement(
      Header,
      headerProps({
        pluginThemeId: pluginId,
        adapter: {
          id: pluginId,
          label: "编辑器",
          stage: null,
          mode: {
            current: editorMode,
            setMode: (next) => {
              calls.push(next);
              setEditorMode(next);
            },
          },
        },
        ...extraProps,
      }),
    );
  }
  return React.createElement(ModeHost);
}

test("共用顶栏上真有 L0 专业模式开关，每一件都有", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  const pluginIds = await loadPluginThemeIds();
  assert.ok(
    pluginIds.length >= 10,
    `插件清单只剩 ${pluginIds.length} 件。十件 Advanced 编辑器共用这一条顶栏，` +
      "清单缩到 10 以下说明取表取错了（这条判据会因此空转）。",
  );

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    for (const pluginId of pluginIds) {
      resetPluginModeCache();
      await render(modeHost(InlineAdvancedWorkbenchHeader, pluginId, []));

      const toggle = find(`[data-plugin-mode-toggle="${pluginId}"]`);
      assert.ok(
        toggle,
        `${pluginId}：顶栏上没有 L0 专业模式开关。` +
          "开关只画在 PluginChromeFrame 里、而这条壳不走 Frame，就是 V1-red-1。",
      );
      assert.equal(
        toggle.tagName,
        "BUTTON",
        `${pluginId}：开关不是可点的按钮（换成行内元素也能让读源码的闸变绿）`,
      );
      assert.equal(toggle.disabled, false, `${pluginId}：开关被置灰了`);
      assert.match(
        toggle.getAttribute("aria-label") || "",
        /专业模式/,
        `${pluginId}：开关没有可读的名字`,
      );
      assert.equal(toggle.getAttribute("aria-pressed"), "false");

      // 光「DOM 里存在」不够：它必须长在那条共用顶栏**里面**，
      // 否则塞在一个没人渲染的角落也能骗过上面几条。
      const actionRow = find("[data-advanced-workspace-actions]");
      const headerRoot = find("[data-advanced-workbench-header]");
      assert.ok(actionRow, `${pluginId}：共用顶栏本体没渲染出来`);
      assert.ok(
        headerRoot && headerRoot.contains(actionRow),
        `${pluginId}：顶栏本体不在顶栏容器里`,
      );
      assert.ok(
        headerRoot && headerRoot.contains(toggle),
        `${pluginId}：开关渲染了，但不在共用顶栏里`,
      );
    }
  });
});

test("点顶栏开关：内核当场收到 setMode，档位也记住了", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    resetPluginModeCache();
    const calls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "grid", calls));

    const toggle = find('[data-plugin-mode-toggle="grid"]');
    assert.ok(toggle, "顶栏上没有开关");
    assert.deepEqual(calls, [], "刚打开、两边同档，不该推送");

    await click(toggle);
    assert.deepEqual(
      calls,
      ["pro"],
      "点了开关，内核没收到 setMode('pro')。" +
        "顶栏只改 localStorage 而不通知内核，就是 V1-red-1 里那句「点了也没有用」。",
    );
    assert.equal(currentPluginMode("grid"), "pro", "档位没记住");
    assert.equal(
      find('[data-plugin-mode-toggle="grid"]').getAttribute("aria-pressed"),
      "true",
      "开关自己没跟着变态（屏幕上看不出已经进了专业模式）",
    );
    assert.equal(
      find('[data-plugin-mode-toggle="grid"]').getAttribute("data-plugin-mode"),
      "pro",
    );

    await click(find('[data-plugin-mode-toggle="grid"]'));
    assert.deepEqual(calls, ["pro", "normal"], "退不出专业模式");
    assert.equal(currentPluginMode("grid"), "normal");
  });
});

test("重新打开编辑器：用记住的档位初始化内核，不是一律从普通模式起步", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find }) => {
    const { currentPluginMode, resetPluginModeCache, setPluginMode } =
      await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
    resetPluginModeCache();
    // 上一次这个用户在这件编辑器里选了专业模式。
    setPluginMode("pdf", "pro");
    assert.equal(currentPluginMode("pdf"), "pro");

    const calls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "pdf", calls));

    assert.deepEqual(
      calls,
      ["pro"],
      "打开编辑器时没有把记住的档位交给内核。" +
        "少了这一步，「按用户 × 编辑器记住」就只是 localStorage 里的一个值：" +
        "顶栏开关亮着专业模式，内核的完整 UI 却不在，两边说的话不一样。",
    );
    assert.equal(
      find('[data-plugin-mode-toggle="pdf"]').getAttribute("aria-pressed"),
      "true",
    );

    // 「另一件编辑器不受影响」在真渲染下再验一次：pdf 记住了 pro，grid 仍是普通模式。
    const gridCalls = [];
    await render(modeHost(InlineAdvancedWorkbenchHeader, "grid", gridCalls));
    assert.deepEqual(gridCalls, [], "别的编辑器被 pdf 的档位带跑了");
    assert.equal(
      find('[data-plugin-mode-toggle="grid"]').getAttribute("aria-pressed"),
      "false",
    );
  });
});

test("编辑器没声明 mode：开关置灰但不消失，并说明原因", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    resetPluginModeCache();
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({
          pluginThemeId: "game",
          // 注意：没有 mode 面。按 AdvancedEditorModeAdapter 的约定，
          // 这等于「不支持专业模式」。
          adapter: { id: "game", label: "游戏", stage: null },
        }),
      ),
    );

    const toggle = find('[data-plugin-mode-toggle="game"]');
    assert.ok(
      toggle,
      "不支持专业模式的编辑器把开关整个藏了。" +
        "看不见的能力和不存在的能力对用户是两回事，约定是置灰不消失。",
    );
    assert.equal(toggle.disabled, true, "不支持却还能点");
    assert.match(
      toggle.getAttribute("title") || "",
      /专业模式：.+/,
      "置灰了但没告诉用户为什么",
    );

    await click(toggle);
    assert.equal(
      currentPluginMode("game"),
      "normal",
      "点了置灰的开关，档位居然还是被改了",
    );
  });
});

test("不是插件的适配器：顶栏不出这个开关", async () => {
  const { InlineAdvancedWorkbenchHeader } = await loadHeader();
  await withDom(async ({ render, find }) => {
    await render(
      React.createElement(
        InlineAdvancedWorkbenchHeader,
        headerProps({ pluginThemeId: null }),
      ),
    );
    assert.ok(find("[data-advanced-workspace-actions]"), "顶栏本体没渲染出来");
    assert.equal(
      find("[data-plugin-mode-toggle]"),
      null,
      "pluginThemeId 为 null 也出开关 ⇒ 上面几条会变成恒真，锁不住任何东西",
    );
  });
});

// ─── 判据 3c：闸必须走到十件壳的真实接线（V1-red-3 / A-48） ────────────────
//
// 上面第 9–13 例编译的是 Header、测试自己把 pluginThemeId 塞进去。那锁得住
// 「Header 里的 Toggle 被撤掉」，锁不住「壳根本不把 id 传下来」。
// 下面挂的是 InlineAdvancedWorkbenchShell，id 只来自生产函数
// pluginThemeIdForAdapter(adapter.id)。

const CONCEAL_CLASS_TOKENS = new Set([
  "hidden",
  "invisible",
  "sr-only",
  "opacity-0",
  "w-0",
  "h-0",
  "max-w-0",
  "max-h-0",
]);
const FLEX_NO_SHRINK_TOKEN = "shrink-0";

function classTokenSet(node) {
  const raw = node?.getAttribute?.("class") || "";
  return new Set(String(raw).trim().split(/\s+/).filter(Boolean));
}

function concealmentOnAncestors(toggle, header) {
  let node = toggle;
  while (node) {
    if (node.hidden || node.hasAttribute("hidden")) return "hidden-attr";
    if (node.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const display = node.style?.display;
    const visibility = node.style?.visibility;
    const width = node.style?.width;
    if (
      display === "none" ||
      visibility === "hidden" ||
      width === "0" ||
      width === "0px"
    ) {
      return "inline-style";
    }
    for (const token of classTokenSet(node)) {
      if (CONCEAL_CLASS_TOKENS.has(token)) return token;
    }
    if (node === header) break;
    node = node.parentElement;
  }
  return null;
}

function flexChildHolding(header, node) {
  let current = node;
  while (current.parentElement && current.parentElement !== header) {
    current = current.parentElement;
  }
  return current;
}

function libraryItemFor(adapterId) {
  return {
    key: `creation:${adapterId}-1`,
    source: "creation",
    id: `${adapterId}-1`,
    title: adapterId,
    kind: "document",
    siteId: "study",
    favorite: false,
    meta: {},
  };
}

function shellHost(Shell, adapterId, calls) {
  function Host() {
    const [editorMode, setEditorMode] = React.useState("normal");
    return React.createElement(Shell, {
      item: libraryItemFor(adapterId),
      adapter: {
        id: adapterId,
        label: adapterId,
        stage: React.createElement("div"),
        mode: {
          current: editorMode,
          setMode: (next) => {
            calls.push(next);
            setEditorMode(next);
          },
        },
      },
      onClose() {},
    });
  }
  return React.createElement(Host);
}

function assertShellToggleVisible(find, adapterId, expectedThemeId) {
  const header = find("[data-advanced-workbench-header]");
  assert.ok(
    header,
    `${adapterId}：十件壳没把共用顶栏渲染出来（壳里那条 actionBar 被短路了）`,
  );
  const toggle = find(`[data-plugin-mode-toggle="${expectedThemeId}"]`);
  assert.ok(
    toggle,
    `${adapterId}：壳没有把 pluginThemeIdForAdapter 的非空结果交给 Header。` +
      `预期开关 id=${expectedThemeId}。V1-red-3 就是把壳里那一处改成` +
      ` pluginThemeId={null}，用户十件顶栏开关整组消失，闸却 13/13 绿。`,
  );
  assert.equal(
    toggle.tagName,
    "BUTTON",
    `${adapterId}：壳上的开关不是可点的按钮`,
  );
  const concealed = concealmentOnAncestors(toggle, header);
  assert.equal(
    concealed,
    null,
    `${adapterId}：开关还在 DOM 里，但祖先带了藏起标记 ${concealed}。` +
      `jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style，` +
      `不是在假装量了可见像素。`,
  );
  const flexItem = flexChildHolding(header, toggle);
  assert.equal(
    flexItem.parentElement,
    header,
    `${adapterId}：开关不在顶栏的直接 flex 子项里`,
  );
  assert.ok(
    classTokenSet(flexItem).has(FLEX_NO_SHRINK_TOKEN),
    `${adapterId}：顶栏里装着开关的那一列可以收缩。` +
      `本体拿 flex-1，窄屏被挤掉的必须是本体里那排键，不能是这个开关。` +
      `按钮自己带不可收缩不够——列作为 flex 子项仍可被挤成 0 宽。` +
      `jsdom 没有 layout，只钉这一列的 class token。`,
  );
  assert.ok(
    header.contains(toggle),
    `${adapterId}：开关渲染了，但不在共用顶栏里`,
  );
}

test("十件壳把 pluginThemeIdForAdapter 的非空结果交给顶栏开关", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  const { pluginThemeIdForAdapter } = await loadThemeMod();
  const pluginIds = await loadPluginThemeIds();
  assert.ok(pluginIds.length >= 10, "主题表缩到 10 以下，这条会空转");

  // 带版本后缀的 adapter id 必须归一化（生产函数的契约），不许只测裸名。
  const adapterIds = [...pluginIds, "chart-editor@1"];

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    for (const adapterId of adapterIds) {
      const expected = pluginThemeIdForAdapter(adapterId);
      assert.ok(
        expected,
        `${adapterId}：生产函数应对主题表里的件给出非空 id（否则下面恒绿）`,
      );
      resetPluginModeCache();
      await render(shellHost(InlineAdvancedWorkbenchShell, adapterId, []));
      assertShellToggleVisible(find, adapterId, expected);
    }
  });
});

test("壳遇到生产函数判为非插件的适配器：顶栏不出这个开关", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  const { pluginThemeIdForAdapter } = await loadThemeMod();
  const adapterId = "not-a-plugin-editor";
  assert.equal(
    pluginThemeIdForAdapter(adapterId),
    null,
    "这条的夹具必须是生产函数会判 null 的 id，否则在空转",
  );

  await withDom(async ({ render, find }) => {
    const { resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    resetPluginModeCache();
    await render(shellHost(InlineAdvancedWorkbenchShell, adapterId, []));
    assert.ok(
      find("[data-advanced-workbench-header]"),
      "顶栏本体没渲染出来",
    );
    assert.equal(
      find("[data-plugin-mode-toggle]"),
      null,
      "生产函数判 null 的适配器也被壳出了开关 ⇒ 上面那条会变成恒真",
    );
  });
});

test("从十件壳点开关：内核当场收到 setMode（不经 Header 夹具）", async () => {
  const { InlineAdvancedWorkbenchShell } = await loadShell();
  await withDom(async ({ render, find, click }) => {
    const { currentPluginMode, resetPluginModeCache } = await import(
      "../src/shell/plugin-chrome/plugin-mode-store.ts"
    );
    resetPluginModeCache();
    const calls = [];
    await render(shellHost(InlineAdvancedWorkbenchShell, "grid", calls));

    const toggle = find('[data-plugin-mode-toggle="grid"]');
    assert.ok(toggle, "壳上没有开关——接线断在 InlineAdvancedWorkbenchShell");
    assert.deepEqual(calls, [], "刚打开、两边同档，不该推送");

    await click(toggle);
    assert.deepEqual(
      calls,
      ["pro"],
      "从壳点了开关，内核没收到 setMode('pro')。" +
        "Header 夹具那条能绿、这条红，说明桥只在测试自己塞的 Header 上活着。",
    );
    assert.equal(currentPluginMode("grid"), "pro");

    await click(find('[data-plugin-mode-toggle="grid"]'));
    assert.deepEqual(calls, ["pro", "normal"]);
  });
});
